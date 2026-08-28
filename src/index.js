// src/index.js
import * as PptxGenJSImport from 'pptxgenjs';
import html2canvas from 'html2canvas';
import { PPTXEmbedFonts } from './font-embedder.js';
import { normalizePptxZip } from './pptx-normalizer.js';
import { readTemplate, resolveLayout, mergeTemplate, getTemplateLayouts } from './template.js';
import JSZip from 'jszip';

export { getTemplateLayouts };

// Normalize import
const PptxGenJS = PptxGenJSImport?.default ?? PptxGenJSImport;

import {
  parseColor,
  getTextStyle,
  isTextContainer,
  getVisibleShadow,
  generateGradientSVG,
  getRotation,
  getWritingModeVert,
  mapVertToTextDirection,
  svgToPng,
  svgToSvg,
  getPadding,
  getSoftEdges,
  generateBlurredSVG,
  getBorderInfo,
  generateCompositeBorderSVG,
  isClippedByParent,
  generateCustomShapeSVG,
  getUsedFontFamilies,
  getAutoDetectedFonts,
  extractSpeakerNotesFromElement,
  classifyFontVariant,
  detectVariantSlotCollisions,
  extractTableData,
  collectTextParts,
} from './utils.js';
import { getProcessedImage } from './image-processor.js';
import { parseAnimation } from './animations/css-parser.js';
import { extractTransitionFromElement } from './animations/transitions.js';

const PPI = 96;
const PX_TO_INCH = 1 / PPI;

/**
 * Main export function.
 * @param {HTMLElement | string | Array<HTMLElement | string>} target
 * @param {Object} options
 * @param {string} [options.fileName]
 * @param {boolean} [options.skipDownload=false] - If true, prevents automatic download
 * @param {Object} [options.listConfig] - Config for bullets
 * @param {boolean} [options.svgAsVector=false] - If true, keeps SVG as vector (for Convert to Shape in PowerPoint)
 * @param {boolean} [options.skipNormalize=false] - If true, skips re-zipping with DEFLATE
 *   and stripping dangling [Content_Types].xml Overrides. Leave it false unless you are
 *   debugging the raw PptxGenJS output, otherwise Microsoft PowerPoint may reject the file.
 * @param {string|ArrayBuffer|Uint8Array|Blob} [options.template] - An existing .pptx to use
 *   as the base presentation. When set, exported slides inherit a real PowerPoint slide
 *   layout/master background (see `baseLayout` below) instead of a blank generated one.
 *   Accepts a URL string (fetched with `fetch`) or raw bytes (ArrayBuffer/Uint8Array/Blob).
 *   See docs/template-support.md for details and limitations (e.g. font embedding is not
 *   currently supported together with `template`).
 * @param {string} [options.defaultBaseLayout] - Layout name used for slides that don't
 *   specify their own `baseLayout`. Falls back to the template's first declared layout
 *   if omitted.
 * @param {HTMLElement | string | Array<HTMLElement | string | {element: HTMLElement | string, baseLayout?: string}>} target -
 *   In addition to elements/selectors, an entry may be a `{element, baseLayout}` descriptor
 *   to pick which template layout that specific slide is based on (requires `options.template`).
 * @returns {Promise<Blob>} - Returns the generated PPTX Blob
 */
export async function exportToPptx(target, options = {}) {
  const resolvePptxConstructor = (pkg) => {
    if (!pkg) return null;
    if (typeof pkg === 'function') return pkg;
    if (pkg && typeof pkg.default === 'function') return pkg.default;
    if (pkg && typeof pkg.PptxGenJS === 'function') return pkg.PptxGenJS;
    if (pkg && pkg.PptxGenJS && typeof pkg.PptxGenJS.default === 'function') return pkg.PptxGenJS.default;
    return null;
  };

  const PptxConstructor = resolvePptxConstructor(PptxGenJS);
  if (!PptxConstructor) throw new Error('PptxGenJS constructor not found.');
  const pptx = new PptxConstructor();

  // Template Handling (optional): load once up front so its declared slide
  // size can inform layout sizing below, and so per-slide `baseLayout`
  // names can be validated as slides are processed further down.
  const templateInfo = options.template ? await readTemplate(options.template) : null;

  // 1. Layout Handling
  let finalWidth = 10; // default 16:9
  let finalHeight = 5.625;

  if (options.width && options.height) {
    pptx.defineLayout({ name: 'CUSTOM', width: options.width, height: options.height });
    pptx.layout = 'CUSTOM';
    finalWidth = options.width;
    finalHeight = options.height;
  } else if (options.layout) {
    pptx.layout = options.layout;
    // Map standard layouts for internal scale calculation if possible,
    // though PptxGenJS defaults to 16:9 if unknown.
    if (options.layout === 'LAYOUT_4x3') {
      finalWidth = 10;
      finalHeight = 7.5;
    } else if (options.layout === 'LAYOUT_16x10') {
      finalWidth = 10;
      finalHeight = 6.25;
    } else if (options.layout === 'LAYOUT_WIDE') {
      finalWidth = 13.3;
      finalHeight = 7.5;
    }
  } else if (templateInfo && templateInfo.sldSz) {
    // Match the template's own declared slide size so shapes line up 1:1
    // with the real master/layout background it provides. This only
    // determines the coordinate space PptxGenJS renders into here — the
    // template's presentation.xml (and its actual <p:sldSz>) is preserved
    // untouched by the merge step later on.
    pptx.defineLayout({ name: 'TEMPLATE', width: templateInfo.sldSz.width, height: templateInfo.sldSz.height });
    pptx.layout = 'TEMPLATE';
    finalWidth = templateInfo.sldSz.width;
    finalHeight = templateInfo.sldSz.height;
  } else {
    const firstEl = Array.isArray(target) ? target[0] : target;
    const root = typeof firstEl === 'string' ? document.querySelector(firstEl) : firstEl;
    if (root) {
      const rect = root.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const aspect = rect.width / rect.height;
        finalWidth = 10;
        finalHeight = 10 / aspect;
        pptx.defineLayout({ name: 'AUTO_DESIGN', width: finalWidth, height: finalHeight });
        pptx.layout = 'AUTO_DESIGN';
      } else {
        pptx.layout = 'LAYOUT_16x9';
      }
    } else {
      pptx.layout = 'LAYOUT_16x9';
    }
  }

  // Pass these dimensions to options so processSlide can use them
  const extendedOptions = {
    ...options,
    _slideWidth: finalWidth,
    _slideHeight: finalHeight,
    // Text-container classification is independent of the slide item being built. Cache it for
    // this export because the traversal asks about the same parents repeatedly.
    _textContainerCache: new WeakMap(),
  };

  const elements = Array.isArray(target) ? target : [target];

  let slideIndex = 0;
  const slideAnimations = {};
  const slideTransitions = {};
  const slideBaseLayouts = [];
  const resolvedRoots = []; // plain elements/selectors, unwrapped from any {element, baseLayout} descriptor
  for (const item of elements) {
    // Each entry is either an element/selector (existing behavior) or a
    // {element, baseLayout} descriptor picking which template layout that
    // slide is based on. Detected via `.nodeType` rather than `instanceof
    // Element` so this also works for plain selector strings and across
    // realms (jsdom in tests, a real browser, a puppeteer page).
    const isDescriptor = item != null && typeof item === 'object' && !item.nodeType && 'element' in item;
    const el = isDescriptor ? item.element : item;
    const baseLayout = isDescriptor ? item.baseLayout : undefined;

    const root = typeof el === 'string' ? document.querySelector(el) : el;
    if (!root) {
      console.warn('Element not found, skipping slide:', el);
      continue;
    }

    if (baseLayout && !options.template) {
      console.warn(
        `dom-to-pptx: slide specifies baseLayout "${baseLayout}" but no \`template\` option was provided — ignoring.`
      );
    }
    // Validate eagerly (per slide) so a bad layout name is reported
    // against the slide that requested it, rather than only surfacing
    // once at the very end during the template merge step.
    if (templateInfo) {
      resolveLayout(templateInfo, baseLayout, options.defaultBaseLayout);
    }
    slideBaseLayouts.push(baseLayout);
    resolvedRoots.push(root);

    const transition = extractTransitionFromElement(root);
    if (transition) {
      slideTransitions[slideIndex] = transition;
    }

    const slide = pptx.addSlide();
    const slideOptions = {
      ...extendedOptions,
      _slideIndex: slideIndex,
      _animations: [],
    };

    // Extract speaker notes from any element inside the slide root that
    // carries a data-pptx-notes attribute. Recognises <template
    // data-pptx-notes> (inert content), <div data-pptx-notes hidden>,
    // and any other tag with the attribute. Multiple matches concatenate.
    // Notes are attached BEFORE processSlide runs so users can freely
    // place notes wherever they like without worrying about ordering.
    const notesText = extractSpeakerNotesFromElement(root);
    if (notesText) {
      slide.addNotes(notesText);
    }

    await processSlide(root, slide, pptx, slideOptions);
    slideAnimations[slideIndex] = slideOptions._animations;
    slideIndex++;
  }
  extendedOptions._slideAnimations = slideAnimations;
  extendedOptions._slideTransitions = slideTransitions;

  // 3. Font Embedding Logic
  let finalBlob;
  let rawFonts = options.fonts || [];
  let fontsToEmbed;

  // Group by (name, variant) so each PowerPoint slot gets its own font.
  // classifyFontVariant lives in utils.js so it can be unit-tested and
  // reused for collision detection below.
  const uniqueFonts = new Map();
  const addToGroup = (name, variant, url) => {
    const key = name + '::' + variant;
    if (!uniqueFonts.has(key)) {
      uniqueFonts.set(key, { name, variant, urls: new Set() });
    }
    uniqueFonts.get(key).urls.add(url);
  };

  // Track every raw entry so we can detect variant-slot collisions
  // (e.g. Inter@700 and Inter@900 both landing in the `bold` slot).
  const rawFontDescriptors = [];

  for (const f of rawFonts) {
    const variant = classifyFontVariant(f.weight, f.style);
    rawFontDescriptors.push({ name: f.name, weight: f.weight, style: f.style });
    if (f.url) addToGroup(f.name, variant, f.url);
    if (f.urls) {
      for (const url of f.urls) addToGroup(f.name, variant, url);
    }
  }

  if (options.autoEmbedFonts !== false) {
    // A. Scan DOM for used font families
    const usedFamilies = getUsedFontFamilies(resolvedRoots);

    // B. Scan CSS for URLs matches (each carries weight+style now)
    const detectedFonts = await getAutoDetectedFonts(usedFamilies);

    // C. Merge, keyed by (name, variant) so Bold does not collapse into Regular
    for (const autoFont of detectedFonts) {
      const variant = classifyFontVariant(autoFont.weight, autoFont.style);
      rawFontDescriptors.push({ name: autoFont.name, weight: autoFont.weight, style: autoFont.style });
      addToGroup(autoFont.name, variant, autoFont.url);
    }

    if (detectedFonts.length > 0) {
      console.log(
        'Auto-detected fonts:',
        detectedFonts.map((f) => `${f.name} (${classifyFontVariant(f.weight, f.style)})`)
      );
    }
  }

  // Warn when two @font-face declarations with materially different
  // weights land in the same PowerPoint slot. Most common example:
  // declaring Inter at weight 700 alongside weight 900 — both classify as
  // `bold`, so weight 900 glyphs silently get merged into (and mostly
  // overwritten by) weight 700. To render Inter Black distinctly, declare
  // it under a separate CSS family (e.g. `font-family: 'Inter Black'`)
  // rather than a heavier weight of the same family.
  const collisions = detectVariantSlotCollisions(rawFontDescriptors);
  for (const c of collisions) {
    console.warn(
      `dom-to-pptx: font "${c.family}" declares multiple weights (${c.weights.join(', ')}) ` +
        `that collapse into PowerPoint's "${c.variant}" slot. Only one will render distinctly. ` +
        `Declare the heavier weight under a separate CSS family (e.g. 'Inter Black') if you ` +
        `need it to render as a distinct face.`
    );
  }

  fontsToEmbed = Array.from(uniqueFonts.values()).map((entry) => ({
    name: entry.name,
    variant: entry.variant,
    urls: Array.from(entry.urls),
  }));

  if (fontsToEmbed.length > 0) {
    console.log(
      'Fonts to embed after deduplication and subset gathering:',
      fontsToEmbed.map((f) => `${f.name} (${f.urls.length} subsets)`)
    );
  }

  // The embedder instance is created whenever there are fonts to embed,
  // regardless of `options.template` — addFont() only fetches/converts font
  // data into `embedder.fonts`, it doesn't touch a zip yet. When a template
  // is set, that in-memory font list is handed to mergeTemplate() below
  // instead of being written into the (discarded) intermediate package, so
  // the exact same fetch/EOT-conversion logic is reused either way.
  let embedder = null;
  if (fontsToEmbed.length > 0) {
    embedder = new PPTXEmbedFonts();

    // Fetch and Embed Concurrently. Track success/failure per (family,variant)
    // so we can print a structured summary at the end — a silent no-op on
    // font embedding is one of the sharpest workflow sharp edges (a 15 KB
    // PPTX with no fonts embedded looks identical to a 15 KB PPTX with
    // fonts intentionally excluded).
    const embedResults = [];
    await Promise.all(
      fontsToEmbed.map(async (fontCfg) => {
        const label = `${fontCfg.name} (${fontCfg.variant || 'regular'})`;
        try {
          if (fontCfg.urls.length === 0) {
            throw new Error(`No URLs found for font family ${fontCfg.name}`);
          }

          // Fetch all subsets in parallel
          const subsets = await Promise.all(
            fontCfg.urls.map(async (url) => {
              const response = await fetch(url);
              if (!response.ok) throw new Error(`Failed to fetch ${url} (HTTP ${response.status})`);
              const buffer = await response.arrayBuffer();

              // Infer type
              const ext = url.split('.').pop().split(/[?#]/)[0].toLowerCase();
              let type = 'ttf';
              if (['woff', 'woff2', 'otf'].includes(ext)) type = ext;

              return { buffer, type };
            })
          );

          await embedder.addFont(fontCfg.name, subsets, options.woff2WasmUrl, undefined, fontCfg.variant || 'regular');
          embedResults.push({ label, ok: true });
        } catch (e) {
          const reason = e && e.message ? e.message : String(e);
          embedResults.push({ label, ok: false, reason });
          console.warn(`Failed to embed font family: ${fontCfg.name}`, e);
        }
      })
    );

    // Structured summary. Users routinely miss the per-family console.warn
    // above (especially when fetch() 404s during a headless build), so we
    // always print an explicit summary line — including a highly visible
    // error line if any embed failed. This turns a silent no-op into a
    // loud one.
    const succeeded = embedResults.filter((r) => r.ok);
    const failed = embedResults.filter((r) => !r.ok);
    if (succeeded.length > 0) {
      console.log(
        `dom-to-pptx: embedded ${succeeded.length} font variant(s): ` + succeeded.map((r) => r.label).join(', ')
      );
    }
    if (failed.length > 0) {
      console.error(
        `dom-to-pptx: FAILED to embed ${failed.length} font variant(s). ` +
          `PowerPoint will fall back to a system font, breaking the design. Details:`
      );
      for (const r of failed) {
        console.error(`  - ${r.label}: ${r.reason}`);
      }
    }
  }

  if (fontsToEmbed.length > 0 && !options.template) {
    // No template: fonts are embedded directly into the generated package,
    // exactly as before this feature existed.
    const initialBlob = await pptx.write({ outputType: 'blob' });
    const zip = await JSZip.loadAsync(initialBlob);
    await embedder.loadZip(zip);
    await embedder.updateFiles();
    if (options.skipNormalize !== true) {
      await normalizePptxZip(zip, extendedOptions);
    }
    finalBlob = await embedder.generateBlob();
  } else {
    // No fonts to embed, OR a template is set (in which case fonts — if
    // any — are merged into the *template's* presentation.xml below rather
    // than this throwaway intermediate package). Still re-zip with DEFLATE
    // and strip dangling Overrides so Microsoft PowerPoint accepts the file
    // (PptxGenJS leaves both issues unresolved on its own; see 错误诊断.md).
    const initialBlob = await pptx.write({ outputType: 'blob' });
    if (options.skipNormalize === true) {
      finalBlob = initialBlob;
    } else {
      const zip = await JSZip.loadAsync(initialBlob);
      await normalizePptxZip(zip, extendedOptions);
      finalBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
    }
  }

  // 3b. Template Merge (optional): fold the generated slides — and any
  // fetched/converted fonts — into the template package so they inherit
  // its real theme/master/layout background. Runs after normalization so
  // the merge only ever handles a single, already-valid PptxGenJS package
  // shape.
  if (options.template) {
    finalBlob = await mergeTemplate({
      templateInfo,
      generatedZip: await JSZip.loadAsync(finalBlob),
      slideAssignments: slideBaseLayouts,
      defaultLayoutName: options.defaultBaseLayout,
      fontsToEmbed: embedder ? embedder.fonts : [],
    });
  }

  // 4. Output Handling
  // If skipDownload is NOT true, proceed with browser download
  if (!options.skipDownload) {
    const fileName = options.fileName || 'export.pptx';
    const url = URL.createObjectURL(finalBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Always return the blob so the caller can use it (e.g. upload to server)
  return finalBlob;
}

/**
 * Worker function to process a single DOM element into a single PPTX slide.
 * @param {HTMLElement} root - The root element for this slide.
 * @param {PptxGenJS.Slide} slide - The PPTX slide object to add content to.
 * @param {PptxGenJS} pptx - The main PPTX instance.
 */
function isTextContainerCached(node, cache) {
  if (!cache) return isTextContainer(node);
  if (!cache.has(node)) cache.set(node, isTextContainer(node));
  return cache.get(node);
}

function compareKeys(keyA, keyB) {
  const len = Math.max(keyA.length, keyB.length);
  for (let i = 0; i < len; i++) {
    const valA = keyA[i] !== undefined ? keyA[i] : 0;
    const valB = keyB[i] !== undefined ? keyB[i] : 0;
    if (valA !== valB) {
      return valA - valB;
    }
  }
  return 0;
}

function getCustomShapeType(customShapeName, pptx) {
  if (!customShapeName) return pptx.ShapeType.rect;
  const name = customShapeName.trim().replace(/['"]/g, '').toLowerCase();
  if (name === 'circle' || name === 'ellipse' || name === 'oval') return pptx.ShapeType.ellipse;
  if (name === 'triangle') return pptx.ShapeType.triangle;
  if (name === 'diamond') return pptx.ShapeType.diamond;
  if (name === 'parallelogram') return pptx.ShapeType.parallelogram;
  if (name === 'hexagon') return pptx.ShapeType.hexagon;
  if (name === 'pentagon') return pptx.ShapeType.pentagon;
  if (name === 'star') return pptx.ShapeType.star5;
  if (name === 'chevron') return pptx.ShapeType.chevron;
  if (name === 'rect' || name === 'rectangle') return pptx.ShapeType.rect;
  if (name === 'roundrect' || name === 'roundedrectangle') return pptx.ShapeType.roundRect;
  for (const key of Object.keys(pptx.ShapeType)) {
    if (key.toLowerCase() === name) return pptx.ShapeType[key];
  }
  return pptx.ShapeType.rect;
}

async function processSlide(root, slide, pptx, globalOptions = {}) {
  const rootRect = root.getBoundingClientRect();
  const PPTX_WIDTH_IN = globalOptions._slideWidth || 10;
  const PPTX_HEIGHT_IN = globalOptions._slideHeight || 5.625;

  const contentWidthIn = rootRect.width * PX_TO_INCH;
  const contentHeightIn = rootRect.height * PX_TO_INCH;
  const scale = Math.min(PPTX_WIDTH_IN / contentWidthIn, PPTX_HEIGHT_IN / contentHeightIn);

  const layoutConfig = {
    rootX: rootRect.x,
    rootY: rootRect.y,
    scale: scale,
    offX: (PPTX_WIDTH_IN - contentWidthIn * scale) / 2,
    offY: (PPTX_HEIGHT_IN - contentHeightIn * scale) / 2,
  };

  const renderQueue = [];
  const asyncTasks = []; // Queue for heavy operations (Images, Canvas)
  let domOrderCounter = 0;

  // Sync Traversal Function
  function collect(node, parentSortKey, parentOpacity = 1, inheritedAnimation = null) {
    const order = domOrderCounter++;

    let currentSortKey = parentSortKey;
    let currentOpacity = parentOpacity;
    let nodeStyle = null;
    const nodeType = node.nodeType;

    if (nodeType === 1) {
      nodeStyle = window.getComputedStyle(node);
      const elOpacity = parseFloat(nodeStyle.opacity);
      if (!isNaN(elOpacity)) {
        currentOpacity *= elOpacity;
      }

      // Optimization: Skip completely hidden elements immediately
      if (nodeStyle.display === 'none' || nodeStyle.visibility === 'hidden' || currentOpacity === 0) {
        return;
      }
      let zVal = 0;
      if (nodeStyle.zIndex !== 'auto') {
        const parsedZ = parseInt(nodeStyle.zIndex);
        if (!isNaN(parsedZ)) {
          zVal = parsedZ;
        }
      }
      currentSortKey = parentSortKey.concat([zVal, order]);
    }

    // Prepare the item. If it needs async work, it returns a 'job'
    const result = prepareRenderItem(node, { ...layoutConfig, root }, order, pptx, currentSortKey, nodeStyle, {
      ...globalOptions,
      _inheritedOpacity: parentOpacity,
      _inheritedAnimation: inheritedAnimation,
    });

    if (result) {
      if (result.items) {
        // Push items immediately to queue (data might be missing but filled later)
        renderQueue.push(...result.items);
      }
      if (result.job) {
        // Push the promise-returning function to the task list
        asyncTasks.push(result.job);
      }
      if (result.stopRecursion) return;
    }

    // Recurse children synchronously.
    // Determine what animation to pass down to children:
    // If this element has its own animation, children inherit it (with start='with' applied in prepareRenderItem).
    // Otherwise, continue passing whatever was already inherited from an ancestor.
    const childNodes = node.childNodes;
    let nextInheritedAnimation = inheritedAnimation;
    if (nodeType === 1 && nodeStyle) {
      const ownAnim = parseAnimation(node, nodeStyle);
      if (ownAnim) {
        nextInheritedAnimation = ownAnim;
      }
    }
    for (let i = 0; i < childNodes.length; i++) {
      collect(childNodes[i], currentSortKey, currentOpacity, nextInheritedAnimation);
    }
  }

  // 1. Traverse and build the structure (Fast)
  collect(root, []);

  // 2. Execute all heavy tasks in parallel (Fast)
  if (asyncTasks.length > 0) {
    await Promise.all(asyncTasks.map((task) => task()));
  }

  // 3. Cleanup and Sort
  // Remove items that failed to generate data (marked with skip)
  const finalQueue = renderQueue.filter((item) => !item.skip && (item.type !== 'image' || item.options.data));

  finalQueue.sort((a, b) => {
    return compareKeys(a.zIndex, b.zIndex);
  });

  // 4. Add to Slide
  for (let i = 0; i < finalQueue.length; i++) {
    const item = finalQueue[i];
    const transportVal = `__z_${i}__dom_${item.domOrder}__type_${item.type}`;
    item.options.altText = transportVal;
    item.options.objectName = transportVal;

    if (item.type === 'shape') slide.addShape(item.shapeType, item.options);
    if (item.type === 'image') slide.addImage(item.options);
    if (item.type === 'text') slide.addText(item.textParts, item.options);
    if (item.type === 'table') {
      slide.addTable(item.tableData.rows, {
        x: item.options.x,
        y: item.options.y,
        w: item.options.w,
        colW: item.tableData.colWidths, // Essential for correct layout
        autoPage: false,
        // Remove default table styles so our extracted CSS applies cleanly
        border: { type: 'none' },
        fill: { color: 'FFFFFF', transparency: 100 },
        altText: item.options.altText,
        objectName: item.options.objectName,
      });
    }
  }
}

/**
 * Optimized html2canvas wrapper
 * Includes fix for cropped icons by adjusting styles in the cloned document.
 */
async function elementToCanvasImage(node, widthPx, heightPx) {
  return new Promise((resolve) => {
    // 1. Assign a temp ID to locate the node inside the cloned document
    const originalId = node.id;
    const tempId = 'pptx-capture-' + Math.random().toString(36).substr(2, 9);
    node.id = tempId;

    const width = Math.max(Math.ceil(widthPx), 1);
    const height = Math.max(Math.ceil(heightPx), 1);
    const style = window.getComputedStyle(node);

    // Add padding to the clone to capture spilling content (like extensive font glyphs)
    const padding = 10;

    html2canvas(node, {
      backgroundColor: null,
      logging: false,
      scale: 3, // Higher scale for sharper icons
      useCORS: true, // critical for external fonts/images
      width: width + padding * 2, // Capture a larger area
      height: height + padding * 2,
      x: -padding, // Offset capture to include the padding
      y: -padding,
      onclone: (clonedDoc) => {
        const clonedNode = clonedDoc.getElementById(tempId);
        if (clonedNode) {
          // --- FIX: CLIP & FONT ISSUES ---
          // Apply styles DIRECTLY to elements to ensure html2canvas picks them up
          // This avoids issues where <style> tags in onclone are ignored or delayed

          // 1. Force FontAwesome Family on Icons
          const icons = clonedNode.querySelectorAll('.fa, .fas, .far, .fab');
          icons.forEach((icon) => {
            icon.style.setProperty('font-family', 'FontAwesome', 'important');
          });

          // 2. Fix Image Display
          const images = clonedNode.querySelectorAll('img');
          images.forEach((img) => {
            img.style.setProperty('display', 'inline-block', 'important');
          });

          // 3. Force overflow visible on the container so glyphs bleeding out aren't cut
          clonedNode.style.overflow = 'visible';

          // 4. Adjust alignment for Icons to prevent baseline clipping
          // (Applies to <i>, <span>, or standard icon classes)
          const tag = (clonedNode?.tagName || '').toLowerCase();
          const className =
            typeof clonedNode.className === 'string'
              ? clonedNode.className
              : (clonedNode.className && clonedNode.className.baseVal) || '';
          if (tag === 'i' || tag === 'span' || className.includes('fa-')) {
            // Flex center helps align the glyph exactly in the middle of the box
            // preventing top/bottom cropping due to line-height mismatches.
            clonedNode.style.display = 'inline-flex';
            clonedNode.style.justifyContent = 'center';
            clonedNode.style.alignItems = 'center';
            clonedNode.style.setProperty('font-family', 'FontAwesome', 'important'); // Ensure root icon gets it too

            // Remove margins that might offset the capture
            clonedNode.style.margin = '0';

            // Ensure the font fits
            clonedNode.style.lineHeight = '1';
            clonedNode.style.verticalAlign = 'middle';
          }
        }
      },
    })
      .then((canvas) => {
        // Restore the original ID
        if (originalId) node.id = originalId;
        else node.removeAttribute('id');

        const destCanvas = document.createElement('canvas');
        destCanvas.width = width;
        destCanvas.height = height;
        const ctx = destCanvas.getContext('2d');

        // Draw captured canvas (which is padded) back to the original size
        // We need to draw the CENTER of the source canvas to the destination
        // The source canvas is (width + 2*padding) * scale
        // We want to draw the crop starting at padding*scale
        const scale = 3;
        const sX = padding * scale;
        const sY = padding * scale;
        const sW = width * scale;
        const sH = height * scale;

        ctx.drawImage(canvas, sX, sY, sW, sH, 0, 0, width, height);

        // --- Border Radius Clipping (Existing Logic) ---
        let tl = parseFloat(style.borderTopLeftRadius) || 0;
        let tr = parseFloat(style.borderTopRightRadius) || 0;
        let br = parseFloat(style.borderBottomRightRadius) || 0;
        let bl = parseFloat(style.borderBottomLeftRadius) || 0;

        const f = Math.min(
          width / (tl + tr) || Infinity,
          height / (tr + br) || Infinity,
          width / (br + bl) || Infinity,
          height / (bl + tl) || Infinity
        );

        if (f < 1) {
          tl *= f;
          tr *= f;
          br *= f;
          bl *= f;
        }

        if (tl + tr + br + bl > 0) {
          ctx.globalCompositeOperation = 'destination-in';
          ctx.beginPath();
          ctx.moveTo(tl, 0);
          ctx.lineTo(width - tr, 0);
          ctx.arcTo(width, 0, width, tr, tr);
          ctx.lineTo(width, height - br);
          ctx.arcTo(width, height, width - br, height, br);
          ctx.lineTo(bl, height);
          ctx.arcTo(0, height, 0, height - bl, bl);
          ctx.lineTo(0, tl);
          ctx.arcTo(0, 0, tl, 0, tl);
          ctx.closePath();
          ctx.fill();
        }

        resolve(destCanvas.toDataURL('image/png'));
      })
      .catch((e) => {
        if (originalId) node.id = originalId;
        else node.removeAttribute('id');
        console.warn('Canvas capture failed for node', node, e);
        resolve(null);
      });
  });
}

/**
 * Optimized html2canvas capture specifically for pseudo-elements (::before / ::after).
 * Hides host element background, borders, text, and children in onclone, leaving ONLY
 * the target pseudo-element visible. Works for ANY complex CSS shape (triangles, parallelograms,
 * hexagons, clip-paths, ribbons, speech bubbles, etc.).
 */
async function capturePseudoElementCanvas(node, pseudoType, widthPx, heightPx) {
  return new Promise((resolve) => {
    const originalId = node.id;
    const tempId = 'pptx-pseudo-' + Math.random().toString(36).substr(2, 9);
    node.id = tempId;

    const width = Math.max(Math.ceil(widthPx), 1);
    const height = Math.max(Math.ceil(heightPx), 1);
    const padding = 10;

    html2canvas(node, {
      backgroundColor: null,
      logging: false,
      scale: 3,
      useCORS: true,
      width: width + padding * 2,
      height: height + padding * 2,
      x: -padding,
      y: -padding,
      onclone: (clonedDoc) => {
        const clonedNode = clonedDoc.getElementById(tempId);
        if (clonedNode) {
          clonedNode.style.setProperty('background', 'none', 'important');
          clonedNode.style.setProperty('background-color', 'transparent', 'important');
          clonedNode.style.setProperty('border', 'none', 'important');
          clonedNode.style.setProperty('box-shadow', 'none', 'important');
          clonedNode.style.setProperty('outline', 'none', 'important');
          clonedNode.style.setProperty('color', 'transparent', 'important');

          Array.from(clonedNode.children).forEach((child) => {
            child.style.setProperty('display', 'none', 'important');
          });

          const otherPseudo = pseudoType === '::before' ? '::after' : '::before';
          const styleEl = clonedDoc.createElement('style');
          styleEl.textContent = `#${tempId}${otherPseudo} { display: none !important; }`;
          clonedDoc.head.appendChild(styleEl);
        }
      },
    })
      .then((canvas) => {
        if (originalId) node.id = originalId;
        else node.removeAttribute('id');

        const destCanvas = document.createElement('canvas');
        destCanvas.width = width;
        destCanvas.height = height;
        const ctx = destCanvas.getContext('2d');

        const scale = 3;
        const sX = padding * scale;
        const sY = padding * scale;
        const sW = width * scale;
        const sH = height * scale;

        ctx.drawImage(canvas, sX, sY, sW, sH, 0, 0, width, height);
        resolve(destCanvas.toDataURL('image/png'));
      })
      .catch((e) => {
        if (originalId) node.id = originalId;
        else node.removeAttribute('id');
        console.warn('Canvas pseudo-element capture failed:', e);
        resolve(null);
      });
  });
}

/**
 * Helper to identify elements that should be rendered as icons (Images).
 * Detects Custom Elements AND generic tags (<i>, <span>) with icon classes/pseudo-elements.
 */
function isIconElement(node) {
  // 1. Custom Elements (hyphenated tags) or Explicit Library Tags
  const tag = (node?.tagName || '').toLowerCase();
  if (
    tag.includes('-') ||
    ['material-icon', 'iconify-icon', 'remix-icon', 'ion-icon', 'eva-icon', 'box-icon', 'fa-icon'].includes(tag)
  ) {
    return true;
  }

  // 2. Class-based Icons (FontAwesome, Bootstrap, Material symbols) on <i> or <span>
  if (tag === 'i' || tag === 'span') {
    const cls = node.getAttribute('class') || '';
    if (
      typeof cls === 'string' &&
      (cls.includes('fa-') ||
        cls.includes('fas') ||
        cls.includes('far') ||
        cls.includes('fab') ||
        cls.includes('bi-') ||
        cls.includes('material-icons') ||
        cls.includes('icon'))
    ) {
      // Double-check: Must have pseudo-element content to be a CSS icon
      const before = window.getComputedStyle(node, '::before').content;
      const after = window.getComputedStyle(node, '::after').content;
      const hasContent = (c) => c && c !== 'none' && c !== 'normal' && c !== '""';

      if (hasContent(before) || hasContent(after)) return true;
    }
  }

  return false;
}

function getNodeSelector(node) {
  if (!node) return 'unknown';
  if (node.id) return `#${node.id}`;
  if (node.className) {
    const classes = Array.from(node.classList).join('.');
    return `${node.tagName.toLowerCase()}.${classes}`;
  }
  return node.tagName.toLowerCase();
}

function generateBorderTriangleSVG(w, h, borderLeft, borderTop, styles) {
  const topColor = parseColor(styles.borderTopColor);
  const rightColor = parseColor(styles.borderRightColor);
  const bottomColor = parseColor(styles.borderBottomColor);
  const leftColor = parseColor(styles.borderLeftColor);

  let polygons = '';

  if (topColor.hex && topColor.opacity > 0 && parseFloat(styles.borderTopWidth) > 0) {
    polygons += `<polygon points="0,0 ${w},0 ${borderLeft},${borderTop}" fill="#${topColor.hex}" fill-opacity="${topColor.opacity}" />`;
  }
  if (rightColor.hex && rightColor.opacity > 0 && parseFloat(styles.borderRightWidth) > 0) {
    polygons += `<polygon points="${w},0 ${w},${h} ${borderLeft},${borderTop}" fill="#${rightColor.hex}" fill-opacity="${rightColor.opacity}" />`;
  }
  if (bottomColor.hex && bottomColor.opacity > 0 && parseFloat(styles.borderBottomWidth) > 0) {
    polygons += `<polygon points="0,${h} ${w},${h} ${borderLeft},${borderTop}" fill="#${bottomColor.hex}" fill-opacity="${bottomColor.opacity}" />`;
  }
  if (leftColor.hex && leftColor.opacity > 0 && parseFloat(styles.borderLeftWidth) > 0) {
    polygons += `<polygon points="0,0 0,${h} ${borderLeft},${borderTop}" fill="#${leftColor.hex}" fill-opacity="${leftColor.opacity}" />`;
  }

  if (!polygons) return null;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
${polygons}
</svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg.trim());
}

/**
 * Replaces createRenderItem.
 * Returns { items: [], job: () => Promise, stopRecursion: boolean }
 */
function getPseudoElementRect(hostRect, pseudoStyle) {
  let w = parseFloat(pseudoStyle.width) || 0;
  let h = parseFloat(pseudoStyle.height) || 0;

  const borderLeft = parseFloat(pseudoStyle.borderLeftWidth) || 0;
  const borderRight = parseFloat(pseudoStyle.borderRightWidth) || 0;
  const borderTop = parseFloat(pseudoStyle.borderTopWidth) || 0;
  const borderBottom = parseFloat(pseudoStyle.borderBottomWidth) || 0;

  const isTriangle = w === 0 && h === 0 && (borderLeft > 0 || borderRight > 0) && (borderTop > 0 || borderBottom > 0);
  if (isTriangle) {
    w = borderLeft + borderRight;
    h = borderTop + borderBottom;
  }

  if (w <= 0 || h <= 0) {
    const content = pseudoStyle.content;
    const hasContent = content && content !== 'none' && content !== 'normal' && content !== '""';
    if (!hasContent) return null;
    w = w || hostRect.width;
    h = h || hostRect.height;
  }

  let x = hostRect.left;
  let y = hostRect.top;

  const position = pseudoStyle.position;
  if (position === 'absolute') {
    const leftStr = pseudoStyle.left;
    const topStr = pseudoStyle.top;
    const rightStr = pseudoStyle.right;
    const bottomStr = pseudoStyle.bottom;

    let left = 0;
    let hasLeft = false;
    if (leftStr && leftStr !== 'auto') {
      hasLeft = true;
      left = leftStr.endsWith('%') ? (parseFloat(leftStr) / 100) * hostRect.width : parseFloat(leftStr);
    }

    let top = 0;
    let hasTop = false;
    if (topStr && topStr !== 'auto') {
      hasTop = true;
      top = topStr.endsWith('%') ? (parseFloat(topStr) / 100) * hostRect.height : parseFloat(topStr);
    }

    let right = 0;
    let hasRight = false;
    if (rightStr && rightStr !== 'auto') {
      hasRight = true;
      right = rightStr.endsWith('%') ? (parseFloat(rightStr) / 100) * hostRect.width : parseFloat(rightStr);
    }

    let bottom = 0;
    let hasBottom = false;
    if (bottomStr && bottomStr !== 'auto') {
      hasBottom = true;
      bottom = bottomStr.endsWith('%') ? (parseFloat(bottomStr) / 100) * hostRect.height : parseFloat(bottomStr);
    }

    if (hasLeft) {
      x += left;
    } else if (hasRight) {
      x += hostRect.width - right - w;
    }
    if (hasTop) {
      y += top;
    } else if (hasBottom) {
      y += hostRect.height - bottom - h;
    }
  } else {
    const marginLeft = parseFloat(pseudoStyle.marginLeft) || 0;
    const marginTop = parseFloat(pseudoStyle.marginTop) || 0;
    x += marginLeft;
    y += marginTop;
  }

  // Apply CSS transform translation (e.g. translateY(-50%))
  const transform = pseudoStyle.transform;
  if (transform && transform !== 'none') {
    const matrixMatch = transform.match(/matrix\((.+?)\)/);
    if (matrixMatch) {
      const parts = matrixMatch[1].split(',').map((p) => parseFloat(p.trim()));
      if (parts.length === 6) {
        x += parts[4];
        y += parts[5];
      }
    } else {
      const matrix3dMatch = transform.match(/matrix3d\((.+?)\)/);
      if (matrix3dMatch) {
        const parts = matrix3dMatch[1].split(',').map((p) => parseFloat(p.trim()));
        if (parts.length === 16) {
          x += parts[12];
          y += parts[13];
        }
      }
    }
  }

  return { left: x, top: y, width: w, height: h };
}

function preparePseudoElementItem(node, pseudoType, hostRect, config, zIndex, domOrder, pptx, globalOptions = {}) {
  const pseudoStyle = window.getComputedStyle(node, pseudoType);
  const content = pseudoStyle.content;
  const hasContent = content && content !== 'none' && content !== 'normal' && content !== '""';

  const bgColor = parseColor(pseudoStyle.backgroundColor);
  const hasBg = bgColor.hex && bgColor.opacity > 0;
  const borderCol = parseColor(pseudoStyle.borderColor);
  const borderWidth = parseFloat(pseudoStyle.borderWidth) || 0;
  const hasBorder = borderWidth > 0 && borderCol.opacity > 0;

  const bgImgStr = pseudoStyle.backgroundImage;
  const hasGradient = bgImgStr && bgImgStr.includes('linear-gradient');

  // Check for border triangle
  let wPx = parseFloat(pseudoStyle.width) || 0;
  let hPx = parseFloat(pseudoStyle.height) || 0;
  const borderLeft = parseFloat(pseudoStyle.borderLeftWidth) || 0;
  const borderRight = parseFloat(pseudoStyle.borderRightWidth) || 0;
  const borderTop = parseFloat(pseudoStyle.borderTopWidth) || 0;
  const borderBottom = parseFloat(pseudoStyle.borderBottomWidth) || 0;
  const isTriangle =
    wPx === 0 && hPx === 0 && (borderLeft > 0 || borderRight > 0) && (borderTop > 0 || borderBottom > 0);

  const isDisplayNone = pseudoStyle.display === 'none';
  const isVisible = !isDisplayNone && (hasContent || hasBg || hasBorder || hasGradient || isTriangle);

  if (!isVisible) return null;

  const rect = getPseudoElementRect(hostRect, pseudoStyle);
  if (!rect) {
    if (isVisible) {
      console.warn(
        `dom-to-pptx: Unsupported pseudo-element ${pseudoType} on ${getNodeSelector(node)} due to zero dimensions. Element dropped.`
      );
    }
    return null;
  }

  const scale = config.scale;
  const w = rect.width * PX_TO_INCH * scale;
  const h = rect.height * PX_TO_INCH * scale;
  const x = config.offX + (rect.left - config.rootX) * PX_TO_INCH * scale;
  const y = config.offY + (rect.top - config.rootY) * PX_TO_INCH * scale;

  const rotation = getRotation(pseudoStyle.transform);

  // 1. Handle CSS Border Triangle
  if (isTriangle) {
    const triangleSvg = generateBorderTriangleSVG(rect.width, rect.height, borderLeft, borderTop, pseudoStyle);
    if (triangleSvg) {
      return {
        item: {
          type: 'image',
          zIndex,
          domOrder,
          options: {
            data: triangleSvg,
            x,
            y,
            w,
            h,
            rotate: rotation,
          },
        },
        job: null,
      };
    }
  }

  // 2. Handle background gradient
  if (hasGradient) {
    const borderRadius = parseFloat(pseudoStyle.borderRadius) || 0;
    const gradientData = generateGradientSVG(
      rect.width,
      rect.height,
      bgImgStr,
      borderRadius,
      hasBorder ? { color: borderCol.hex, width: borderWidth } : null
    );

    if (gradientData) {
      return {
        item: {
          type: 'image',
          zIndex,
          domOrder,
          options: {
            data: gradientData,
            x,
            y,
            w,
            h,
            rotate: rotation,
          },
        },
        job: null,
      };
    }
  }

  const borderRadius = parseFloat(pseudoStyle.borderRadius) || 0;
  const isCircle = borderRadius >= Math.min(rect.width, rect.height) / 2 - 1;

  // 3. Handle Text / Icon
  if (hasContent) {
    const cleanText = content.replace(/^['"]|['"]$/g, '');
    const textOpts = getTextStyle(pseudoStyle, scale, false);
    const textOptions = {
      x,
      y,
      w,
      h,
      align: pseudoStyle.textAlign || 'left',
      valign: 'middle',
      margin: 0,
      wrap: true,
      ...textOpts,
      ...(hasBg && { fill: { color: bgColor.hex, transparency: (1 - bgColor.opacity) * 100 } }),
      line: hasBorder ? { color: borderCol.hex, width: borderWidth * 0.75 * scale } : null,
    };

    if (isCircle) {
      textOptions.rectRadius = Math.min(w, h) / 2;
    } else if (borderRadius > 0) {
      let cappedRadiusPx = Math.min(borderRadius, Math.min(rect.width, rect.height) / 2);
      textOptions.rectRadius = cappedRadiusPx * PX_TO_INCH * scale;
    }

    return {
      item: {
        type: 'text',
        zIndex,
        domOrder,
        textParts: [
          {
            text: cleanText,
            options: textOpts,
          },
        ],
        options: textOptions,
      },
      job: null,
    };
  }

  // 4. Handle Standard Solid Shapes
  if (hasBg || hasBorder) {
    let shapeType = pptx.ShapeType.rect;
    let shapeOpts = {
      x,
      y,
      w,
      h,
      ...(hasBg && { fill: { color: bgColor.hex, transparency: (1 - bgColor.opacity) * 100 } }),
      line: hasBorder ? { color: borderCol.hex, width: borderWidth * 0.75 * scale } : null,
    };

    if (isCircle) {
      shapeType = pptx.ShapeType.ellipse;
    } else if (borderRadius > 0) {
      shapeType = pptx.ShapeType.roundRect;
      let cappedRadiusPx = Math.min(borderRadius, Math.min(rect.width, rect.height) / 2);
      shapeOpts.rectRadius = cappedRadiusPx * PX_TO_INCH * scale;
    }

    return {
      item: {
        type: 'shape',
        zIndex,
        domOrder,
        shapeType,
        options: shapeOpts,
      },
      job: null,
    };
  }

  // 5. Fallback for Complex CSS Shapes (parallelograms, hexagons, clip-paths, speech bubbles, etc.)
  const canvasItem = {
    type: 'image',
    zIndex,
    domOrder,
    options: { x, y, w, h, rotate: rotation, data: null },
  };

  const canvasJob = async () => {
    const dataUrl = await capturePseudoElementCanvas(node, pseudoType, rect.width, rect.height);
    if (dataUrl) canvasItem.options.data = dataUrl;
    else canvasItem.skip = true;
  };

  return { item: canvasItem, job: canvasJob };
}

function countParagraphs(node, scale) {
  if (!node) return 1;
  const style = window.getComputedStyle(node);
  const parts = collectTextParts(node, style, scale, null, true, 1);
  let count = 1;
  for (const part of parts) {
    if (part.options?.breakLine) {
      count++;
    }
  }
  return count;
}

function prepareRenderItem(node, config, domOrder, pptx, effectiveZIndex, computedStyle, globalOptions = {}) {
  // 1. Text Node Handling
  if (node.nodeType === 3) {
    const textContent = node.nodeValue.trim();
    if (!textContent) return null;

    const parent = node.parentElement;
    if (!parent) return null;

    if (isTextContainerCached(parent, globalOptions._textContainerCache)) return null; // Parent handles it

    const range = document.createRange();
    range.selectNode(node);
    const rect = range.getBoundingClientRect();
    range.detach();

    const style = window.getComputedStyle(parent);
    const widthPx = rect.width;
    const heightPx = rect.height;
    const unrotatedW = widthPx * PX_TO_INCH * config.scale;
    const unrotatedH = heightPx * PX_TO_INCH * config.scale;

    const x = config.offX + (rect.left - config.rootX) * PX_TO_INCH * config.scale;
    const y = config.offY + (rect.top - config.rootY) * PX_TO_INCH * config.scale;

    const textOpts = getTextStyle(style, config.scale, true, globalOptions._inheritedOpacity || 1);

    // Apply __spc_ suffix if charSpacing is defined
    if (textOpts.charSpacing !== undefined) {
      const spcVal = Math.round(textOpts.charSpacing * 100);
      if (textOpts.fontFace) {
        textOpts.fontFace = `${textOpts.fontFace}__spc_${spcVal}`;
      }
    }

    return {
      items: [
        {
          type: 'text',
          zIndex: effectiveZIndex.concat([0, -1]),
          domOrder,
          textParts: [
            {
              text: textContent,
              options: textOpts,
            },
          ],
          // Honor CSS white-space: a `nowrap`/`pre` element must not re-wrap in
          // the exported slide (otherwise a single line measured in the browser
          // can wrap in PowerPoint/LibreOffice due to font-metric differences).
          options: {
            x,
            y,
            w: unrotatedW,
            h: unrotatedH,
            margin: 0,
            autoFit: true,
            wrap: !(style.whiteSpace === 'nowrap' || style.whiteSpace === 'pre'),
          },
        },
      ],
      stopRecursion: false,
    };
  }

  if (node.nodeType !== 1) return null;

  // If this element has an ancestor that is a text container,
  // its text/content is already captured as part of that ancestor's text box.
  // We should not render a separate shape/text box for it.
  let ancestor = node.parentElement;
  while (ancestor) {
    if (isTextContainerCached(ancestor, globalOptions._textContainerCache)) {
      return null;
    }
    ancestor = ancestor.parentElement;
  }

  const style = computedStyle; // Use pre-computed style

  const anim = parseAnimation(node, style);
  // Use the node's own animation, or fall back to the inherited one from an ancestor.
  // Inherited animations use start='with' so children animate simultaneously with the parent.
  const effectiveAnim =
    anim || (globalOptions._inheritedAnimation ? { ...globalOptions._inheritedAnimation, start: 'with' } : null);
  if (effectiveAnim) {
    let numParagraphs = 1;
    if (isTextContainerCached(node, globalOptions._textContainerCache)) {
      numParagraphs = countParagraphs(node, config.scale);
    }
    globalOptions._animations = globalOptions._animations || [];
    globalOptions._animations.push({
      domOrder,
      ...effectiveAnim,
      numParagraphs,
    });
  }

  const rect = node.getBoundingClientRect();
  if (rect.width < 0.5 || rect.height < 0.5) return null;

  const parentSortKey = effectiveZIndex;
  const rotation = getRotation(style.transform);
  const writingModeVert = getWritingModeVert(style.writingMode, style.textOrientation);
  const elementOpacity = parseFloat(style.opacity);
  const localOpacity = isNaN(elementOpacity) ? 1 : elementOpacity;
  const inheritedOpacity = globalOptions._inheritedOpacity || 1;
  const safeOpacity = localOpacity * inheritedOpacity;

  // Prefer the sub-pixel rect size to avoid 1px text-wrap artifacts caused by
  // offsetWidth/offsetHeight being integer-rounded. When the element is rotated
  // we must fall back to offset* because rect.* describes the rotated bounding box.
  const widthPx = rotation === 0 ? rect.width || node.offsetWidth : node.offsetWidth || rect.width;
  const heightPx = rotation === 0 ? rect.height || node.offsetHeight : node.offsetHeight || rect.height;
  const unrotatedW = widthPx * PX_TO_INCH * config.scale;
  const unrotatedH = heightPx * PX_TO_INCH * config.scale;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  let x = config.offX + (centerX - config.rootX) * PX_TO_INCH * config.scale - unrotatedW / 2;
  let y = config.offY + (centerY - config.rootY) * PX_TO_INCH * config.scale - unrotatedH / 2;
  let w = unrotatedW;
  let h = unrotatedH;

  const items = [];

  const customShapeName =
    style.getPropertyValue('--shape') ||
    style.getPropertyValue('--shape-type') ||
    style.getPropertyValue('--pptx-shape');

  if ((node?.tagName || '').toLowerCase() === 'table') {
    const tableData = extractTableData(node, config.scale);
    const tableItems = [
      {
        type: 'table',
        zIndex: parentSortKey.concat([0, -1]),
        domOrder,
        tableData: tableData,
        options: { x, y, w: unrotatedW, h: unrotatedH },
      },
    ];

    // 1. Check for Background / Shadow / Radius on the table itself
    const shadowStr = style.boxShadow;
    const hasShadow = shadowStr && shadowStr !== 'none';
    const borderRadius = parseFloat(style.borderRadius) || 0;
    const bgColor = parseColor(style.backgroundColor);
    const hasBg = bgColor.hex && bgColor.opacity > 0;

    if (hasShadow || borderRadius > 0 || hasBg) {
      const transparency = (1 - bgColor.opacity) * 100;
      const shadow = hasShadow ? getVisibleShadow(shadowStr, config.scale) : null;
      let shapeType = pptx.ShapeType.rect;
      let rectRadius = 0;

      if (borderRadius > 0) {
        shapeType = pptx.ShapeType.roundRect;
        let cappedRadiusPx = Math.min(borderRadius, Math.min(widthPx, heightPx) / 2);
        rectRadius = cappedRadiusPx * PX_TO_INCH * config.scale;
      }

      // Add a backing shape item before the table
      tableItems.unshift({
        type: 'shape',
        zIndex: parentSortKey.concat([-Infinity]),
        domOrder, // Same domOrder ensures it renders before the table (queue order)
        shapeType,
        options: {
          x,
          y,
          w: unrotatedW,
          h: unrotatedH,
          ...(hasBg && { fill: { color: bgColor.hex, transparency } }),
          shadow,
          rectRadius,
        },
      });
    }

    return {
      items: tableItems,
      stopRecursion: true,
    };
  }

  const nodeTag = (node?.tagName || '').toLowerCase();
  if ((nodeTag === 'ul' || nodeTag === 'ol') && !isComplexHierarchy(node)) {
    const listItems = [];
    const liChildren = Array.from(node.children).filter((c) => (c?.tagName || '').toLowerCase() === 'li');

    // --- Extract UL/OL container CSS for proper rendering ---
    const ulPaddingTop = parseFloat(style.paddingTop) || 0;
    const ulPaddingRight = parseFloat(style.paddingRight) || 0;
    const ulPaddingBottom = parseFloat(style.paddingBottom) || 0;
    const ulPaddingLeft = parseFloat(style.paddingLeft) || 0;

    // PptxGenJS consumes the margin array as [lIns, rIns, bIns, tIns], in points
    const listMargin = [
      ulPaddingLeft * PX_TO_INCH * config.scale * 72,
      ulPaddingRight * PX_TO_INCH * config.scale * 72,
      ulPaddingBottom * PX_TO_INCH * config.scale * 72,
      ulPaddingTop * PX_TO_INCH * config.scale * 72,
    ];

    liChildren.forEach((child, index) => {
      const liStyle = window.getComputedStyle(child);
      const liRect = child.getBoundingClientRect();
      const parentRect = node.getBoundingClientRect(); // node is UL/OL

      // 1. Determine Bullet Config
      let bullet;
      const listStyleType = liStyle.listStyleType || 'disc';

      if (nodeTag === 'ol' || listStyleType === 'decimal') {
        bullet = { type: 'number' };
      } else if (listStyleType === 'none') {
        bullet = false;
      } else {
        let code = '2022'; // disc
        if (listStyleType === 'circle') code = '25CB';
        if (listStyleType === 'square') code = '25A0';

        // --- CHANGE: Color & Size Logic (Option > ::marker > CSS color) ---
        let finalHex = '000000';
        let markerFontSize = null;

        // A. Check Global Option override
        if (globalOptions?.listConfig?.color) {
          finalHex = parseColor(globalOptions.listConfig.color).hex || '000000';
        }
        // B. Check ::marker pseudo element (supported in modern browsers)
        else {
          const markerStyle = window.getComputedStyle(child, '::marker');
          const markerColor = parseColor(markerStyle.color);
          if (markerColor.hex) {
            finalHex = markerColor.hex;
          } else {
            // C. Fallback to LI text color
            const colorObj = parseColor(liStyle.color);
            if (colorObj.hex) finalHex = colorObj.hex;
          }

          // Check ::marker font-size
          const markerFs = parseFloat(markerStyle.fontSize);
          if (!isNaN(markerFs) && markerFs > 0) {
            // Convert px->pt for PPTX
            markerFontSize = markerFs * 0.75 * config.scale;
          }
        }

        bullet = { code, color: finalHex };
        if (markerFontSize) {
          bullet.fontSize = markerFontSize;
        }
      }

      // 2. Calculate Bullet Indent
      // visualIndentPx = total horizontal offset from UL left edge to where the LI text starts.
      // ulPaddingLeft = UL's own left padding; it's already accounted for by the text box margin.
      // bullet.indent = gap between bullet glyph and text content, in points.
      // This equals the distance the LI content is shifted past the UL padding boundary.
      const visualIndentPx = liRect.left - parentRect.left;
      // Bullet indent = visual indent minus the UL's own padding-left (which is in margin) plus the LI's padding-left,
      // clamped to 0. Convert px -> pt.
      const liPaddingLeft = parseFloat(liStyle.paddingLeft) || 0;
      const extraIndentPx = Math.max(0, visualIndentPx - ulPaddingLeft);
      const visualIndentOffset = extraIndentPx > 5 ? extraIndentPx : 0;

      if (bullet) {
        bullet.indent = 20 * config.scale + (visualIndentOffset + liPaddingLeft) * 0.75 * config.scale;
      }

      // 3. Extract Text Parts
      const parts = collectTextParts(child, liStyle, config.scale);

      if (parts.length > 0) {
        parts.forEach((p) => {
          if (!p.options) p.options = {};
        });

        // A. Apply Bullet
        if (bullet) {
          if (parts.length > 0) {
            parts.forEach((p) => {
              p.options.bullet = bullet;
            });
          } else {
            parts.push({
              text: '',
              options: {
                bullet: bullet,
              },
            });
          }
        }

        // B. Apply Spacing
        let ptBefore = 0;
        let ptAfter = 0;

        if (globalOptions.listConfig?.spacing) {
          if (typeof globalOptions.listConfig.spacing.before === 'number') {
            ptBefore = globalOptions.listConfig.spacing.before;
          }
          if (typeof globalOptions.listConfig.spacing.after === 'number') {
            ptAfter = globalOptions.listConfig.spacing.after;
          }
        } else {
          const mt = parseFloat(liStyle.marginTop) || 0;
          const mb = parseFloat(liStyle.marginBottom) || 0;
          if (mt > 0) ptBefore = mt * 0.75 * config.scale;
          if (mb > 0) ptAfter = mb * 0.75 * config.scale;
        }

        if (ptBefore > 0) {
          parts.forEach((p) => {
            p.options.paraSpaceBefore = ptBefore;
          });
        }
        if (ptAfter > 0) {
          parts.forEach((p) => {
            p.options.paraSpaceAfter = ptAfter;
          });
        }

        if (index < liChildren.length - 1) {
          parts[parts.length - 1].options.breakLine = true;
        }

        listItems.push(...parts);
      }
    });

    if (listItems.length > 0) {
      // Build background/border/shadow shape for the list container
      const bgColorObj = parseColor(style.backgroundColor);
      const hasBg = bgColorObj.hex && bgColorObj.opacity > 0;
      const borderColorObj = parseColor(style.borderColor);
      const borderWidth = parseFloat(style.borderWidth);
      const hasBorder = borderWidth > 0 && borderColorObj.hex;
      const shadowStr = style.boxShadow;
      const hasShadow = shadowStr && shadowStr !== 'none';

      // Resolve border-radius for the list container
      const listBorderRadius = parseFloat(style.borderRadius) || 0;
      const listMinDim = Math.min(widthPx, heightPx);
      const listIsPercent = style.borderRadius && style.borderRadius.toString().includes('%');
      let listRadiusPx = listBorderRadius;
      if (listIsPercent) listRadiusPx = (listBorderRadius / 100) * listMinDim;

      if (hasBg || hasBorder || hasShadow) {
        let listShapeType = pptx.ShapeType.rect;
        const listShapeOpts = {
          x,
          y,
          w,
          h,
          ...(hasBg && { fill: { color: bgColorObj.hex, transparency: (1 - bgColorObj.opacity) * 100 } }),
          ...(hasBorder && { line: { color: borderColorObj.hex, width: borderWidth * 0.75 * config.scale } }),
        };

        if (hasShadow) listShapeOpts.shadow = getVisibleShadow(shadowStr, config.scale);

        if (listRadiusPx > 0) {
          const isFullRound = listRadiusPx >= listMinDim / 2;
          const isSquare = Math.abs(widthPx - heightPx) < 1;
          if (isFullRound && (listIsPercent || isSquare)) {
            listShapeType = pptx.ShapeType.ellipse;
          } else {
            listShapeType = pptx.ShapeType.roundRect;
            listShapeOpts.rectRadius = Math.min(listRadiusPx, listMinDim / 2) * PX_TO_INCH * config.scale;
          }
        }

        items.push({
          type: 'shape',
          zIndex: parentSortKey.concat([-Infinity]),
          domOrder,
          shapeType: listShapeType,
          options: listShapeOpts,
        });
      }

      items.push({
        type: 'text',
        zIndex: parentSortKey.concat([0, -1]),
        domOrder,
        textParts: listItems,
        options: {
          x,
          y,
          w,
          h,
          align: 'left',
          valign: 'top',
          // CSS padding applied as PPTX text box insets, in points
          margin: listMargin,
          autoFit: true,
          wrap: !(style.whiteSpace === 'nowrap' || style.whiteSpace === 'pre'),
          vert: writingModeVert,
          ...(writingModeVert && { textDirection: mapVertToTextDirection(writingModeVert) }),
        },
      });

      return { items, stopRecursion: true };
    }
  }

  if ((node?.tagName || '').toLowerCase() === 'canvas') {
    const item = {
      type: 'image',
      zIndex: parentSortKey.concat([0, -1]),
      domOrder,
      options: { x, y, w, h, rotate: rotation, data: null },
    };

    const job = async () => {
      try {
        const dataUrl = node.toDataURL('image/png');
        if (dataUrl && dataUrl.length > 10) {
          item.options.data = dataUrl;
        } else {
          item.skip = true;
        }
      } catch (e) {
        console.warn('Failed to capture canvas content:', e);
        item.skip = true;
      }
    };

    return { items: [item], job, stopRecursion: true };
  }

  // --- ASYNC JOB: SVG Tags ---
  if ((node?.nodeName || '').toLowerCase() === 'svg') {
    const item = {
      type: 'image',
      zIndex: parentSortKey.concat([0, -1]),
      domOrder,
      options: { data: null, x, y, w, h, rotate: rotation },
    };

    const job = async () => {
      const converter = globalOptions.svgAsVector ? svgToSvg : svgToPng;
      const processed = await converter(node);
      if (processed) item.options.data = processed;
      else item.skip = true;
    };

    return { items: [item], job, stopRecursion: true };
  }

  // --- ASYNC JOB: IMG Tags ---
  if ((node?.tagName || '').toLowerCase() === 'img') {
    let radii = {
      tl: parseFloat(style.borderTopLeftRadius) || 0,
      tr: parseFloat(style.borderTopRightRadius) || 0,
      br: parseFloat(style.borderBottomRightRadius) || 0,
      bl: parseFloat(style.borderBottomLeftRadius) || 0,
    };

    const hasAnyRadius = radii.tl > 0 || radii.tr > 0 || radii.br > 0 || radii.bl > 0;
    if (!hasAnyRadius) {
      const parent = node.parentElement;
      const parentStyle = window.getComputedStyle(parent);
      if (parentStyle.overflow !== 'visible') {
        const pRadii = {
          tl: parseFloat(parentStyle.borderTopLeftRadius) || 0,
          tr: parseFloat(parentStyle.borderTopRightRadius) || 0,
          br: parseFloat(parentStyle.borderBottomRightRadius) || 0,
          bl: parseFloat(parentStyle.borderBottomLeftRadius) || 0,
        };
        const pRect = parent.getBoundingClientRect();
        if (Math.abs(pRect.width - rect.width) < 5 && Math.abs(pRect.height - rect.height) < 5) {
          radii = pRadii;
        }
      }
    }

    const objectFit = style.objectFit || 'fill';
    const objectPosition = style.objectPosition || '50% 50%';

    const item = {
      type: 'image',
      zIndex: parentSortKey.concat([0, -1]),
      domOrder,
      options: { x, y, w, h, rotate: rotation, data: null },
    };

    const job = async () => {
      const processed = await getProcessedImage(node.src, widthPx, heightPx, radii, objectFit, objectPosition);
      if (processed) item.options.data = processed;
      else item.skip = true;
    };

    return { items: [item], job, stopRecursion: true };
  }

  // --- ASYNC JOB: Icons and Other Elements ---
  if (isIconElement(node)) {
    const item = {
      type: 'image',
      zIndex: parentSortKey.concat([0, -1]),
      domOrder,
      options: { x, y, w, h, rotate: rotation, data: null },
    };
    const job = async () => {
      const pngData = await elementToCanvasImage(node, widthPx, heightPx);
      if (pngData) item.options.data = pngData;
      else item.skip = true;
    };
    return { items: [item], job, stopRecursion: true };
  }

  // Radii logic
  const borderRadiusValue = parseFloat(style.borderRadius) || 0;
  const borderBottomLeftRadius = parseFloat(style.borderBottomLeftRadius) || 0;
  const borderBottomRightRadius = parseFloat(style.borderBottomRightRadius) || 0;
  const borderTopLeftRadius = parseFloat(style.borderTopLeftRadius) || 0;
  const borderTopRightRadius = parseFloat(style.borderTopRightRadius) || 0;

  const hasPartialBorderRadius =
    borderTopLeftRadius !== borderTopRightRadius ||
    borderTopLeftRadius !== borderBottomRightRadius ||
    borderTopLeftRadius !== borderBottomLeftRadius;

  const tempBg = parseColor(style.backgroundColor);
  const isTxt = isTextContainerCached(node, globalOptions._textContainerCache);
  const hasContent = node.textContent.trim().length > 0 || node.children.length > 0;

  if (hasPartialBorderRadius && tempBg.hex && !isTxt && !hasContent && !customShapeName) {
    const shapeSvg = generateCustomShapeSVG(widthPx, heightPx, tempBg.hex, tempBg.opacity, {
      tl: parseFloat(style.borderTopLeftRadius) || 0,
      tr: parseFloat(style.borderTopRightRadius) || 0,
      br: parseFloat(style.borderBottomRightRadius) || 0,
      bl: parseFloat(style.borderBottomLeftRadius) || 0,
    });

    items.push({
      type: 'image',
      zIndex: parentSortKey.concat([-Infinity]),
      domOrder,
      options: { data: shapeSvg, x, y, w, h, rotate: rotation },
    });
  }

  let bgJob = null;

  // --- ASYNC JOB: Clipped Divs via Canvas ---
  if (hasPartialBorderRadius && isClippedByParent(node) && !hasContent) {
    const marginLeft = parseFloat(style.marginLeft) || 0;
    const marginTop = parseFloat(style.marginTop) || 0;
    x += marginLeft * PX_TO_INCH * config.scale;
    y += marginTop * PX_TO_INCH * config.scale;

    const item = {
      type: 'image',
      zIndex: parentSortKey.concat([0, -1]),
      domOrder,
      options: { x, y, w, h, rotate: rotation, data: null },
    };

    bgJob = async () => {
      const canvasImageData = await elementToCanvasImage(node, widthPx, heightPx);
      if (canvasImageData) item.options.data = canvasImageData;
      else item.skip = true;
    };

    items.push(item);
  }

  // --- SYNC: Standard CSS Extraction ---
  const bgColorObj = parseColor(style.backgroundColor);
  const bgClip = style.webkitBackgroundClip || style.backgroundClip;
  const isBgClipText = bgClip === 'text';
  const bgImgStr = style.backgroundImage;
  const hasGradient = !isBgClipText && bgImgStr && bgImgStr.includes('linear-gradient');
  const urlMatch = !isBgClipText && !hasGradient && bgImgStr ? bgImgStr.match(/url\(['"]?(.*?)['"]?\)/) : null;
  const hasBgImgUrl = !!urlMatch;

  const borderColorObj = parseColor(style.borderColor);
  const borderWidth = parseFloat(style.borderWidth);
  const hasBorder = borderWidth > 0 && borderColorObj.hex;

  const borderInfo = getBorderInfo(style, config.scale);
  const hasUniformBorder = borderInfo.type === 'uniform';
  const hasCompositeBorder = borderInfo.type === 'composite';

  const shadowStr = style.boxShadow;
  const hasShadow = shadowStr && shadowStr !== 'none';
  const softEdge = getSoftEdges(style.filter, config.scale);

  let isImageWrapper = false;
  const imgChild = Array.from(node.children).find((c) => (c?.tagName || '').toLowerCase() === 'img');
  if (imgChild) {
    const childW = imgChild.offsetWidth || imgChild.getBoundingClientRect().width;
    const childH = imgChild.offsetHeight || imgChild.getBoundingClientRect().height;
    if (childW >= widthPx - 2 && childH >= heightPx - 2) isImageWrapper = true;
  }

  let textPayload = null;
  const isText = isTextContainerCached(node, globalOptions._textContainerCache);

  if (isText) {
    const textParts = collectTextParts(node, style, config.scale, null, true, inheritedOpacity);

    if (textParts.length > 0) {
      let align = style.textAlign || 'left';
      if (align === 'start') align = 'left';
      if (align === 'end') align = 'right';
      let valign = 'top';
      if (style.verticalAlign === 'middle') valign = 'middle';
      if (style.verticalAlign === 'bottom') valign = 'bottom';

      const isVertical = writingModeVert && writingModeVert !== 'none';
      const isColumn = style.flexDirection === 'column' || style.flexDirection === 'column-reverse';

      if (isVertical || isColumn) {
        if (style.alignItems === 'center') align = 'center';
        if (style.alignItems === 'flex-end' || style.alignItems === 'end') align = 'right';

        if (style.justifyContent === 'center' && style.display.includes('flex')) valign = 'middle';
        if (style.justifyContent === 'flex-end' && style.display.includes('flex')) valign = 'bottom';
      } else {
        if (style.alignItems === 'center') valign = 'middle';
        if (style.alignItems === 'flex-end' || style.alignItems === 'end') valign = 'bottom';

        if (style.justifyContent === 'center' && style.display.includes('flex')) align = 'center';
        if (style.justifyContent === 'flex-end' || style.justifyContent === 'end') {
          if (style.display.includes('flex')) align = 'right';
        }
      }

      if (isVertical) {
        textParts.forEach((p) => {
          if (p.options) delete p.options.lineSpacing;
        });
      }

      const padding = getPadding(style, config.scale);
      // getPadding returns [top, right, bottom, left]; PptxGenJS consumes the margin
      // array as [lIns, rIns, bIns, tIns], in points
      const margin = [
        padding[3] * 72, // left
        padding[1] * 72, // right
        padding[2] * 72, // bottom
        padding[0] * 72, // top
      ];

      textPayload = { text: textParts, align, valign, margin };
    }
  }

  if (hasBgImgUrl || hasGradient || (softEdge && bgColorObj.hex && !isImageWrapper)) {
    if (hasBgImgUrl) {
      const bgUrl = urlMatch[1];
      const radii = {
        tl: parseFloat(style.borderTopLeftRadius) || 0,
        tr: parseFloat(style.borderTopRightRadius) || 0,
        br: parseFloat(style.borderBottomRightRadius) || 0,
        bl: parseFloat(style.borderBottomLeftRadius) || 0,
      };

      const bgItem = {
        type: 'image',
        zIndex: parentSortKey.concat([-Infinity]),
        domOrder,
        options: { x, y, w, h, rotate: rotation, data: null },
      };
      items.push(bgItem);

      bgJob = async () => {
        const processed = await getProcessedImage(
          bgUrl,
          widthPx,
          heightPx,
          radii,
          style.backgroundSize || 'cover',
          style.backgroundPosition || '50% 50%'
        );
        if (processed) bgItem.options.data = processed;
        else bgItem.skip = true;
      };
    } else {
      let bgData;
      let padIn = 0;
      if (softEdge) {
        const svgInfo = generateBlurredSVG(widthPx, heightPx, bgColorObj.hex, borderRadiusValue, softEdge);
        bgData = svgInfo.data;
        padIn = svgInfo.padding * PX_TO_INCH * config.scale;
      } else {
        bgData = generateGradientSVG(
          widthPx,
          heightPx,
          style.backgroundImage,
          hasPartialBorderRadius
            ? {
                tl: borderTopLeftRadius,
                tr: borderTopRightRadius,
                br: borderBottomRightRadius,
                bl: borderBottomLeftRadius,
              }
            : borderRadiusValue,
          hasBorder ? { color: borderColorObj.hex, width: borderWidth } : null
        );
      }

      if (bgData) {
        items.push({
          type: 'image',
          zIndex: parentSortKey.concat([-Infinity]),
          domOrder,
          options: {
            data: bgData,
            x: x - padIn,
            y: y - padIn,
            w: w + padIn * 2,
            h: h + padIn * 2,
            rotate: rotation,
          },
        });
      }
    }

    if (textPayload) {
      items.push({
        type: 'text',
        zIndex: parentSortKey.concat([0, -1]),
        domOrder,
        textParts: textPayload.text,
        options: {
          x,
          y,
          w,
          h,
          align: textPayload.align,
          valign: textPayload.valign,
          rotate: rotation,
          margin: textPayload.margin,
          wrap: !(style.whiteSpace === 'nowrap' || style.whiteSpace === 'pre'),
          autoFit: true,
          vert: writingModeVert,
          ...(writingModeVert && { textDirection: mapVertToTextDirection(writingModeVert) }),
        },
      });
    }
    if (hasCompositeBorder) {
      const borderItems = createCompositeBorderItems(
        borderInfo.sides,
        x,
        y,
        w,
        h,
        config.scale,
        parentSortKey.concat([-500000]),
        domOrder
      );
      items.push(...borderItems);
    }
  } else if (
    (bgColorObj.hex && !isImageWrapper) ||
    hasUniformBorder ||
    hasCompositeBorder ||
    hasShadow ||
    textPayload ||
    customShapeName
  ) {
    const finalAlpha = safeOpacity * bgColorObj.opacity;
    const transparency = (1 - finalAlpha) * 100;
    const useSolidFill = (bgColorObj.hex && !isImageWrapper) || customShapeName;

    if (hasPartialBorderRadius && useSolidFill && !textPayload && !customShapeName) {
      const shapeSvg = generateCustomShapeSVG(widthPx, heightPx, bgColorObj.hex, bgColorObj.opacity, {
        tl: parseFloat(style.borderTopLeftRadius) || 0,
        tr: parseFloat(style.borderTopRightRadius) || 0,
        br: parseFloat(style.borderBottomRightRadius) || 0,
        bl: parseFloat(style.borderBottomLeftRadius) || 0,
      });

      items.push({
        type: 'image',
        zIndex: parentSortKey.concat([-Infinity]),
        domOrder,
        options: { data: shapeSvg, x, y, w, h, rotate: rotation },
      });
    } else {
      const shapeOpts = {
        x,
        y,
        w,
        h,
        rotate: rotation,
        ...(useSolidFill && {
          fill: { color: bgColorObj.hex || 'FFFFFF', transparency: transparency },
        }),
        line: hasUniformBorder ? borderInfo.options : null,
      };

      if (hasShadow) shapeOpts.shadow = getVisibleShadow(shadowStr, config.scale);

      const minDimension = Math.min(widthPx, heightPx);

      let rawRadius = parseFloat(style.borderRadius) || 0;
      const isPercentage = style.borderRadius && style.borderRadius.toString().includes('%');

      let radiusPx = rawRadius;
      if (isPercentage) {
        radiusPx = (rawRadius / 100) * minDimension;
      }

      let shapeType = pptx.ShapeType.rect;

      const isSquare = Math.abs(widthPx - heightPx) < 1;
      const isFullyRound = radiusPx >= minDimension / 2;

      if (customShapeName) {
        shapeType = getCustomShapeType(customShapeName, pptx);
      } else if (isFullyRound && (isPercentage || isSquare)) {
        shapeType = pptx.ShapeType.ellipse;
      } else if (radiusPx > 0) {
        shapeType = pptx.ShapeType.roundRect;
        let cappedRadiusPx = Math.min(radiusPx, minDimension / 2);
        shapeOpts.rectRadius = cappedRadiusPx * PX_TO_INCH * config.scale;
      }

      if (textPayload) {
        const textOptions = {
          shape: shapeType,
          ...shapeOpts,
          w,
          h,
          rotate: rotation,
          align: textPayload.align,
          valign: textPayload.valign,
          margin: textPayload.margin,
          wrap: !(style.whiteSpace === 'nowrap' || style.whiteSpace === 'pre'),
          autoFit: true,
          vert: writingModeVert,
          ...(writingModeVert && { textDirection: mapVertToTextDirection(writingModeVert) }),
        };
        items.push({
          type: 'text',
          zIndex: parentSortKey.concat([0, -1]),
          domOrder,
          textParts: textPayload.text,
          options: textOptions,
        });
      } else if (!hasPartialBorderRadius || customShapeName) {
        items.push({
          type: 'shape',
          zIndex: parentSortKey.concat([-Infinity]),
          domOrder,
          shapeType,
          options: shapeOpts,
        });
      }
    }

    if (hasCompositeBorder) {
      const borderSvgData = generateCompositeBorderSVG(widthPx, heightPx, borderRadiusValue, borderInfo.sides);
      if (borderSvgData) {
        items.push({
          type: 'image',
          zIndex: parentSortKey.concat([-500000]),
          domOrder,
          options: { data: borderSvgData, x, y, w, h, rotate: rotation },
        });
      }
    }
  }

  const pseudoJobs = [];

  if (globalOptions.includePseudoElements !== false) {
    const pseudoBeforeRes = preparePseudoElementItem(
      node,
      '::before',
      rect,
      config,
      parentSortKey.concat([-1000000]),
      domOrder,
      pptx,
      globalOptions
    );
    if (pseudoBeforeRes?.item) items.unshift(pseudoBeforeRes.item);
    if (pseudoBeforeRes?.job) pseudoJobs.push(pseudoBeforeRes.job);

    const pseudoAfterRes = preparePseudoElementItem(
      node,
      '::after',
      rect,
      config,
      parentSortKey.concat([0, Infinity]),
      domOrder,
      pptx,
      globalOptions
    );
    if (pseudoAfterRes?.item) items.push(pseudoAfterRes.item);
    if (pseudoAfterRes?.job) pseudoJobs.push(pseudoAfterRes.job);
  }

  const combinedJob =
    bgJob || pseudoJobs.length > 0
      ? async () => {
          if (bgJob) await bgJob();
          for (const j of pseudoJobs) await j();
        }
      : null;

  return { items, job: combinedJob, stopRecursion: !!textPayload };
}

function isComplexHierarchy(root) {
  // Use a simple tree traversal to find forbidden elements in the list structure
  const stack = [root];
  while (stack.length > 0) {
    const el = stack.pop();

    // 1. Layouts: Flex/Grid on LIs
    const elTag = (el?.tagName || '').toLowerCase();
    // 1. Layouts: Flex/Grid on LIs
    if (elTag === 'li') {
      const s = window.getComputedStyle(el);
      if (s.display === 'flex' || s.display === 'grid' || s.display === 'inline-flex') return true;
    }

    // 2. Media / Icons
    if (['img', 'svg', 'canvas', 'video', 'iframe'].includes(elTag)) return true;
    if (isIconElement(el)) return true;

    // 3. Nested Lists (Flattening logic doesn't support nested bullets well yet)
    if (el !== root && (elTag === 'ul' || elTag === 'ol')) return true;

    // Recurse, but don't go too deep if not needed
    for (let i = 0; i < el.children.length; i++) {
      stack.push(el.children[i]);
    }
  }
  return false;
}

function createCompositeBorderItems(sides, x, y, w, h, scale, zIndex, domOrder) {
  const items = [];
  const pxToInch = 1 / 96;
  const common = { zIndex: zIndex, domOrder, shapeType: 'rect' };

  if (sides.top.width > 0)
    items.push({
      ...common,
      options: {
        x,
        y,
        w,
        h: sides.top.width * pxToInch * scale,
        fill: {
          color: sides.top.color,
          ...(sides.top.opacity < 1 && { transparency: (1 - sides.top.opacity) * 100 }),
        },
      },
    });
  if (sides.right.width > 0)
    items.push({
      ...common,
      options: {
        x: x + w - sides.right.width * pxToInch * scale,
        y,
        w: sides.right.width * pxToInch * scale,
        h,
        fill: {
          color: sides.right.color,
          ...(sides.right.opacity < 1 && { transparency: (1 - sides.right.opacity) * 100 }),
        },
      },
    });
  if (sides.bottom.width > 0)
    items.push({
      ...common,
      options: {
        x,
        y: y + h - sides.bottom.width * pxToInch * scale,
        w,
        h: sides.bottom.width * pxToInch * scale,
        fill: {
          color: sides.bottom.color,
          ...(sides.bottom.opacity < 1 && { transparency: (1 - sides.bottom.opacity) * 100 }),
        },
      },
    });
  if (sides.left.width > 0)
    items.push({
      ...common,
      options: {
        x,
        y,
        w: sides.left.width * pxToInch * scale,
        h,
        fill: {
          color: sides.left.color,
          ...(sides.left.opacity < 1 && { transparency: (1 - sides.left.opacity) * 100 }),
        },
      },
    });

  return items;
}

function getBrowserAnimationName(name, direction, orientation) {
  let animName = name.toLowerCase();

  // Map compatibility aliases to base names
  if (animName === 'rise-up' || animName === 'drop-in') animName = 'fade-in';
  if (animName === 'drop-out') animName = 'fade-out';
  if (animName.startsWith('swivel-in')) animName = 'fade-in';
  if (animName.startsWith('swivel-out')) animName = 'fade-out';
  if (animName.startsWith('fly-in-left')) {
    animName = 'fly-in';
    direction = 'left';
  }
  if (animName.startsWith('fly-in-right')) {
    animName = 'fly-in';
    direction = 'right';
  }
  if (animName.startsWith('fly-in-top')) {
    animName = 'fly-in';
    direction = 'down';
  }
  if (animName.startsWith('fly-in-bottom')) {
    animName = 'fly-in';
    direction = 'up';
  }
  if (animName.startsWith('fly-out-left')) {
    animName = 'fly-out';
    direction = 'left';
  }
  if (animName.startsWith('fly-out-right')) {
    animName = 'fly-out';
    direction = 'right';
  }
  if (animName.startsWith('fly-out-top')) {
    animName = 'fly-out';
    direction = 'up';
  }
  if (animName.startsWith('fly-out-bottom')) {
    animName = 'fly-out';
    direction = 'down';
  }

  if (animName.startsWith('fly-in')) {
    const dir = direction || 'up';
    animName = `fly-in-to-${dir}`;
  } else if (animName.startsWith('fly-out')) {
    const dir = direction || 'down';
    animName = `fly-out-to-${dir}`;
  } else if (animName.startsWith('wipe-in')) {
    const dir = direction || 'down';
    animName = `wipe-in-to-${dir}`;
  } else if (animName.startsWith('wipe-out')) {
    const dir = direction || 'down';
    animName = `wipe-out-to-${dir}`;
  } else if (animName.startsWith('split-in')) {
    const orient = orientation || 'vertical';
    animName = `split-in-${orient}`;
  } else if (animName.startsWith('split-out')) {
    const orient = orientation || 'vertical';
    animName = `split-out-${orient}`;
  } else if (animName.startsWith('random-bars-in') || animName.startsWith('randombar-in')) {
    const orient = orientation || 'horizontal';
    animName = `random-bars-in-${orient}`;
  } else if (animName.startsWith('random-bars-out') || animName.startsWith('randombar-out')) {
    const orient = orientation || 'horizontal';
    animName = `random-bars-out-${orient}`;
  }
  return animName;
}

function makeParagraphBuild(el, anim, baseDelay, playState = 'running', triggerGap = 800) {
  const children = Array.from(el.children);
  if (children.length === 0) return [];

  // Start child staggers after the parent container animation finishes
  let currentDelay = baseDelay + anim.duration;
  const childElements = [];

  children.forEach((child, index) => {
    child.style.animationName = getBrowserAnimationName(anim.name, anim.direction, anim.orientation);
    child.style.animationDuration = `${anim.duration}ms`;
    child.style.animationFillMode = 'both';
    child.style.animationPlayState = playState;

    if (index === 0) {
      child.style.animationDelay = `${currentDelay}ms`;
    } else {
      currentDelay += anim.duration + triggerGap;
      child.style.animationDelay = `${currentDelay}ms`;
    }
    childElements.push(child);
  });

  return childElements;
}

function makeLetterBuild(el, anim, baseDelay, playState = 'running') {
  const spans = [];
  const state = { charIndex: 0 };

  // Start letter typing after the parent container animation finishes
  const startDelay = baseDelay + anim.duration;

  function splitTextNodeIntoSpans(textNode) {
    const text = textNode.textContent;
    const parent = textNode.parentNode;
    const fragment = document.createDocumentFragment();

    for (const char of text) {
      const span = document.createElement('span');
      if (char === ' ') {
        span.innerHTML = '&nbsp;';
      } else {
        span.textContent = char;
      }
      span.style.display = 'inline-block';

      const animName = getBrowserAnimationName(anim.name, anim.direction, anim.orientation);
      span.style.animationName = animName;
      span.style.animationDuration = `${anim.duration}ms`;
      span.style.animationFillMode = 'both';
      span.style.animationPlayState = playState;

      // Stagger delay by 30ms per character
      const letterDelay = startDelay + state.charIndex * 30;
      span.style.animationDelay = `${letterDelay}ms`;

      fragment.appendChild(span);
      spans.push(span);
      state.charIndex++;
    }

    parent.replaceChild(fragment, textNode);
  }

  function walkTextNodes(node) {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === 3) {
        // Text Node
        if (child.textContent.trim().length > 0) {
          splitTextNodeIntoSpans(child);
        }
      } else if (child.nodeType === 1) {
        // Element Node
        walkTextNodes(child);
      }
    }
  }

  walkTextNodes(el);

  return spans;
}

function getActualEndTime(el, anim, baseDelay) {
  if (anim.build === 'paragraph') {
    const children = el.children ? Array.from(el.children) : [];
    if (children.length > 0) {
      const triggerGap = 800;
      let currentDelay = baseDelay + anim.duration;
      for (let i = 1; i < children.length; i++) {
        currentDelay += anim.duration + triggerGap;
      }
      return currentDelay + anim.duration;
    }
  } else if (anim.build === 'letter') {
    let charCount = 0;
    function countChars(node) {
      const children = Array.from(node.childNodes);
      for (const child of children) {
        if (child.nodeType === 3) {
          if (child.textContent.trim().length > 0) {
            charCount += child.textContent.length;
          }
        } else if (child.nodeType === 1) {
          countChars(child);
        }
      }
    }
    countChars(el);
    if (charCount > 0) {
      const startDelay = baseDelay + anim.duration;
      const lastCharDelay = startDelay + (charCount - 1) * 30;
      return lastCharDelay + anim.duration;
    }
  }
  return baseDelay + anim.duration;
}

/**
 * Applies browser animation inline styles by parsing animation class utilities.
 * This helper enables real-time browser previewing of custom slide animation speeds/delays.
 *
 * @param {HTMLElement} parentElement
 * @param {Object} [options]
 * @param {boolean} [options.enableClick=false] - If true, click-triggered builds require clicks to advance
 */
export function applyBrowserAnimations(parentElement, options = {}) {
  if (!parentElement) return;

  const elements = parentElement.querySelectorAll ? parentElement.querySelectorAll('*') : [];
  const allElements = [parentElement, ...Array.from(elements)];

  // 1. Apply basic utility classes for all elements (backward compatibility)
  for (const el of allElements) {
    if (el.nodeType !== 1) continue;
    let duration = null;
    let delay = null;
    const classList = el.classList ? Array.from(el.classList) : [];

    for (const cls of classList) {
      const durMatch = cls.match(/^animate-duration-\[(\d+)\]$/);
      if (durMatch) {
        duration = `${durMatch[1]}ms`;
      }
      const delayMatch = cls.match(/^animate-delay-\[(\d+)\]$/);
      if (delayMatch) {
        delay = `${delayMatch[1]}ms`;
      }
    }

    if (duration && el.style) el.style.animationDuration = duration;
    if (delay && el.style) el.style.animationDelay = delay;
  }

  // 2. Setup full timeline sequencer for elements with recognized slide animations
  const slides = parentElement.querySelectorAll ? parentElement.querySelectorAll('.slide') : [];
  const slidesList = slides.length > 0 ? Array.from(slides) : [parentElement];

  for (const slide of slidesList) {
    if (slide.__animationsApplied) continue;

    const slideElements = slide.querySelectorAll ? slide.querySelectorAll('*') : [];
    const allSlideElements = [slide, ...Array.from(slideElements)];
    const animatedElements = [];

    for (const el of allSlideElements) {
      if (el.nodeType !== 1) continue;
      let style;
      try {
        style = typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(el) : null;
      } catch (e) {
        style = null;
      }
      if (!style) {
        style = {
          animationName: el.style?.animationName || 'none',
          getPropertyValue: (prop) => el.style?.[prop] || '',
        };
      }

      const anim = parseAnimation(el, style);
      if (anim) {
        animatedElements.push({ el, anim });
      }
    }

    if (animatedElements.length === 0) continue;

    slide.__animationsApplied = true;

    // Group elements into sequential click-groups (steps)
    const stepGroups = [];
    let currentGroup = [];

    animatedElements.forEach((item) => {
      if (item.anim.start === 'click' && currentGroup.length > 0) {
        stepGroups.push(currentGroup);
        currentGroup = [];
      }
      currentGroup.push(item);
    });
    if (currentGroup.length > 0) {
      stepGroups.push(currentGroup);
    }

    const enableClick = options?.enableClick === true;
    let autoTimelineTime = 0;
    const stepAdvanceActions = [];

    stepGroups.forEach((group, groupIdx) => {
      let groupLocalStart = 0;
      let lastElementEndTime = 0;
      const groupActions = [];

      // Compute local delays relative to the step's start
      group.forEach((item, itemIdx) => {
        const { anim } = item;
        let localDelay = 0;

        if (itemIdx === 0) {
          localDelay = anim.delay;
          groupLocalStart = localDelay;
          lastElementEndTime = getActualEndTime(item.el, anim, localDelay);
        } else {
          if (anim.start === 'with') {
            localDelay = groupLocalStart + anim.delay;
            const endTime = getActualEndTime(item.el, anim, localDelay);
            if (endTime > lastElementEndTime) {
              lastElementEndTime = endTime;
            }
          } else if (anim.start === 'after') {
            localDelay = lastElementEndTime + anim.delay;
            groupLocalStart = localDelay;
            lastElementEndTime = getActualEndTime(item.el, anim, localDelay);
          }
        }
        item.computedLocalDelay = localDelay;
      });

      // Apply animation styles and builds
      const isPausedStep = enableClick && groupIdx > 0;
      const playState = isPausedStep ? 'paused' : 'running';

      group.forEach((item) => {
        const { el, anim, computedLocalDelay } = item;

        let finalDelay = computedLocalDelay;
        if (!enableClick && groupIdx > 0) {
          finalDelay += autoTimelineTime;
        }

        const resolvedAnimName = getBrowserAnimationName(anim.name, anim.direction, anim.orientation);
        if (el.style) {
          el.style.animationName = resolvedAnimName;
          el.style.animationDuration = `${anim.duration}ms`;
          el.style.animationDelay = `${finalDelay}ms`;
          el.style.animationFillMode = 'both';
          el.style.animationPlayState = playState;
        }

        let buildChildren = [];
        if (anim.build === 'paragraph') {
          buildChildren = makeParagraphBuild(el, anim, finalDelay, playState);
        } else if (anim.build === 'letter') {
          buildChildren = makeLetterBuild(el, anim, finalDelay, playState);
        }

        groupActions.push({ el, buildChildren });
      });

      stepAdvanceActions.push(groupActions);

      if (!enableClick) {
        // Advance automatic timeline by the maximum duration of this group plus a default gap
        let groupMaxEnd = 0;
        group.forEach((item) => {
          const end = getActualEndTime(item.el, item.anim, item.computedLocalDelay);
          if (end > groupMaxEnd) groupMaxEnd = end;
        });
        autoTimelineTime += groupMaxEnd + 800; // 800ms step delay
      }
    });

    // Bind click listener for click-to-play sequencing
    if (enableClick && stepAdvanceActions.length > 1 && slide.addEventListener) {
      let currentStep = 0;
      slide.addEventListener('click', (e) => {
        if (e.target && e.target.closest && (e.target.closest('a') || e.target.closest('button'))) return;

        if (currentStep < stepAdvanceActions.length - 1) {
          currentStep++;
          const actions = stepAdvanceActions[currentStep];
          actions.forEach(({ el, buildChildren }) => {
            if (el.style) el.style.animationPlayState = 'running';
            if (buildChildren) {
              buildChildren.forEach((child) => {
                if (child.style) child.style.animationPlayState = 'running';
              });
            }
          });
        }
      });
    }
  }
}
