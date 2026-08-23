// src/pptx-normalizer.js
import { buildTimingXml } from './animations/xml-templates.js';
import { getTransitionXml } from './animations/transitions.js';
//
// Defensive OOXML normalizer that runs over the PPTX produced by PptxGenJS
// before we hand the .pptx blob to the user. Microsoft PowerPoint refuses to
// open files when [Content_Types].xml advertises parts that are not actually
// present in the package — see 错误诊断.md for the original incident report.
//
// This module operates on an already-loaded JSZip instance and mutates it in
// place. The caller is responsible for re-serializing the zip with DEFLATE
// compression afterwards.

const pPrOrder = [
  'lnSpc',
  'spcBef',
  'spcAft',
  'buClrTx',
  'buClr',
  'buSzTx',
  'buSzPct',
  'buSzPts',
  'buFontTx',
  'buFont',
  'buNone',
  'buAutoNum',
  'buChar',
  'buBlip',
  'tabLst',
  'defRPr',
  'extLst',
];

/**
 * Strips dangling <Override> entries from [Content_Types].xml.
 *
 * An Override is "dangling" when its PartName attribute references a file path
 * that does not exist inside the zip. Default entries are left untouched
 * because they apply to every file with a matching extension, and removing
 * them would break legitimate parts (e.g. the fntdata default added by the
 * font embedder).
 *
 * The function is idempotent: running it twice on the same zip yields the
 * same result as running it once.
 *
 * @param {import('jszip')} zip - JSZip instance with the loaded PPTX package.
 * @returns {Promise<void>}
 */
export async function normalizePptxZip(zip, options = {}) {
  if (!zip) return;

  const contentTypesFile = zip.file('[Content_Types].xml');
  if (!contentTypesFile) return;

  let xmlStr;
  try {
    xmlStr = await contentTypesFile.async('string');
  } catch (e) {
    console.warn('[pptx-normalizer] Failed to read [Content_Types].xml:', e);
    return;
  }

  let doc;
  try {
    doc = new DOMParser().parseFromString(xmlStr, 'text/xml');
  } catch (e) {
    console.warn('[pptx-normalizer] Failed to parse [Content_Types].xml:', e);
    return;
  }

  const parserError = doc.getElementsByTagName('parsererror')[0];
  if (parserError) {
    console.warn('[pptx-normalizer] [Content_Types].xml has parser errors, skipping cleanup.');
    return;
  }

  const overrides = Array.from(doc.getElementsByTagName('Override'));
  let removedCount = 0;

  for (const node of overrides) {
    const partName = node.getAttribute('PartName');
    if (!partName) continue;

    // PartName is always an absolute path inside the zip, e.g. "/ppt/slideMasters/slideMaster2.xml".
    // JSZip indexes its files without the leading slash.
    const zipPath = partName.startsWith('/') ? partName.slice(1) : partName;

    if (!zip.file(zipPath)) {
      node.parentNode?.removeChild(node);
      removedCount++;
    }
  }

  if (removedCount > 0) {
    const serialized = serializeXmlWithDeclaration(doc);
    zip.file('[Content_Types].xml', serialized);
  }

  // Process all XML files inside the ppt/ directory
  for (const [relativePath, file] of Object.entries(zip.files)) {
    if (relativePath.startsWith('ppt/') && relativePath.endsWith('.xml')) {
      let xmlStr = await file.async('string');
      let doc;
      try {
        doc = new DOMParser().parseFromString(xmlStr, 'text/xml');
      } catch (e) {
        console.warn(`[pptx-normalizer] Failed to parse ${relativePath}:`, e);
        continue;
      }

      const parserError = doc.getElementsByTagName('parsererror')[0];
      if (parserError) {
        console.warn(`[pptx-normalizer] ${relativePath} has parser errors, skipping.`);
        continue;
      }

      let mutated = false;

      if (cleanParagraphProperties(doc)) {
        mutated = true;
      }

      if (restoreCharSpacing(doc)) {
        mutated = true;
      }

      if (relativePath.startsWith('ppt/slides/slide')) {
        const slideMatch = relativePath.match(/ppt\/slides\/slide(\d+)\.xml/);
        const slideIndex = slideMatch ? parseInt(slideMatch[1], 10) - 1 : -1;

        if (slideIndex >= 0) {
          if (options._slideTransitions && options._slideTransitions[slideIndex]) {
            if (applySlideTransitions(doc, slideIndex, options)) {
              mutated = true;
            }
          }
          if (options._slideAnimations) {
            if (applySlideAnimations(doc, slideIndex, options)) {
              mutated = true;
            }
          }
        }

        if (sortSpTree(doc)) {
          mutated = true;
        }
      }

      if (mutated) {
        const serialized = serializeXmlWithDeclaration(doc);
        zip.file(relativePath, serialized);
      }
    }
  }
}

function cleanParagraphProperties(doc) {
  let mutated = false;
  const elements = Array.from(doc.getElementsByTagName('*'));
  const paragraphs = elements.filter((n) => n.localName === 'p');

  for (const p of paragraphs) {
    const pPrs = Array.from(p.childNodes).filter((node) => node.nodeType === 1 && node.localName === 'pPr');
    if (pPrs.length > 0) {
      const targetPPr = pPrs[0];

      // Merge subsequent pPr elements
      if (pPrs.length > 1) {
        for (let i = 1; i < pPrs.length; i++) {
          const sourcePPr = pPrs[i];
          // merge attributes
          for (const attr of Array.from(sourcePPr.attributes)) {
            if (targetPPr.getAttribute(attr.name) !== attr.value) {
              targetPPr.setAttribute(attr.name, attr.value);
            }
          }
          // merge children
          while (sourcePPr.firstChild) {
            targetPPr.appendChild(sourcePPr.firstChild);
          }
          p.removeChild(sourcePPr);
          mutated = true;
        }
      }

      // Resolve duplicate child elements in targetPPr (keep the last one of each localName)
      const childElements = Array.from(targetPPr.childNodes).filter((node) => node.nodeType === 1);
      const seen = new Map();
      for (let i = childElements.length - 1; i >= 0; i--) {
        const child = childElements[i];
        const key = child.localName;
        if (seen.has(key)) {
          targetPPr.removeChild(child);
          mutated = true;
        } else {
          seen.set(key, child);
        }
      }

      // Ensure mutual exclusivity of bullet elements (buNone, buChar, buAutoNum, buBlip)
      const hasActiveBullet = Array.from(targetPPr.childNodes).some(
        (node) => node.nodeType === 1 && ['buChar', 'buAutoNum', 'buBlip'].includes(node.localName)
      );
      if (hasActiveBullet) {
        const buNones = Array.from(targetPPr.childNodes).filter(
          (node) => node.nodeType === 1 && node.localName === 'buNone'
        );
        for (const buNone of buNones) {
          targetPPr.removeChild(buNone);
          mutated = true;
        }
      }

      // Sort children of targetPPr
      const finalChildren = Array.from(targetPPr.childNodes).filter((node) => node.nodeType === 1);
      const sortedChildren = [...finalChildren].sort((a, b) => {
        const idxA = pPrOrder.indexOf(a.localName);
        const idxB = pPrOrder.indexOf(b.localName);
        const orderA = idxA !== -1 ? idxA : 999;
        const orderB = idxB !== -1 ? idxB : 999;
        return orderA - orderB;
      });

      let needsReorder = false;
      for (let i = 0; i < finalChildren.length; i++) {
        if (finalChildren[i] !== sortedChildren[i]) {
          needsReorder = true;
          break;
        }
      }

      if (needsReorder) {
        while (targetPPr.firstChild) {
          targetPPr.removeChild(targetPPr.firstChild);
        }
        for (const child of sortedChildren) {
          targetPPr.appendChild(child);
        }
        mutated = true;
      }

      // Ensure targetPPr is the first child element of p
      const firstElementChild = Array.from(p.childNodes).find((node) => node.nodeType === 1);
      if (firstElementChild && firstElementChild !== targetPPr) {
        p.insertBefore(targetPPr, firstElementChild);
        mutated = true;
      }
    }
  }
  return mutated;
}

function restoreCharSpacing(doc) {
  let mutated = false;
  const elements = Array.from(doc.getElementsByTagName('*'));
  const typefaceElements = elements.filter(
    (n) => n.hasAttribute('typeface') && n.getAttribute('typeface').includes('__spc_')
  );

  for (const el of typefaceElements) {
    const typeface = el.getAttribute('typeface');
    const parts = typeface.split('__spc_');
    el.setAttribute('typeface', parts[0]);
    mutated = true;

    // Find the parent rPr or defRPr or endParaRPr to set 'spc'
    let parent = el.parentNode;
    if (parent && (parent.localName === 'rPr' || parent.localName === 'defRPr' || parent.localName === 'endParaRPr')) {
      const spcVal = parts[1];
      if (parent.getAttribute('spc') !== spcVal) {
        parent.setAttribute('spc', spcVal);
      }
    }
  }
  return mutated;
}

function sortSpTree(doc) {
  let mutated = false;
  const elements = Array.from(doc.getElementsByTagName('*'));
  const spTrees = elements.filter((n) => n.localName === 'spTree');

  for (const spTree of spTrees) {
    const childNodes = Array.from(spTree.childNodes);
    const elementChildren = childNodes.filter((node) => node.nodeType === 1);

    const firstElements = [];
    const lastElements = [];
    const visualElements = [];

    for (const el of elementChildren) {
      const localName = el.localName;
      if (localName === 'nvGrpSpPr' || localName === 'grpSpPr') {
        firstElements.push(el);
      } else if (localName === 'extLst') {
        lastElements.push(el);
      } else {
        visualElements.push(el);
      }
    }

    // Parse z-order for visualElements
    const elementInfos = visualElements.map((el, originalIndex) => {
      let zVal = Infinity;
      let domVal = originalIndex;

      // Find cNvPr element
      let cNvPr = null;
      const nvPr = Array.from(el.childNodes).find((n) => n.nodeType === 1 && n.localName.startsWith('nv'));
      if (nvPr) {
        cNvPr = Array.from(nvPr.childNodes).find((n) => n.nodeType === 1 && n.localName === 'cNvPr');
      }
      if (!cNvPr) {
        cNvPr = Array.from(el.getElementsByTagName('*')).find((n) => n.localName === 'cNvPr');
      }

      if (cNvPr) {
        const descr = cNvPr.getAttribute('descr') || '';
        const nameAttr = cNvPr.getAttribute('name') || '';
        let hasVal = false;

        const descrMatch = descr.match(/^__z_(\d+)__dom_(\d+)(.*)/);
        if (descrMatch) {
          zVal = parseInt(descrMatch[1], 10);
          domVal = parseInt(descrMatch[2], 10);
          hasVal = true;
          const userText = descrMatch[3].trim();
          if (userText) {
            cNvPr.setAttribute('descr', userText);
          } else {
            cNvPr.removeAttribute('descr');
          }
          mutated = true;
        }

        const nameMatch =
          nameAttr.match(/^__z_(\d+)__dom_(\d+)__type_([^_]*)/) || nameAttr.match(/^__z_(\d+)__dom_(\d+)(.*)/);
        if (nameMatch) {
          if (!hasVal) {
            zVal = parseInt(nameMatch[1], 10);
            domVal = parseInt(nameMatch[2], 10);
          }

          let shapeName;
          if (nameAttr.includes('__type_')) {
            // New format: __z_N__dom_N__type_TYPE — use type to set a proper name
            const typeSegment = nameMatch[3] || '';
            const typePrefix =
              typeSegment === 'text'
                ? 'TextBox'
                : typeSegment === 'image'
                  ? 'Picture'
                  : typeSegment === 'table'
                    ? 'Table'
                    : typeSegment === 'line'
                      ? 'Line'
                      : typeSegment === 'shape'
                        ? 'Shape'
                        : 'Shape';
            shapeName = `${typePrefix} ${domVal + 1}`;
          } else {
            // Old format: __z_N__dom_N [optional user text]
            const userText = (nameMatch[3] || '').trim();
            shapeName = userText || `Shape ${domVal + 1}`;
          }

          cNvPr.setAttribute('name', shapeName);
          mutated = true;
        }
      }
      return { el, zVal, domVal, originalIndex };
    });

    // Sort visualElements
    elementInfos.sort((a, b) => {
      if (a.zVal !== b.zVal) {
        return a.zVal - b.zVal;
      }
      return a.domVal - b.domVal;
    });

    const sortedVisualElements = elementInfos.map((info) => info.el);

    // Check if the order has changed
    let orderChanged = false;
    for (let i = 0; i < visualElements.length; i++) {
      if (visualElements[i] !== sortedVisualElements[i]) {
        orderChanged = true;
        break;
      }
    }

    if (orderChanged) {
      // Re-construct spTree children
      while (spTree.firstChild) {
        spTree.removeChild(spTree.firstChild);
      }

      for (const el of firstElements) {
        spTree.appendChild(el);
      }
      for (const el of sortedVisualElements) {
        spTree.appendChild(el);
      }
      for (const el of lastElements) {
        spTree.appendChild(el);
      }
      mutated = true;
    }
  }
  return mutated;
}

export function serializeXmlWithDeclaration(doc) {
  let serialized = new XMLSerializer().serializeToString(doc);
  if (!serialized.startsWith('<?xml')) {
    serialized = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + serialized;
  }
  return serialized;
}

function applySlideAnimations(doc, slideIndex, options) {
  const slideAnimations = options._slideAnimations?.[slideIndex];
  if (!slideAnimations || slideAnimations.length === 0) return false;

  const domToSpIdMap = new Map();
  const textBoxSpIds = new Set();

  // Find all cNvPr elements to build the mapping from domVal to spId
  const cNvPrs = Array.from(doc.getElementsByTagName('*')).filter((n) => n.localName === 'cNvPr');

  for (const cNvPr of cNvPrs) {
    const descr = cNvPr.getAttribute('descr') || '';
    const nameAttr = cNvPr.getAttribute('name') || '';
    const spId = cNvPr.getAttribute('id');
    if (!spId) continue;

    const descrMatch = descr.match(/^__z_(\d+)__dom_(\d+)(.*)/);
    const nameMatch = nameAttr.match(/^__z_(\d+)__dom_(\d+)(.*)/);

    let domVal = null;
    if (descrMatch) {
      domVal = parseInt(descrMatch[2], 10);
    } else if (nameMatch) {
      domVal = parseInt(nameMatch[2], 10);
    }

    if (domVal !== null && !isNaN(domVal)) {
      if (!domToSpIdMap.has(domVal)) {
        domToSpIdMap.set(domVal, []);
      }
      domToSpIdMap.get(domVal).push(spId);

      // Check if this cNvPr's shape represents a TextBox (has <p:txBody>)
      // Structure: <p:sp> -> <p:nvSpPr> -> <p:cNvPr>
      const grandParent = cNvPr.parentNode?.parentNode;
      if (grandParent) {
        const hasTxBody = Array.from(grandParent.childNodes).some(
          (child) => child.nodeType === 1 && child.localName === 'txBody'
        );
        if (hasTxBody) {
          textBoxSpIds.add(spId);
        }
      }
    }
  }

  // Build the p:timing XML block
  const timingXml = buildTimingXml(slideAnimations, domToSpIdMap, textBoxSpIds);
  if (!timingXml) return false;

  let timingDoc;
  try {
    timingDoc = new DOMParser().parseFromString(timingXml, 'text/xml');
  } catch (e) {
    console.warn('[pptx-normalizer] Failed to parse timing XML string:', e);
    return false;
  }

  const parserError = timingDoc.getElementsByTagName('parsererror')[0];
  if (parserError) {
    console.warn('[pptx-normalizer] Timing XML parsing failed:', parserError.textContent);
    return false;
  }

  const timingNode = doc.importNode(timingDoc.documentElement, true);
  const sld = doc.documentElement;

  // Find where to insert (before extLst if exists)
  const extLst = Array.from(sld.childNodes).find((n) => n.nodeType === 1 && n.localName === 'extLst');

  if (extLst) {
    sld.insertBefore(timingNode, extLst);
  } else {
    sld.appendChild(timingNode);
  }

  return true;
}

/**
 * Injects a transition node into the slide XML.
 */
function applySlideTransitions(doc, slideIndex, options) {
  const transitionData = options._slideTransitions[slideIndex];
  if (!transitionData) return false;

  const transitionXml = getTransitionXml(transitionData);
  if (!transitionXml) return false;

  const sldNode = doc.documentElement;

  // Parse the transition XML fragment
  const tmpDoc = new DOMParser().parseFromString(
    `<root xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">${transitionXml}</root>`,
    'text/xml'
  );

  const parserError = tmpDoc.getElementsByTagName('parsererror')[0];
  if (parserError) {
    console.warn('[pptx-normalizer] Transition XML parsing failed:', parserError.textContent);
    return false;
  }

  const transitionNode = tmpDoc.documentElement.firstChild;
  if (!transitionNode) return false;

  const importedNode = doc.importNode(transitionNode, true);

  const isP14 = transitionXml.includes('p14:');
  const isP15 = transitionXml.includes('p15:');
  let finalNode;

  if (isP14 || isP15) {
    const prefix = isP15 ? 'p15' : 'p14';
    const nsPrefixUri =
      prefix === 'p14'
        ? 'http://schemas.microsoft.com/office/powerpoint/2010/main'
        : 'http://schemas.microsoft.com/office/powerpoint/2012/main';
    const spd = transitionNode.getAttribute('spd') || transitionData.spd || 'med';

    const altXml = `
      <mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <mc:Choice xmlns:${prefix}="${nsPrefixUri}" Requires="${prefix}">
          ${transitionXml}
        </mc:Choice>
        <mc:Fallback>
          <p:transition xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" spd="${spd}">
            <p:fade/>
          </p:transition>
        </mc:Fallback>
      </mc:AlternateContent>
    `.trim();

    const altDoc = new DOMParser().parseFromString(altXml, 'text/xml');
    const altParserError = altDoc.getElementsByTagName('parsererror')[0];
    if (altParserError) {
      console.warn('[pptx-normalizer] AlternateContent XML parsing failed:', altParserError.textContent);
      return false;
    }

    finalNode = doc.importNode(altDoc.documentElement, true);

    // Add required namespaces to slide root if they aren't on the root
    if (!sldNode.getAttribute('xmlns:mc')) {
      sldNode.setAttribute('xmlns:mc', 'http://schemas.openxmlformats.org/markup-compatibility/2006');
    }
    if (!sldNode.getAttribute(`xmlns:${prefix}`)) {
      sldNode.setAttribute(`xmlns:${prefix}`, nsPrefixUri);
    }
    const currentIgnorable = sldNode.getAttribute('mc:Ignorable') || '';
    const existingIgnorables = currentIgnorable.split(/\s+/).filter(Boolean);
    if (!existingIgnorables.includes(prefix)) {
      existingIgnorables.push(prefix);
      sldNode.setAttribute('mc:Ignorable', existingIgnorables.join(' '));
    }
  } else {
    finalNode = importedNode;
  }

  // The transition node (or mc:AlternateContent) must be inserted in the correct OOXML schema order:
  // p:cSld, p:clrMapOvr, p:transition, p:timing, p:extLst
  // So we insert it before p:timing, p:hf, or p:extLst. If none exist, we append it.
  const insertBeforeTags = ['p:timing', 'p:hf', 'p:extLst'];
  let insertRef = null;
  for (const tag of insertBeforeTags) {
    const el = doc.getElementsByTagName(tag)[0];
    if (el && el.parentNode === sldNode) {
      insertRef = el;
      break;
    }
  }

  if (insertRef) {
    sldNode.insertBefore(finalNode, insertRef);
  } else {
    sldNode.appendChild(finalNode);
  }

  return true;
}
