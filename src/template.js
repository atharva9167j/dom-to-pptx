// src/template.js
//
// Optional support for basing a dom-to-pptx export on an existing .pptx
// "template" file, so exported slides inherit a real PowerPoint slide
// layout / master background (theme, logos, footers, ...) instead of
// getting a blank PptxGenJS-generated layout.
//
// PptxGenJS cannot load an existing .pptx, so this module implements a
// small, generic "generate then merge" OOXML adapter on top of JSZip:
// dom-to-pptx renders slides exactly as before (via the unmodified
// processSlide() renderer) into a throwaway PptxGenJS package, and this
// module copies just the resulting <ppt/slides/*>, <ppt/notesSlides/*>
// and referenced <ppt/media/*> parts into the caller's template package,
// rewiring each new slide's slideLayout relationship to point at a real
// layout from the template. Everything else in the template (theme,
// slideMasters, slideLayouts, media, presentation.xml, existing slides)
// is left untouched.
import JSZip from 'jszip';
import { serializeXmlWithDeclaration } from './pptx-normalizer.js';

const EMU_PER_INCH = 914400;
const CONTENT_TYPES_PATH = '[Content_Types].xml';
const PRESENTATION_PATH = 'ppt/presentation.xml';
const PRESENTATION_RELS_PATH = 'ppt/_rels/presentation.xml.rels';

const CT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const P_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const SLIDE_REL_TYPE = `${R_NS}/slide`;
const SLIDELAYOUT_REL_TYPE = `${R_NS}/slideLayout`;
const NOTESSLIDE_REL_TYPE = `${R_NS}/notesSlide`;
const NOTESMASTER_REL_TYPE = `${R_NS}/notesMaster`;
const IMAGE_REL_TYPE = `${R_NS}/image`;
const FONT_REL_TYPE = `${R_NS}/font`;
const FNTDATA_CONTENT_TYPE = 'application/x-fontdata';

// CT_Presentation child element order per the OOXML schema (ECMA-376
// §19.2.1.26) — used so <p:embeddedFontLst> is inserted at a schema-valid
// position instead of always appended at the end, which would produce an
// invalid package for any template whose presentation.xml has elements
// after where embeddedFontLst belongs (e.g. custShowLst, defaultTextStyle).
const PRESENTATION_CHILD_ORDER = [
  'sldMasterIdLst',
  'notesMasterIdLst',
  'handoutMasterIdLst',
  'sldIdLst',
  'sldSz',
  'notesSz',
  'smartTags',
  'embeddedFontLst',
  'custShowLst',
  'photoAlbum',
  'custDataLst',
  'kinsoku',
  'defaultTextStyle',
  'modifyVerifier',
  'extLst',
];

// CT_EmbeddedFontListEntry child order: <p:font> then up to one of each
// variant slot, in this fixed order.
const EMBEDDED_FONT_CHILD_ORDER = ['font', 'regular', 'bold', 'italic', 'boldItalic'];

/**
 * Loads a JSZip instance from a `template` option value.
 * Accepts a URL string (fetched with `fetch`), an ArrayBuffer, a
 * Uint8Array, or a Blob. Node-side callers (the CLI / node-exporter) are
 * responsible for turning a local file path into one of these before it
 * reaches this function, since this module runs inside the same
 * browser/jsdom/puppeteer-page context as the rest of dom-to-pptx.
 */
async function loadZipFromSource(source) {
  if (source instanceof Uint8Array || source instanceof ArrayBuffer) {
    return JSZip.loadAsync(source);
  }
  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    return JSZip.loadAsync(await source.arrayBuffer());
  }
  if (typeof source === 'string') {
    let response;
    try {
      response = await fetch(source);
    } catch (e) {
      throw new Error(`dom-to-pptx: failed to fetch template "${source}": ${e.message}`, { cause: e });
    }
    if (!response.ok) {
      throw new Error(`dom-to-pptx: failed to fetch template "${source}" (HTTP ${response.status})`);
    }
    return JSZip.loadAsync(await response.arrayBuffer());
  }
  throw new Error(
    'dom-to-pptx: invalid `template` option — expected a URL string, ArrayBuffer, Uint8Array, or Blob containing a .pptx file.'
  );
}

function parseXml(str, context) {
  const doc = new DOMParser().parseFromString(str, 'text/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) {
    throw new Error(`dom-to-pptx: failed to parse XML in template (${context}): ${err.textContent}`);
  }
  return doc;
}

function findFirstByLocalName(doc, localName) {
  return Array.from(doc.getElementsByTagName('*')).find((n) => n.localName === localName) || null;
}

function findAllByLocalName(doc, localName) {
  return Array.from(doc.getElementsByTagName('*')).filter((n) => n.localName === localName);
}

function directChildrenByLocalName(el, localName) {
  return Array.from(el.childNodes).filter((n) => n.nodeType === 1 && n.localName === localName);
}

/** Path of the `.rels` part that owns `partPath` (e.g. "ppt/slideMasters/slideMaster1.xml" -> "ppt/slideMasters/_rels/slideMaster1.xml.rels"). */
function relsPathFor(partPath) {
  const slash = partPath.lastIndexOf('/');
  const dir = partPath.slice(0, slash);
  const fileName = partPath.slice(slash + 1);
  return `${dir}/_rels/${fileName}.rels`;
}

/** Reads a `.rels` part (if present) into a Map of rId -> {type, target}. */
async function readRelationshipMap(zip, relsPath) {
  const file = zip.file(relsPath);
  const map = new Map();
  if (!file) return map;
  const doc = parseXml(await file.async('string'), relsPath);
  for (const rel of getRelationships(doc)) {
    map.set(rel.getAttribute('Id'), { type: rel.getAttribute('Type'), target: rel.getAttribute('Target') });
  }
  return map;
}

/** Reads the single r:id attribute off an element, regardless of which prefix declared the relationships namespace. */
function readRId(el) {
  return el.getAttributeNS(R_NS, 'id') || el.getAttribute('r:id');
}

/**
 * Resolves the slide layouts actually reachable from `presentation.xml`, in
 * the order PowerPoint itself would present them: slide masters in
 * `<p:sldMasterIdLst>` declaration order, each master's own layouts in its
 * `<p:sldLayoutIdLst>` declaration order. Orphaned `slideLayoutN.xml` files
 * that no master links to are never visited, so they can't affect layout
 * selection. Any declared `r:id` that fails to resolve — a missing
 * relationship entry or a relationship target that doesn't exist in the
 * package — throws a descriptive error naming the part and the dangling id,
 * since silently skipping it would make layout selection depend on
 * whichever files happen to be well-linked.
 */
async function resolveDeclaredLayouts(zip, presDoc, presRelsMap) {
  const sldMasterIdLst = findFirstByLocalName(presDoc, 'sldMasterIdLst');
  if (!sldMasterIdLst) {
    throw new Error(
      'dom-to-pptx: template presentation.xml is missing <p:sldMasterIdLst>; this is not a valid PowerPoint package.'
    );
  }

  const layouts = [];
  for (const sldMasterId of directChildrenByLocalName(sldMasterIdLst, 'sldMasterId')) {
    const masterRId = readRId(sldMasterId);
    const masterRel = presRelsMap.get(masterRId);
    if (!masterRel) {
      throw new Error(
        `dom-to-pptx: template presentation.xml declares slide master relationship "${masterRId}" which is missing ` +
          'from ppt/_rels/presentation.xml.rels. Is this a valid PowerPoint file?'
      );
    }
    const masterPath = resolveRelativeTarget('ppt', masterRel.target);
    const masterFile = zip.file(masterPath);
    if (!masterFile) {
      throw new Error(
        `dom-to-pptx: template declares slide master "${masterPath}" in presentation.xml, but that part is missing ` +
          'from the package.'
      );
    }
    const masterDoc = parseXml(await masterFile.async('string'), masterPath);
    const masterDir = masterPath.slice(0, masterPath.lastIndexOf('/'));
    const masterRelsMap = await readRelationshipMap(zip, relsPathFor(masterPath));

    const sldLayoutIdLst = findFirstByLocalName(masterDoc, 'sldLayoutIdLst');
    if (!sldLayoutIdLst) continue; // a master with no layouts declared is unusual but not fatal

    for (const sldLayoutId of directChildrenByLocalName(sldLayoutIdLst, 'sldLayoutId')) {
      const layoutRId = readRId(sldLayoutId);
      const layoutRel = masterRelsMap.get(layoutRId);
      if (!layoutRel) {
        throw new Error(
          `dom-to-pptx: template "${masterPath}" declares slide layout relationship "${layoutRId}" which is ` +
            `missing from ${relsPathFor(masterPath)}. Is this a valid PowerPoint file?`
        );
      }
      const layoutPath = resolveRelativeTarget(masterDir, layoutRel.target);
      const layoutFile = zip.file(layoutPath);
      if (!layoutFile) {
        throw new Error(
          `dom-to-pptx: template declares slide layout "${layoutPath}" in "${masterPath}", but that part is ` +
            'missing from the package.'
        );
      }
      const layoutDoc = parseXml(await layoutFile.async('string'), layoutPath);
      const cSld = directChildrenByLocalName(layoutDoc.documentElement, 'cSld')[0];
      const name = cSld ? cSld.getAttribute('name') || '' : '';
      layouts.push({ name, id: layoutPath });
    }
  }

  return layouts;
}

/**
 * Resolves the notes master part actually referenced by `presentation.xml`'s
 * `<p:notesMasterIdLst>`, rather than assuming the numerically-first
 * `notesMasterN.xml` file. Returns `null` when the template declares no
 * notes master at all (some templates have none); throws when one is
 * declared but its relationship can't be resolved.
 */
function resolveDeclaredNotesMaster(zip, presDoc, presRelsMap) {
  const notesMasterIdLst = findFirstByLocalName(presDoc, 'notesMasterIdLst');
  if (!notesMasterIdLst) return null;
  const notesMasterId = directChildrenByLocalName(notesMasterIdLst, 'notesMasterId')[0];
  if (!notesMasterId) return null;

  const rId = readRId(notesMasterId);
  const rel = presRelsMap.get(rId);
  if (!rel) {
    throw new Error(
      `dom-to-pptx: template presentation.xml declares notes master relationship "${rId}" which is missing from ` +
        'ppt/_rels/presentation.xml.rels. Is this a valid PowerPoint file?'
    );
  }
  const notesMasterPath = resolveRelativeTarget('ppt', rel.target);
  if (!zip.file(notesMasterPath)) {
    throw new Error(
      `dom-to-pptx: template declares notes master "${notesMasterPath}" in presentation.xml, but that part is ` +
        'missing from the package.'
    );
  }
  return notesMasterPath;
}

function numberedParts(zip, regex) {
  return Object.keys(zip.files)
    .map((p) => {
      const m = p.match(regex);
      return m ? { path: p, num: parseInt(m[1], 10) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.num - b.num);
}

function maxNum(parts) {
  return parts.reduce((max, p) => Math.max(max, p.num), 0);
}

/**
 * Resolves an OOXML relative Target (e.g. "../media/image1.png") found in
 * a rels file against the directory of the part that owns the rels file
 * (e.g. "ppt/slides"), per the OPC relative-reference convention.
 */
function resolveRelativeTarget(fromDir, target) {
  const parts = fromDir.split('/').filter(Boolean);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg === '.' || seg === '') continue;
    else parts.push(seg);
  }
  return parts.join('/');
}

/**
 * Inserts `newEl` as a child of `parent` at the position dictated by
 * `orderArray` (a list of localNames in schema order): before the first
 * existing child whose localName sorts later than `newEl`'s, or appended
 * at the end if none do. Existing children whose localName isn't in
 * `orderArray` (foreign/unrecognized elements) are ignored for ordering
 * purposes rather than treated as a hard stop. Shared by the
 * <p:presentation> child ordering (embeddedFontLst) and the
 * <p:embeddedFont> variant ordering (regular/bold/italic/boldItalic).
 */
function insertInOrder(parent, newEl, orderArray) {
  const newIdx = orderArray.indexOf(newEl.localName);
  let refNode = null;
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType !== 1) continue;
    const idx = orderArray.indexOf(child.localName);
    if (idx === -1 || idx <= newIdx) continue;
    refNode = child;
    break;
  }
  if (refNode) parent.insertBefore(newEl, refNode);
  else parent.appendChild(newEl);
}

/** Inverse of resolveRelativeTarget: builds a relative Target from fromDir to an absolute zip path. */
function relativeTarget(fromDir, toPath) {
  const fromParts = fromDir.split('/').filter(Boolean);
  const toParts = toPath.split('/').filter(Boolean);
  let i = 0;
  while (i < fromParts.length && i < toParts.length - 1 && fromParts[i] === toParts[i]) i++;
  const up = fromParts.length - i;
  const down = toParts.slice(i);
  return '../'.repeat(up) + down.join('/');
}

/**
 * Reads a template .pptx and extracts the information needed to base
 * slides on it: the available slide layouts (name + OOXML part path),
 * the notes master part path, and the declared slide size.
 *
 * @param {string|ArrayBuffer|Uint8Array|Blob} source
 * @returns {Promise<{zip: JSZip, layouts: Array<{name: string, id: string}>, notesMasterId: string|null, sldSz: {width: number, height: number}|null}>}
 */
export async function readTemplate(source) {
  const zip = await loadZipFromSource(source);

  const presFile = zip.file(PRESENTATION_PATH);
  if (!presFile) {
    throw new Error(
      'dom-to-pptx: the provided `template` does not contain ppt/presentation.xml. Is this a valid .pptx file?'
    );
  }
  const presDoc = parseXml(await presFile.async('string'), PRESENTATION_PATH);
  const presRelsMap = await readRelationshipMap(zip, PRESENTATION_RELS_PATH);

  const layouts = await resolveDeclaredLayouts(zip, presDoc, presRelsMap);
  if (layouts.length === 0) {
    throw new Error(
      'dom-to-pptx: the provided `template` does not declare any reachable PowerPoint slide layouts ' +
        '(via presentation.xml -> slide master(s) -> sldLayoutIdLst). Is this a valid .pptx file?'
    );
  }

  const notesMasterId = resolveDeclaredNotesMaster(zip, presDoc, presRelsMap);

  let sldSz = null;
  const sldSzEl = findFirstByLocalName(presDoc, 'sldSz');
  if (sldSzEl) {
    const cx = parseInt(sldSzEl.getAttribute('cx'), 10);
    const cy = parseInt(sldSzEl.getAttribute('cy'), 10);
    if (!isNaN(cx) && !isNaN(cy)) {
      sldSz = { width: cx / EMU_PER_INCH, height: cy / EMU_PER_INCH };
    }
  }

  return { zip, layouts, notesMasterId, sldSz };
}

/**
 * Resolves a `baseLayout` name to a template layout, falling back to
 * `defaultLayoutName`, then to the template's first declared layout.
 * Throws a descriptive error (listing available layout names) when a
 * requested name isn't found.
 */
export function resolveLayout(templateInfo, layoutName, defaultLayoutName) {
  const { layouts } = templateInfo;
  const requestedName = layoutName || defaultLayoutName;

  if (!requestedName) {
    return layouts[0];
  }

  const match = layouts.find((l) => l.name === requestedName);
  if (!match) {
    const available = layouts.map((l) => `"${l.name}"`).join(', ') || '(none found)';
    throw new Error(
      `dom-to-pptx: PowerPoint layout "${requestedName}" was not found in template. Available layouts: ${available}`
    );
  }
  return match;
}

/**
 * Lists the slide layouts available in a template .pptx. Small
 * convenience wrapper around readTemplate() for callers that only need
 * to introspect a template (e.g. to build a layout picker UI upstream of
 * dom-to-pptx). Must run in the same browser/jsdom context as
 * exportToPptx (uses `fetch` and `DOMParser`).
 *
 * @param {string|ArrayBuffer|Uint8Array|Blob} source
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getTemplateLayouts(source) {
  const { layouts } = await readTemplate(source);
  return layouts.map(({ name, id }) => ({ id, name }));
}

function getRelationships(doc) {
  return findAllByLocalName(doc, 'Relationship');
}

function maxRelIdNum(doc) {
  let max = 0;
  for (const rel of getRelationships(doc)) {
    const m = (rel.getAttribute('Id') || '').match(/^rId(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

function findOverrideContentType(doc, partName) {
  const found = findAllByLocalName(doc, 'Override').find((n) => n.getAttribute('PartName') === partName);
  return found ? found.getAttribute('ContentType') : null;
}

function findDefaultContentType(doc, ext) {
  const found = findAllByLocalName(doc, 'Default').find((n) => n.getAttribute('Extension') === ext);
  return found ? found.getAttribute('ContentType') : null;
}

/**
 * Merges pre-converted embedded fonts (see PPTXEmbedFonts.fonts —
 * `{name, variant, data}`, already fetched and converted to .fntdata) into
 * the template's own <p:embeddedFontLst>. Deduplicates by (typeface,
 * variant) against whatever the template already has embedded — an
 * existing entry is never removed, overwritten, or re-embedded. New font
 * files are numbered past whatever `ppt/fonts/fontN.fntdata` files the
 * template already contains, and relationship IDs are allocated through
 * the same collision-free counter used for the new slides, so this never
 * collides with the template's own (possibly already-high) rIds.
 */
function mergeFonts({ presDoc, templateZip, addPresRelationship, ensureDefaultExtensionWithType, fontsToEmbed }) {
  let embeddedFontLst = findFirstByLocalName(presDoc, 'embeddedFontLst');
  if (!embeddedFontLst) {
    embeddedFontLst = presDoc.createElementNS(P_NS, 'p:embeddedFontLst');
    insertInOrder(presDoc.documentElement, embeddedFontLst, PRESENTATION_CHILD_ORDER);
  }

  // Index what's already embedded (from the template itself, and from any
  // earlier <p:embeddedFont> this function may have just created) so a
  // (typeface, variant) already present is never duplicated, and so a new
  // variant for an already-declared typeface is added to that same
  // <p:embeddedFont> block rather than a second, conflicting one.
  const embedFontElByTypeface = new Map();
  const existingVariantKeys = new Set();
  for (const embedFontEl of findAllByLocalName(embeddedFontLst, 'embeddedFont')) {
    const fontEl = Array.from(embedFontEl.childNodes).find((n) => n.nodeType === 1 && n.localName === 'font');
    const typeface = fontEl ? fontEl.getAttribute('typeface') : null;
    if (!typeface) continue;
    embedFontElByTypeface.set(typeface, embedFontEl);
    for (const child of Array.from(embedFontEl.childNodes)) {
      if (child.nodeType === 1 && child.localName !== 'font' && EMBEDDED_FONT_CHILD_ORDER.includes(child.localName)) {
        existingVariantKeys.add(`${typeface}::${child.localName}`);
      }
    }
  }

  let fontFileCounter = maxNum(numberedParts(templateZip, /^ppt\/fonts\/font(\d+)\.fntdata$/));

  for (const font of fontsToEmbed) {
    const variant = font.variant || 'regular';
    const key = `${font.name}::${variant}`;
    if (existingVariantKeys.has(key)) continue; // already embedded (template or earlier in this batch) — skip
    existingVariantKeys.add(key);

    fontFileCounter++;
    const fontPath = `ppt/fonts/font${fontFileCounter}.fntdata`;
    templateZip.file(fontPath, font.data);
    ensureDefaultExtensionWithType('fntdata', FNTDATA_CONTENT_TYPE);

    const rId = addPresRelationship(FONT_REL_TYPE, relativeTarget('ppt', fontPath));

    let embedFontEl = embedFontElByTypeface.get(font.name);
    if (!embedFontEl) {
      embedFontEl = presDoc.createElementNS(P_NS, 'p:embeddedFont');
      const fontNode = presDoc.createElementNS(P_NS, 'p:font');
      fontNode.setAttribute('typeface', font.name);
      embedFontEl.appendChild(fontNode);
      embeddedFontLst.appendChild(embedFontEl);
      embedFontElByTypeface.set(font.name, embedFontEl);
    }

    const variantEl = presDoc.createElementNS(P_NS, 'p:' + variant);
    variantEl.setAttributeNS(R_NS, 'r:id', rId);
    insertInOrder(embedFontEl, variantEl, EMBEDDED_FONT_CHILD_ORDER);
  }

  // Matches PPTXEmbedFonts' existing convention for these two flags.
  presDoc.documentElement.setAttribute('saveSubsetFonts', 'true');
  presDoc.documentElement.setAttribute('embedTrueTypeFonts', 'true');
}

/**
 * Merges the slides of a freshly-generated PptxGenJS package into an
 * existing template package, so the merged slides inherit the template's
 * real theme/master/layout background instead of PptxGenJS's own
 * generated blank layout.
 *
 * The template's theme/slideMasters/slideLayouts/media/presentation.xml
 * and existing slides are preserved as-is; only new parts for the
 * generated slides (and their notes slides / referenced media) are added.
 *
 * Optionally also merges pre-fetched/pre-converted embedded fonts (see
 * `fontsToEmbed`) into the template's own `<p:embeddedFontLst>`, so
 * `template` and font embedding can be used together — existing embedded
 * fonts in the template (if any) are preserved, and a font already present
 * for a given (typeface, variant) is not re-embedded.
 *
 * @param {object} args
 * @param {{zip: JSZip, layouts: Array, notesMasterId: string|null, sldSz: object|null}} args.templateInfo - from readTemplate()
 * @param {JSZip} args.generatedZip - the PptxGenJS-produced package to merge from
 * @param {Array<string|undefined>} args.slideAssignments - per-slide `baseLayout` name (or undefined), one entry per generated slide, in order
 * @param {string} [args.defaultLayoutName] - layout name to use for slides without an explicit assignment
 * @param {Array<{name: string, variant?: string, data: ArrayBuffer|Uint8Array}>} [args.fontsToEmbed] - fonts already
 *   fetched and converted to PowerPoint's .fntdata format (e.g. `PPTXEmbedFonts.fonts`), to embed into the template.
 * @returns {Promise<Blob>}
 */
export async function mergeTemplate({ templateInfo, generatedZip, slideAssignments, defaultLayoutName, fontsToEmbed }) {
  const templateZip = templateInfo.zip;

  const slideOffset = maxNum(numberedParts(templateZip, /^ppt\/slides\/slide(\d+)\.xml$/));
  const notesOffset = maxNum(numberedParts(templateZip, /^ppt\/notesSlides\/notesSlide(\d+)\.xml$/));
  let mediaCounter = maxNum(numberedParts(templateZip, /^ppt\/media\/image(\d+)\./));

  const contentTypesDoc = parseXml(await templateZip.file(CONTENT_TYPES_PATH).async('string'), CONTENT_TYPES_PATH);
  const presDoc = parseXml(await templateZip.file(PRESENTATION_PATH).async('string'), PRESENTATION_PATH);
  const presRelsDoc = parseXml(await templateZip.file(PRESENTATION_RELS_PATH).async('string'), PRESENTATION_RELS_PATH);
  const generatedContentTypesDoc = parseXml(
    await generatedZip.file(CONTENT_TYPES_PATH).async('string'),
    'generated ' + CONTENT_TYPES_PATH
  );

  const sldIdLstEl = findFirstByLocalName(presDoc, 'sldIdLst');
  if (!sldIdLstEl) {
    throw new Error(
      'dom-to-pptx: template presentation.xml is missing <p:sldIdLst>; this is not a valid PowerPoint package.'
    );
  }

  let nextSldId = 256;
  for (const sldId of findAllByLocalName(sldIdLstEl, 'sldId')) {
    const idNum = parseInt(sldId.getAttribute('id'), 10);
    if (!isNaN(idNum)) nextSldId = Math.max(nextSldId, idNum + 1);
  }

  let nextRelIdNum = maxRelIdNum(presRelsDoc) + 1;

  function addOverride(partName, contentType) {
    const el = contentTypesDoc.createElementNS(CT_NS, 'Override');
    el.setAttribute('PartName', partName);
    el.setAttribute('ContentType', contentType);
    contentTypesDoc.documentElement.appendChild(el);
  }

  function ensureDefaultExtensionWithType(ext, contentType) {
    if (findDefaultContentType(contentTypesDoc, ext)) return;
    const el = contentTypesDoc.createElementNS(CT_NS, 'Default');
    el.setAttribute('Extension', ext);
    el.setAttribute('ContentType', contentType);
    contentTypesDoc.documentElement.appendChild(el);
  }

  function ensureDefaultExtension(ext) {
    const contentType = findDefaultContentType(generatedContentTypesDoc, ext);
    if (!contentType) return; // unknown extension — nothing we can copy
    ensureDefaultExtensionWithType(ext, contentType);
  }

  function addPresRelationship(type, target) {
    const id = `rId${nextRelIdNum++}`;
    const el = presRelsDoc.createElementNS(REL_NS, 'Relationship');
    el.setAttribute('Id', id);
    el.setAttribute('Type', type);
    el.setAttribute('Target', target);
    presRelsDoc.documentElement.appendChild(el);
    return id;
  }

  const mediaPathMap = new Map();
  async function copyMedia(oldAbsPath) {
    if (mediaPathMap.has(oldAbsPath)) return mediaPathMap.get(oldAbsPath);
    const file = generatedZip.file(oldAbsPath);
    if (!file) return oldAbsPath; // unexpectedly missing — leave target as-is rather than crash
    mediaCounter++;
    const ext = oldAbsPath.split('.').pop();
    const newAbsPath = `ppt/media/image${mediaCounter}.${ext}`;
    templateZip.file(newAbsPath, await file.async('uint8array'));
    ensureDefaultExtension(ext);
    mediaPathMap.set(oldAbsPath, newAbsPath);
    return newAbsPath;
  }

  for (let i = 0; i < slideAssignments.length; i++) {
    const oldSlideNum = i + 1;
    const newSlideNum = slideOffset + oldSlideNum;
    const oldSlidePath = `ppt/slides/slide${oldSlideNum}.xml`;
    const newSlidePath = `ppt/slides/slide${newSlideNum}.xml`;
    const oldSlideRelsPath = `ppt/slides/_rels/slide${oldSlideNum}.xml.rels`;
    const newSlideRelsPath = `ppt/slides/_rels/slide${newSlideNum}.xml.rels`;

    if (!generatedZip.file(oldSlidePath)) {
      // `slideAssignments` is the caller's record of how many slides were
      // generated; a missing part here means the intermediate PptxGenJS
      // package is malformed (or `slideAssignments` doesn't actually match
      // it). Silently skipping would merge fewer slides than the caller
      // asked for with no indication anything went wrong.
      throw new Error(
        `dom-to-pptx: mergeTemplate() expected a generated slide at "${oldSlidePath}" (slideAssignments[${i}]) ` +
          'but it is missing from generatedZip. The generated PPTX package may be malformed, or slideAssignments ' +
          'does not match the number of slides it actually contains.'
      );
    }

    const resolvedLayout = resolveLayout(templateInfo, slideAssignments[i], defaultLayoutName);

    // --- Slide XML: copied verbatim, only its layout relationship changes ---
    templateZip.file(newSlidePath, await generatedZip.file(oldSlidePath).async('string'));
    addOverride(
      `/${newSlidePath}`,
      findOverrideContentType(generatedContentTypesDoc, `/${oldSlidePath}`) ||
        'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'
    );

    let newNotesPath = null;
    if (generatedZip.file(oldSlideRelsPath)) {
      const relsDoc = parseXml(await generatedZip.file(oldSlideRelsPath).async('string'), oldSlideRelsPath);
      for (const rel of getRelationships(relsDoc)) {
        if (rel.getAttribute('TargetMode') === 'External') continue;
        const type = rel.getAttribute('Type');
        const target = rel.getAttribute('Target');

        if (type === SLIDELAYOUT_REL_TYPE) {
          rel.setAttribute('Target', relativeTarget('ppt/slides', resolvedLayout.id));
        } else if (type === NOTESSLIDE_REL_TYPE) {
          newNotesPath = `ppt/notesSlides/notesSlide${notesOffset + oldSlideNum}.xml`;
          rel.setAttribute('Target', relativeTarget('ppt/slides', newNotesPath));
        } else if (type === IMAGE_REL_TYPE) {
          const oldAbs = resolveRelativeTarget('ppt/slides', target);
          const newAbs = await copyMedia(oldAbs);
          rel.setAttribute('Target', relativeTarget('ppt/slides', newAbs));
        } else {
          // Every other *internal* relationship type (chart, audio/video
          // media, embedded package/worksheet, an internal hyperlink to
          // another slide, ...) would need its target part copied into
          // templateZip the same way slideLayout/notesSlide/image are
          // above, which this function doesn't do. Continuing silently
          // would leave the relationship pointing at a part that was never
          // copied — a dangling reference that produces a corrupt-looking
          // PPTX without any error, surfacing only if/when the renderer
          // gains a feature that emits one of these. Fail loudly instead.
          throw new Error(
            `dom-to-pptx: slide ${oldSlideNum} has an internal relationship of type "${type}" ` +
              `(target "${target}") that mergeTemplate() does not know how to carry into the template package. ` +
              'Only slideLayout, notesSlide, and image relationships are currently supported for template merging.'
          );
        }
      }
      templateZip.file(newSlideRelsPath, serializeXmlWithDeclaration(relsDoc));
    }

    const oldNotesPath = `ppt/notesSlides/notesSlide${oldSlideNum}.xml`;
    if (newNotesPath && generatedZip.file(oldNotesPath)) {
      templateZip.file(newNotesPath, await generatedZip.file(oldNotesPath).async('string'));
      addOverride(
        `/${newNotesPath}`,
        findOverrideContentType(generatedContentTypesDoc, `/${oldNotesPath}`) ||
          'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml'
      );

      const newNotesNum = newNotesPath.match(/notesSlide(\d+)/)[1];
      const oldNotesRelsPath = `ppt/notesSlides/_rels/notesSlide${oldSlideNum}.xml.rels`;
      const newNotesRelsPath = `ppt/notesSlides/_rels/notesSlide${newNotesNum}.xml.rels`;
      if (generatedZip.file(oldNotesRelsPath)) {
        const notesRelsDoc = parseXml(await generatedZip.file(oldNotesRelsPath).async('string'), oldNotesRelsPath);
        for (const rel of getRelationships(notesRelsDoc)) {
          const type = rel.getAttribute('Type');
          if (type === NOTESMASTER_REL_TYPE) {
            if (!templateInfo.notesMasterId) {
              throw new Error(
                'dom-to-pptx: template is missing a notes master (ppt/notesMasters/*.xml), which every valid PowerPoint file must have.'
              );
            }
            rel.setAttribute('Target', relativeTarget('ppt/notesSlides', templateInfo.notesMasterId));
          } else if (type === SLIDE_REL_TYPE) {
            rel.setAttribute('Target', relativeTarget('ppt/notesSlides', newSlidePath));
          }
        }
        templateZip.file(newNotesRelsPath, serializeXmlWithDeclaration(notesRelsDoc));
      }
    }

    const slideRelId = addPresRelationship(SLIDE_REL_TYPE, relativeTarget('ppt', newSlidePath));
    const sldIdEl = presDoc.createElementNS(sldIdLstEl.namespaceURI, 'p:sldId');
    sldIdEl.setAttribute('id', String(nextSldId++));
    sldIdEl.setAttributeNS(R_NS, 'r:id', slideRelId);
    sldIdLstEl.appendChild(sldIdEl);
  }

  if (fontsToEmbed && fontsToEmbed.length > 0) {
    mergeFonts({
      presDoc,
      templateZip,
      addPresRelationship,
      ensureDefaultExtensionWithType,
      fontsToEmbed,
    });
  }

  templateZip.file(CONTENT_TYPES_PATH, serializeXmlWithDeclaration(contentTypesDoc));
  templateZip.file(PRESENTATION_PATH, serializeXmlWithDeclaration(presDoc));
  templateZip.file(PRESENTATION_RELS_PATH, serializeXmlWithDeclaration(presRelsDoc));

  return templateZip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}
