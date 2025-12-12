// src/index.js
import * as PptxGenJSImport from 'pptxgenjs';
import html2canvas from 'html2canvas';

// Normalize import
const PptxGenJS = PptxGenJSImport?.default ?? PptxGenJSImport;

import {
  parseColor,
  getTextStyle,
  isTextContainer,
  getVisibleShadow,
  generateGradientSVG,
  getRotation,
  getPadding,
  getSoftEdges,
  generateBlurredSVG,
  getBorderInfo,
  generateCompositeBorderSVG,
  isClippedByParent,
  generateCustomShapeSVG,
} from './utils.js';
import { getProcessedImage } from './image-processor.js';

const PPI = 96;
const PX_TO_INCH = 1 / PPI;

/**
 * Main export function. Accepts single element or an array.
 * @param {HTMLElement | string | Array<HTMLElement | string>} target - The root element(s) to convert.
 * @param {Object} options - { fileName: string }
 */
export async function exportToPptx(target, options = {}) {
  const resolvePptxConstructor = (pkg) => {
    if (!pkg) return null;
    if (typeof pkg === 'function') return pkg;
    if (pkg && typeof pkg.default === 'function') return pkg.default;
    if (pkg && typeof pkg.PptxGenJS === 'function') return pkg.PptxGenJS;
    if (pkg && pkg.PptxGenJS && typeof pkg.PptxGenJS.default === 'function')
      return pkg.PptxGenJS.default;
    return null;
  };

  const PptxConstructor = resolvePptxConstructor(PptxGenJS);
  if (!PptxConstructor) throw new Error('PptxGenJS constructor not found.');
  const pptx = new PptxConstructor();
  pptx.layout = 'LAYOUT_16x9';

  const elements = Array.isArray(target) ? target : [target];

  for (const el of elements) {
    const root = typeof el === 'string' ? document.querySelector(el) : el;
    if (!root) {
      console.warn('Element not found, skipping slide:', el);
      continue;
    }
    const slide = pptx.addSlide();
    await processSlide(root, slide, pptx);
  }

  const fileName = options.fileName || 'export.pptx';
  pptx.writeFile({ fileName });
}

/**
 * Worker function to process a single DOM element into a single PPTX slide.
 * @param {HTMLElement} root - The root element for this slide.
 * @param {PptxGenJS.Slide} slide - The PPTX slide object to add content to.
 * @param {PptxGenJS} pptx - The main PPTX instance.
 */
async function processSlide(root, slide, pptx) {
  const rootRect = root.getBoundingClientRect();
  const PPTX_WIDTH_IN = 10;
  const PPTX_HEIGHT_IN = 5.625;

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
  function collect(node, parentZIndex) {
    const order = domOrderCounter++;

    let currentZ = parentZIndex;
    let nodeStyle = null;
    const nodeType = node.nodeType;

    if (nodeType === 1) {
      nodeStyle = window.getComputedStyle(node);
      // Optimization: Skip completely hidden elements immediately
      if (
        nodeStyle.display === 'none' ||
        nodeStyle.visibility === 'hidden' ||
        nodeStyle.opacity === '0'
      ) {
        return;
      }
      if (nodeStyle.zIndex !== 'auto') {
        currentZ = parseInt(nodeStyle.zIndex);
      }
    }

    // Prepare the item. If it needs async work, it returns a 'job'
    const result = prepareRenderItem(
      node,
      { ...layoutConfig, root },
      order,
      pptx,
      currentZ,
      nodeStyle
    );

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

    // Recurse children synchronously
    const childNodes = node.childNodes;
    for (let i = 0; i < childNodes.length; i++) {
      collect(childNodes[i], currentZ);
    }
  }

  // 1. Traverse and build the structure (Fast)
  collect(root, 0);

  // 2. Execute all heavy tasks in parallel (Fast)
  if (asyncTasks.length > 0) {
    await Promise.all(asyncTasks.map((task) => task()));
  }

  // 3. Cleanup and Sort
  // Remove items that failed to generate data (marked with skip)
  const finalQueue = renderQueue.filter(
    (item) => !item.skip && (item.type !== 'image' || item.options.data)
  );

  finalQueue.sort((a, b) => {
    if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex;
    return a.domOrder - b.domOrder;
  });

  // 4. Add to Slide
  for (const item of finalQueue) {
    if (item.type === 'shape') slide.addShape(item.shapeType, item.options);
    if (item.type === 'image') slide.addImage(item.options);
    if (item.type === 'text') slide.addText(item.textParts, item.options);
  }
}

/**
 * Optimized html2canvas wrapper
 * Now strictly captures the node itself, not the root.
 */
async function elementToCanvasImage(node, widthPx, heightPx) {
  return new Promise((resolve) => {
    const width = Math.max(Math.ceil(widthPx), 1);
    const height = Math.max(Math.ceil(heightPx), 1);
    const style = window.getComputedStyle(node);

    // Optimized: Capture ONLY the specific node
    html2canvas(node, {
      backgroundColor: null,
      logging: false,
      scale: 2, // Slight quality boost
    })
      .then((canvas) => {
        const destCanvas = document.createElement('canvas');
        destCanvas.width = width;
        destCanvas.height = height;
        const ctx = destCanvas.getContext('2d');

        // Draw the captured canvas into our sized canvas
        // html2canvas might return a larger canvas if scale > 1, so we fit it
        ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, width, height);

        // Apply border radius clipping
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
        console.warn('Canvas capture failed for node', node, e);
        resolve(null);
      });
  });
}

/**
 * Replaces createRenderItem.
 * Returns { items: [], job: () => Promise, stopRecursion: boolean }
 */
function prepareRenderItem(node, config, domOrder, pptx, effectiveZIndex, computedStyle) {
  // 1. Text Node Handling
  if (node.nodeType === 3) {
    const textContent = node.nodeValue.trim();
    if (!textContent) return null;

    const parent = node.parentElement;
    if (!parent) return null;

    if (isTextContainer(parent)) return null; // Parent handles it

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

    return {
      items: [
        {
          type: 'text',
          zIndex: effectiveZIndex,
          domOrder,
          textParts: [
            {
              text: textContent,
              options: getTextStyle(style, config.scale),
            },
          ],
          options: { x, y, w: unrotatedW, h: unrotatedH, margin: 0, autoFit: false },
        },
      ],
      stopRecursion: false,
    };
  }

  if (node.nodeType !== 1) return null;
  const style = computedStyle; // Use pre-computed style

  const rect = node.getBoundingClientRect();
  if (rect.width < 0.5 || rect.height < 0.5) return null;

  const zIndex = effectiveZIndex;
  const rotation = getRotation(style.transform);
  const elementOpacity = parseFloat(style.opacity);
  const safeOpacity = isNaN(elementOpacity) ? 1 : elementOpacity;

  const widthPx = node.offsetWidth || rect.width;
  const heightPx = node.offsetHeight || rect.height;
  const unrotatedW = widthPx * PX_TO_INCH * config.scale;
  const unrotatedH = heightPx * PX_TO_INCH * config.scale;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  let x = config.offX + (centerX - config.rootX) * PX_TO_INCH * config.scale - unrotatedW / 2;
  let y = config.offY + (centerY - config.rootY) * PX_TO_INCH * config.scale - unrotatedH / 2;
  let w = unrotatedW;
  let h = unrotatedH;

  const items = [];

  // --- ASYNC JOB: SVGs / Icons ---
  if (
    node.nodeName.toUpperCase() === 'SVG' ||
    node.tagName.includes('-') ||
    node.tagName === 'ION-ICON'
  ) {
    const item = {
      type: 'image',
      zIndex,
      domOrder,
      options: { x, y, w, h, rotate: rotation, data: null }, // Data null initially
    };

    // Create Job
    const job = async () => {
      const pngData = await elementToCanvasImage(node, widthPx, heightPx);
      if (pngData) item.options.data = pngData;
      else item.skip = true;
    };

    return { items: [item], job, stopRecursion: true };
  }

  // --- ASYNC JOB: IMG Tags ---
  if (node.tagName === 'IMG') {
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

    const item = {
      type: 'image',
      zIndex,
      domOrder,
      options: { x, y, w, h, rotate: rotation, data: null },
    };

    const job = async () => {
      const processed = await getProcessedImage(node.src, widthPx, heightPx, radii);
      if (processed) item.options.data = processed;
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
    (borderBottomLeftRadius > 0 && borderBottomLeftRadius !== borderRadiusValue) ||
    (borderBottomRightRadius > 0 && borderBottomRightRadius !== borderRadiusValue) ||
    (borderTopLeftRadius > 0 && borderTopLeftRadius !== borderRadiusValue) ||
    (borderTopRightRadius > 0 && borderTopRightRadius !== borderRadiusValue) ||
    (borderRadiusValue === 0 &&
      (borderBottomLeftRadius ||
        borderBottomRightRadius ||
        borderTopLeftRadius ||
        borderTopRightRadius));

  // --- ASYNC JOB: Clipped Divs via Canvas ---
  if (hasPartialBorderRadius && isClippedByParent(node)) {
    const marginLeft = parseFloat(style.marginLeft) || 0;
    const marginTop = parseFloat(style.marginTop) || 0;
    x += marginLeft * PX_TO_INCH * config.scale;
    y += marginTop * PX_TO_INCH * config.scale;

    const item = {
      type: 'image',
      zIndex,
      domOrder,
      options: { x, y, w, h, rotate: rotation, data: null },
    };

    const job = async () => {
      const canvasImageData = await elementToCanvasImage(node, widthPx, heightPx);
      if (canvasImageData) item.options.data = canvasImageData;
      else item.skip = true;
    };

    return { items: [item], job, stopRecursion: true };
  }

  // --- SYNC: Standard CSS Extraction ---
  const bgColorObj = parseColor(style.backgroundColor);
  const bgClip = style.webkitBackgroundClip || style.backgroundClip;
  const isBgClipText = bgClip === 'text';
  const hasGradient =
    !isBgClipText && style.backgroundImage && style.backgroundImage.includes('linear-gradient');

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
  const imgChild = Array.from(node.children).find((c) => c.tagName === 'IMG');
  if (imgChild) {
    const childW = imgChild.offsetWidth || imgChild.getBoundingClientRect().width;
    const childH = imgChild.offsetHeight || imgChild.getBoundingClientRect().height;
    if (childW >= widthPx - 2 && childH >= heightPx - 2) isImageWrapper = true;
  }

  let textPayload = null;
  const isText = isTextContainer(node);

  if (isText) {
    const textParts = [];
    const isList = style.display === 'list-item';
    if (isList) {
      const fontSizePt = parseFloat(style.fontSize) * 0.75 * config.scale;
      const bulletShift = (parseFloat(style.fontSize) || 16) * PX_TO_INCH * config.scale * 1.5;
      x -= bulletShift;
      w += bulletShift;
      textParts.push({
        text: '    ',
        options: {
          color: parseColor(style.color).hex || '000000',
          fontSize: fontSizePt,
        },
      });
    }

    node.childNodes.forEach((child, index) => {
      let textVal = child.nodeType === 3 ? child.nodeValue : child.textContent;
      let nodeStyle = child.nodeType === 1 ? window.getComputedStyle(child) : style;
      textVal = textVal.replace(/[\n\r\t]+/g, ' ').replace(/\s{2,}/g, ' ');
      if (index === 0 && !isList) textVal = textVal.trimStart();
      else if (index === 0) textVal = textVal.trimStart();
      if (index === node.childNodes.length - 1) textVal = textVal.trimEnd();
      if (nodeStyle.textTransform === 'uppercase') textVal = textVal.toUpperCase();
      if (nodeStyle.textTransform === 'lowercase') textVal = textVal.toLowerCase();

      if (textVal.length > 0) {
        textParts.push({
          text: textVal,
          options: getTextStyle(nodeStyle, config.scale),
        });
      }
    });

    if (textParts.length > 0) {
      let align = style.textAlign || 'left';
      if (align === 'start') align = 'left';
      if (align === 'end') align = 'right';
      let valign = 'top';
      if (style.alignItems === 'center') valign = 'middle';
      if (style.justifyContent === 'center' && style.display.includes('flex')) align = 'center';

      const pt = parseFloat(style.paddingTop) || 0;
      const pb = parseFloat(style.paddingBottom) || 0;
      if (Math.abs(pt - pb) < 2 && bgColorObj.hex) valign = 'middle';

      let padding = getPadding(style, config.scale);
      if (align === 'center' && valign === 'middle') padding = [0, 0, 0, 0];

      textPayload = { text: textParts, align, valign, inset: padding };
    }
  }

  if (hasGradient || (softEdge && bgColorObj.hex && !isImageWrapper)) {
    let bgData = null;
    let padIn = 0;
    if (softEdge) {
      const svgInfo = generateBlurredSVG(
        widthPx,
        heightPx,
        bgColorObj.hex,
        borderRadiusValue,
        softEdge
      );
      bgData = svgInfo.data;
      padIn = svgInfo.padding * PX_TO_INCH * config.scale;
    } else {
      bgData = generateGradientSVG(
        widthPx,
        heightPx,
        style.backgroundImage,
        borderRadiusValue,
        hasBorder ? { color: borderColorObj.hex, width: borderWidth } : null
      );
    }

    if (bgData) {
      items.push({
        type: 'image',
        zIndex,
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

    if (textPayload) {
      items.push({
        type: 'text',
        zIndex: zIndex + 1,
        domOrder,
        textParts: textPayload.text,
        options: {
          x,
          y,
          w,
          h,
          align: textPayload.align,
          valign: textPayload.valign,
          inset: textPayload.inset,
          rotate: rotation,
          margin: 0,
          wrap: true,
          autoFit: false,
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
        zIndex,
        domOrder
      );
      items.push(...borderItems);
    }
  } else if (
    (bgColorObj.hex && !isImageWrapper) ||
    hasUniformBorder ||
    hasCompositeBorder ||
    hasShadow ||
    textPayload
  ) {
    const finalAlpha = safeOpacity * bgColorObj.opacity;
    const transparency = (1 - finalAlpha) * 100;
    const useSolidFill = bgColorObj.hex && !isImageWrapper;

    if (hasPartialBorderRadius && useSolidFill && !textPayload) {
      const shapeSvg = generateCustomShapeSVG(
        widthPx,
        heightPx,
        bgColorObj.hex,
        bgColorObj.opacity,
        {
          tl: parseFloat(style.borderTopLeftRadius) || 0,
          tr: parseFloat(style.borderTopRightRadius) || 0,
          br: parseFloat(style.borderBottomRightRadius) || 0,
          bl: parseFloat(style.borderBottomLeftRadius) || 0,
        }
      );

      items.push({
        type: 'image',
        zIndex,
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
        fill: useSolidFill
          ? { color: bgColorObj.hex, transparency: transparency }
          : { type: 'none' },
        line: hasUniformBorder ? borderInfo.options : null,
      };

      if (hasShadow) shapeOpts.shadow = getVisibleShadow(shadowStr, config.scale);

      const borderRadius = parseFloat(style.borderRadius) || 0;
      const aspectRatio = Math.max(widthPx, heightPx) / Math.min(widthPx, heightPx);
      const isCircle = aspectRatio < 1.1 && borderRadius >= Math.min(widthPx, heightPx) / 2 - 1;

      let shapeType = pptx.ShapeType.rect;
      if (isCircle) shapeType = pptx.ShapeType.ellipse;
      else if (borderRadius > 0) {
        shapeType = pptx.ShapeType.roundRect;
        shapeOpts.rectRadius = Math.min(0.5, borderRadius / Math.min(widthPx, heightPx));
      }

      if (textPayload) {
        const textOptions = {
          shape: shapeType,
          ...shapeOpts,
          align: textPayload.align,
          valign: textPayload.valign,
          inset: textPayload.inset,
          margin: 0,
          wrap: true,
          autoFit: false,
        };
        items.push({
          type: 'text',
          zIndex,
          domOrder,
          textParts: textPayload.text,
          options: textOptions,
        });
      } else if (!hasPartialBorderRadius) {
        items.push({
          type: 'shape',
          zIndex,
          domOrder,
          shapeType,
          options: shapeOpts,
        });
      }
    }

    if (hasCompositeBorder) {
      const borderSvgData = generateCompositeBorderSVG(
        widthPx,
        heightPx,
        borderRadiusValue,
        borderInfo.sides
      );
      if (borderSvgData) {
        items.push({
          type: 'image',
          zIndex: zIndex + 1,
          domOrder,
          options: { data: borderSvgData, x, y, w, h, rotate: rotation },
        });
      }
    }
  }

  return { items, stopRecursion: !!textPayload };
}

function createCompositeBorderItems(sides, x, y, w, h, scale, zIndex, domOrder) {
  const items = [];
  const pxToInch = 1 / 96;
  const common = { zIndex: zIndex + 1, domOrder, shapeType: 'rect' };

  if (sides.top.width > 0)
    items.push({
      ...common,
      options: { x, y, w, h: sides.top.width * pxToInch * scale, fill: { color: sides.top.color } },
    });
  if (sides.right.width > 0)
    items.push({
      ...common,
      options: {
        x: x + w - sides.right.width * pxToInch * scale,
        y,
        w: sides.right.width * pxToInch * scale,
        h,
        fill: { color: sides.right.color },
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
        fill: { color: sides.bottom.color },
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
        fill: { color: sides.left.color },
      },
    });

  return items;
}
