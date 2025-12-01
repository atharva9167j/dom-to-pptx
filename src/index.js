// src/index.js
import PptxGenJS from "pptxgenjs";
// FIX: Added generateGradientTextSVG
import { parseColor, getTextStyle, isTextContainer, getVisibleShadow, generateGradientSVG, getRotation, svgToPng, getPadding, getSoftEdges, generateBlurredSVG } from "./utils.js";
import { getProcessedImage } from "./image-processor.js";

const PPI = 96;
const PX_TO_INCH = 1 / PPI;

export async function exportToPptx(elementOrSelector, options = {}) {
  const root = typeof elementOrSelector === "string" 
    ? document.querySelector(elementOrSelector) 
    : elementOrSelector;

  if (!root) throw new Error("Root element not found");

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  const slide = pptx.addSlide();

  const rootRect = root.getBoundingClientRect();
  const PPTX_WIDTH_IN = 10;
  const PPTX_HEIGHT_IN = 5.625;
  const contentWidthIn = rootRect.width * PX_TO_INCH;
  const contentHeightIn = rootRect.height * PX_TO_INCH;
  const scale = Math.min(PPTX_WIDTH_IN / contentWidthIn, PPTX_HEIGHT_IN / contentHeightIn);

  const layoutConfig = {
    rootX: rootRect.x, rootY: rootRect.y, scale: scale,
    offX: (PPTX_WIDTH_IN - contentWidthIn * scale) / 2,
    offY: (PPTX_HEIGHT_IN - contentHeightIn * scale) / 2,
  };

  const renderQueue = [];
  let domOrderCounter = 0;
  
  async function collect(node) {
    const order = domOrderCounter++;
    const result = await createRenderItem(node, layoutConfig, order, pptx);
    if (result) {
        if (result.items) renderQueue.push(...result.items);
        if (result.stopRecursion) return;
    }
    for (const child of node.children) await collect(child);
  }

  await collect(root);

  renderQueue.sort((a, b) => {
      if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex;
      return a.domOrder - b.domOrder;
  });

  for (const item of renderQueue) {
      if (item.type === 'shape') slide.addShape(item.shapeType, item.options);
      if (item.type === 'image') slide.addImage(item.options);
      if (item.type === 'text') slide.addText(item.textParts, item.options);
  }
  
  const fileName = options.fileName || "export.pptx";
  pptx.writeFile({ fileName });
}

async function createRenderItem(node, config, domOrder, pptx) {
  if (node.nodeType !== 1) return null;
  const style = window.getComputedStyle(node);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return null;

  const rect = node.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;

  const zIndex = style.zIndex !== 'auto' ? parseInt(style.zIndex) : 0;
  const rotation = getRotation(style.transform);
  const elementOpacity = parseFloat(style.opacity); 
  
  const widthPx = node.offsetWidth || rect.width;
  const heightPx = node.offsetHeight || rect.height;

  const unrotatedW = widthPx * PX_TO_INCH * config.scale;
  const unrotatedH = heightPx * PX_TO_INCH * config.scale;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  let x = config.offX + ((centerX - config.rootX) * PX_TO_INCH * config.scale) - (unrotatedW / 2);
  let y = config.offY + ((centerY - config.rootY) * PX_TO_INCH * config.scale) - (unrotatedH / 2);
  let w = unrotatedW;
  let h = unrotatedH;

  const items = [];

  // --- SVG & IMG HANDLERS ---
  if (node.nodeName.toUpperCase() === 'SVG') {
      const pngData = await svgToPng(node);
      if (pngData) items.push({ type: 'image', zIndex, domOrder, options: { data: pngData, x, y, w, h, rotate: rotation } });
      return { items, stopRecursion: true };
  }
  if (node.tagName === "IMG") {
      let borderRadius = parseFloat(style.borderRadius) || 0;
      if (borderRadius === 0) {
        const parentStyle = window.getComputedStyle(node.parentElement);
        if (parentStyle.overflow !== 'visible') borderRadius = parseFloat(parentStyle.borderRadius) || 0;
      }
      const processed = await getProcessedImage(node.src, widthPx, heightPx, borderRadius);
      if (processed) items.push({ type: 'image', zIndex, domOrder, options: { data: processed, x, y, w, h, rotate: rotation } });
      return { items, stopRecursion: true };
  }

  // --- PREPARE STYLES ---
  const bgColorObj = parseColor(style.backgroundColor);
  const bgClip = style.webkitBackgroundClip || style.backgroundClip;
  const isBgClipText = bgClip === 'text';
  const hasGradient = !isBgClipText && style.backgroundImage && style.backgroundImage.includes("linear-gradient");
  
  const borderColorObj = parseColor(style.borderColor);
  const borderWidth = parseFloat(style.borderWidth);
  const hasBorder = borderWidth > 0 && borderColorObj.hex;
  const shadowStr = style.boxShadow;
  const hasShadow = shadowStr && shadowStr !== "none";
  const borderRadius = parseFloat(style.borderRadius) || 0;
  const softEdge = getSoftEdges(style.filter, config.scale);

  let isImageWrapper = false;
  const imgChild = Array.from(node.children).find(c => c.tagName === 'IMG');
  if (imgChild) {
      const childW = imgChild.offsetWidth || imgChild.getBoundingClientRect().width;
      const childH = imgChild.offsetHeight || imgChild.getBoundingClientRect().height;
      if (childW >= widthPx - 2 && childH >= heightPx - 2) {
          isImageWrapper = true;
      }
  }

  // --- TEXT EXTRACTION ---
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
          textParts.push({ text: "• ", options: { color: parseColor(style.color).hex || '000000', fontSize: fontSizePt } });
      }

      node.childNodes.forEach((child, index) => {
          let textVal = child.nodeType === 3 ? child.nodeValue : child.textContent;
          let nodeStyle = child.nodeType === 1 ? window.getComputedStyle(child) : style;
          textVal = textVal.replace(/[\n\r\t]+/g, " ").replace(/\s{2,}/g, " ");
          if (index === 0 && !isList) textVal = textVal.trimStart(); 
          else if (index === 0) textVal = textVal.trimStart();
          if (index === node.childNodes.length - 1) textVal = textVal.trimEnd();
          if (nodeStyle.textTransform === "uppercase") textVal = textVal.toUpperCase();
          if (nodeStyle.textTransform === "lowercase") textVal = textVal.toLowerCase();
          
          if (textVal.length > 0) {
              textParts.push({ text: textVal, options: getTextStyle(nodeStyle, config.scale) });
          }
      });

      if (textParts.length > 0) {
          let align = style.textAlign || "left";
          if (align === "start") align = "left"; if (align === "end") align = "right";
          
          let valign = "top";
          // Standard Flex Alignment
          if (style.alignItems === "center") valign = "middle"; 
          if (style.justifyContent === "center" && style.display.includes("flex")) align = "center";
          
          // FIX: Improved Alignment Detection for "Button" Badges
          // If Top/Bottom Padding is equal, and it's a "Shape" (has bg), default to Middle
          const pt = parseFloat(style.paddingTop) || 0;
          const pb = parseFloat(style.paddingBottom) || 0;
          if (Math.abs(pt - pb) < 2 && bgColorObj.hex) {
              valign = "middle";
          }

          const padding = getPadding(style, config.scale);
          textPayload = { text: textParts, align, valign, inset: padding };
      }
  }

  // --- RENDER LOGIC ---
  if (hasGradient || (softEdge && bgColorObj.hex && !isImageWrapper)) {
      let bgData = null;
      let padIn = 0;
      if (softEdge) {
          const svgInfo = generateBlurredSVG(widthPx, heightPx, bgColorObj.hex, borderRadius, softEdge);
          bgData = svgInfo.data;
          padIn = svgInfo.padding * PX_TO_INCH * config.scale;
      } else {
          bgData = generateGradientSVG(widthPx, heightPx, style.backgroundImage, borderRadius, hasBorder ? { color: borderColorObj.hex, width: borderWidth } : null);
      }

      if (bgData) {
          items.push({
             type: 'image', zIndex, domOrder,
             options: { data: bgData, x: x - padIn, y: y - padIn, w: w + (padIn * 2), h: h + (padIn * 2), rotate: rotation }
          });
      }
      
      if (textPayload) {
          items.push({
              type: 'text', zIndex: zIndex + 1, domOrder,
              textParts: textPayload.text,
              options: { 
                  x, y, w, h, align: textPayload.align, valign: textPayload.valign, inset: textPayload.inset, rotate: rotation, margin: 0, wrap: true, autoFit: false 
              }
          });
      }
  } 
  else if ((bgColorObj.hex && !isImageWrapper) || hasBorder || hasShadow || textPayload) {
      const finalAlpha = elementOpacity * bgColorObj.opacity;
      const transparency = (1 - finalAlpha) * 100;

      const shapeOpts = {
          x, y, w, h, rotate: rotation,
          fill: (bgColorObj.hex && !isImageWrapper) ? { color: bgColorObj.hex, transparency: transparency } : { type: 'none' },
          line: hasBorder ? { color: borderColorObj.hex, width: borderWidth * 0.75 * config.scale } : null,
      };

      if (hasShadow) {
          const shadow = getVisibleShadow(shadowStr, config.scale);
          if (shadow) shapeOpts.shadow = shadow;
          if (shapeOpts.fill.type === 'none' && !hasBorder && style.backgroundColor) {
             shapeOpts.fill = { color: 'FFFFFF', transparency: 99 };
          }
      }

      const isCircle = borderRadius >= Math.min(widthPx, heightPx) / 2 - 1 && Math.abs(widthPx - heightPx) < 2;
      let shapeType = pptx.ShapeType.rect;
      if (isCircle) shapeType = pptx.ShapeType.ellipse;
      else if (borderRadius > 0) {
          shapeType = pptx.ShapeType.roundRect;
          shapeOpts.rectRadius = Math.min(1, borderRadius / (Math.min(widthPx, heightPx) / 2));
      }

      if (textPayload) {
          const textOptions = {
              shape: shapeType, ...shapeOpts, 
              align: textPayload.align, valign: textPayload.valign, inset: textPayload.inset,
              margin: 0, wrap: true, autoFit: false
          };
          items.push({ type: 'text', zIndex, domOrder, textParts: textPayload.text, options: textOptions });
      } else {
          items.push({ type: 'shape', zIndex, domOrder, shapeType, options: shapeOpts });
      }
  }

  return { items, stopRecursion: !!textPayload };
}