// src/utils.js

// canvas context for color normalization
let _ctx;
function getCtx() {
  if (!_ctx) _ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  return _ctx;
}

function getTableBorder(style, side, scale) {
  const widthStr = style[`border${side}Width`];
  const styleStr = style[`border${side}Style`];
  const colorStr = style[`border${side}Color`];

  const width = parseFloat(widthStr) || 0;
  if (width === 0 || styleStr === 'none' || styleStr === 'hidden') {
    return null;
  }

  const color = parseColor(colorStr);
  if (!color.hex || color.opacity === 0) return null;

  let dash = 'solid';
  if (styleStr === 'dashed') dash = 'dash';
  if (styleStr === 'dotted') dash = 'dot';

  return {
    pt: width * 0.75 * scale, // Convert px to pt
    color: color.hex,
    style: dash,
  };
}

/**
 * Extracts native table data for PptxGenJS.
 */
export function extractTableData(node, scale, options = {}) {
  const rows = [];
  const colWidths = [];
  const root = options.root || null;

  // 1. Calculate Column Widths based on the first row of cells
  // We look at the first <tr>'s children to determine visual column widths.
  // Note: This assumes a fixed grid. Complex colspan/rowspan on the first row
  // might skew widths, but getBoundingClientRect captures the rendered result.
  const firstRow = node.querySelector('tr');
  if (firstRow) {
    const cells = Array.from(firstRow.children);
    cells.forEach((cell) => {
      const rect = cell.getBoundingClientRect();
      const wIn = rect.width * (1 / 96) * scale;
      colWidths.push(wIn);
    });
  }

  // 2. Iterate Rows
  const trList = node.querySelectorAll('tr');
  trList.forEach((tr) => {
    const rowData = [];
    const cellList = Array.from(tr.children).filter((c) => ['TD', 'TH'].includes(c.tagName));

    cellList.forEach((cell) => {
      const style = window.getComputedStyle(cell);
      const cellText = cell.innerText.replace(/[\n\r\t]+/g, ' ').trim();

      // A. Text Style
      const textStyle = getTextStyle(style, scale, cellText, options);

      // B. Cell Background
      const fill = computeTableCellFill(style, cell, root, options);

      // C. Alignment
      let align = 'left';
      if (style.textAlign === 'center') align = 'center';
      if (style.textAlign === 'right' || style.textAlign === 'end') align = 'right';

      let valign = 'top';
      if (style.verticalAlign === 'middle') valign = 'middle';
      if (style.verticalAlign === 'bottom') valign = 'bottom';

      // D. Padding (Margins in PPTX)
      // CSS Padding px -> PPTX Margin pt
      const padding = getPadding(style, scale);
      // getPadding returns [top, right, bottom, left] in inches relative to scale
      // PptxGenJS expects points (pt) for margin: [t, r, b, l]
      // or discrete properties. Let's use discrete for clarity.
      const margin = [
        padding[0] * 72, // top
        padding[1] * 72, // right
        padding[2] * 72, // bottom
        padding[3] * 72, // left
      ];

      // E. Borders
      const borderTop = getTableBorder(style, 'Top', scale);
      const borderRight = getTableBorder(style, 'Right', scale);
      const borderBottom = getTableBorder(style, 'Bottom', scale);
      const borderLeft = getTableBorder(style, 'Left', scale);

      // F. Construct Cell Object
      rowData.push({
        text: cellText,
        options: {
          color: textStyle.color,
          fontFace: textStyle.fontFace,
          fontSize: textStyle.fontSize,
          bold: textStyle.bold,
          italic: textStyle.italic,
          underline: textStyle.underline,

          fill: fill,
          align: align,
          valign: valign,
          margin: margin,

          rowspan: parseInt(cell.getAttribute('rowspan')) || null,
          colspan: parseInt(cell.getAttribute('colspan')) || null,

          border: {
            pt: null, // trigger explicit object structure
            top: borderTop,
            right: borderRight,
            bottom: borderBottom,
            left: borderLeft,
          },
        },
      });
    });

    if (rowData.length > 0) {
      rows.push(rowData);
    }
  });

  return { rows, colWidths };
}

// Checks if any parent element has overflow: hidden which would clip this element
export function isClippedByParent(node) {
  let parent = node.parentElement;
  while (parent && parent !== document.body) {
    const style = window.getComputedStyle(parent);
    const overflow = style.overflow;
    if (overflow === 'hidden' || overflow === 'clip') {
      return true;
    }
    parent = parent.parentElement;
  }
  return false;
}

// Helper to save gradient text
// Helper to save gradient text: extracts the first color from a gradient string
export function getGradientFallbackColor(bgImage) {
  if (!bgImage || bgImage === 'none') return null;

  // 1. Extract content inside function(...)
  // Handles linear-gradient(...), radial-gradient(...), repeating-linear-gradient(...)
  const match = bgImage.match(/gradient\((.*)\)/);
  if (!match) return null;

  const content = match[1];

  // 2. Split by comma, respecting parentheses (to avoid splitting inside rgb(), oklch(), etc.)
  const parts = [];
  let current = '';
  let parenDepth = 0;

  for (const char of content) {
    if (char === '(') parenDepth++;
    if (char === ')') parenDepth--;
    if (char === ',' && parenDepth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current) parts.push(current.trim());

  // 3. Find first part that is a color (skip angle/direction)
  for (const part of parts) {
    // Ignore directions (to right) or angles (90deg, 0.5turn)
    if (/^(to\s|[\d.]+(deg|rad|turn|grad))/.test(part)) continue;

    // Extract color: Remove trailing position (e.g. "red 50%" -> "red")
    // Regex matches whitespace + number + unit at end of string
    const colorPart = part.replace(/\s+(-?[\d.]+(%|px|em|rem|ch|vh|vw)?)$/, '');

    // Check if it's not just a number (some gradients might have bare numbers? unlikely in standard syntax)
    if (colorPart) return colorPart;
  }

  return null;
}

function mapDashType(style) {
  if (style === 'dashed') return 'dash';
  if (style === 'dotted') return 'dot';
  return 'solid';
}

function hexToRgb(hex) {
  const clean = (hex || '').replace('#', '').trim();
  if (clean.length !== 6) return null;
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return null;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex(rgb) {
  const toHex = (v) => v.toString(16).padStart(2, '0').toUpperCase();
  return `${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function blendHex(baseHex, overlayHex, alpha) {
  const base = hexToRgb(baseHex);
  const over = hexToRgb(overlayHex);
  if (!base || !over) return overlayHex;
  const a = Math.max(0, Math.min(1, alpha));
  const r = Math.round(base.r * (1 - a) + over.r * a);
  const g = Math.round(base.g * (1 - a) + over.g * a);
  const b = Math.round(base.b * (1 - a) + over.b * a);
  return rgbToHex({ r, g, b });
}

function resolveTableBaseColor(node, root) {
  // Start from parent to avoid picking the cell's own semi-transparent fill
  let el = node?.parentElement || null;
  while (el && el !== document.body) {
    const style = window.getComputedStyle(el);
    const bg = parseColor(style.backgroundColor);
    if (bg.hex && bg.opacity > 0) return bg.hex;

    const bgClip = style.webkitBackgroundClip || style.backgroundClip;
    const bgImage = style.backgroundImage;
    if (bgClip !== 'text' && bgImage && bgImage.includes('gradient')) {
      const fallback = getGradientFallbackColor(bgImage);
      if (fallback) {
        const parsed = parseColor(fallback);
        if (parsed.hex) return parsed.hex;
      }
    }

    if (el === root) break;
    el = el.parentElement;
  }
  return null;
}

export function computeTableCellFill(style, cell, root, options = {}) {
  const bg = parseColor(style.backgroundColor);
  if (!bg.hex || bg.opacity <= 0) return null;

  const flatten = options.tableConfig?.flattenTransparentFill !== false;
  if (bg.opacity < 1 && flatten) {
    const baseHex = resolveTableBaseColor(cell, root) || 'FFFFFF';
    const blended = blendHex(baseHex, bg.hex, bg.opacity);
    return { color: blended };
  }

  const transparency = Math.max(0, Math.min(100, (1 - bg.opacity) * 100));
  return transparency > 0 ? { color: bg.hex, transparency } : { color: bg.hex };
}

/**
 * Analyzes computed border styles and determines the rendering strategy.
 */
export function getBorderInfo(style, scale) {
  const top = {
    width: parseFloat(style.borderTopWidth) || 0,
    style: style.borderTopStyle,
    color: parseColor(style.borderTopColor).hex,
  };
  const right = {
    width: parseFloat(style.borderRightWidth) || 0,
    style: style.borderRightStyle,
    color: parseColor(style.borderRightColor).hex,
  };
  const bottom = {
    width: parseFloat(style.borderBottomWidth) || 0,
    style: style.borderBottomStyle,
    color: parseColor(style.borderBottomColor).hex,
  };
  const left = {
    width: parseFloat(style.borderLeftWidth) || 0,
    style: style.borderLeftStyle,
    color: parseColor(style.borderLeftColor).hex,
  };

  const hasAnyBorder = top.width > 0 || right.width > 0 || bottom.width > 0 || left.width > 0;
  if (!hasAnyBorder) return { type: 'none' };

  // Check if all sides are uniform
  const isUniform =
    top.width === right.width &&
    top.width === bottom.width &&
    top.width === left.width &&
    top.style === right.style &&
    top.style === bottom.style &&
    top.style === left.style &&
    top.color === right.color &&
    top.color === bottom.color &&
    top.color === left.color;

  if (isUniform) {
    return {
      type: 'uniform',
      options: {
        width: top.width * 0.75 * scale,
        color: top.color,
        transparency: (1 - parseColor(style.borderTopColor).opacity) * 100,
        dashType: mapDashType(top.style),
      },
    };
  } else {
    return {
      type: 'composite',
      sides: { top, right, bottom, left },
    };
  }
}

/**
 * Generates an SVG image for composite borders that respects border-radius.
 */
export function generateCompositeBorderSVG(w, h, radius, sides) {
  radius = radius / 2; // Adjust for SVG rendering
  const clipId = 'clip_' + Math.random().toString(36).substr(2, 9);
  let borderRects = '';

  if (sides.top.width > 0 && sides.top.color) {
    borderRects += `<rect x="0" y="0" width="${w}" height="${sides.top.width}" fill="#${sides.top.color}" />`;
  }
  if (sides.right.width > 0 && sides.right.color) {
    borderRects += `<rect x="${w - sides.right.width}" y="0" width="${sides.right.width}" height="${h}" fill="#${sides.right.color}" />`;
  }
  if (sides.bottom.width > 0 && sides.bottom.color) {
    borderRects += `<rect x="0" y="${h - sides.bottom.width}" width="${w}" height="${sides.bottom.width}" fill="#${sides.bottom.color}" />`;
  }
  if (sides.left.width > 0 && sides.left.color) {
    borderRects += `<rect x="0" y="0" width="${sides.left.width}" height="${h}" fill="#${sides.left.color}" />`;
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        <defs>
            <clipPath id="${clipId}">
                <rect x="0" y="0" width="${w}" height="${h}" rx="${radius}" ry="${radius}" />
            </clipPath>
        </defs>
        <g clip-path="url(#${clipId})">
            ${borderRects}
        </g>
    </svg>`;

  return 'data:image/svg+xml;base64,' + btoa(svg);
}

/**
 * Generates an SVG data URL for a solid shape with non-uniform corner radii.
 */
export function generateCustomShapeSVG(w, h, color, opacity, radii) {
  let { tl, tr, br, bl } = radii;

  // Clamp radii using CSS spec logic (avoid overlap)
  const factor = Math.min(
    w / (tl + tr) || Infinity,
    h / (tr + br) || Infinity,
    w / (br + bl) || Infinity,
    h / (bl + tl) || Infinity
  );

  if (factor < 1) {
    tl *= factor;
    tr *= factor;
    br *= factor;
    bl *= factor;
  }

  const path = `
    M ${tl} 0
    L ${w - tr} 0
    A ${tr} ${tr} 0 0 1 ${w} ${tr}
    L ${w} ${h - br}
    A ${br} ${br} 0 0 1 ${w - br} ${h}
    L ${bl} ${h}
    A ${bl} ${bl} 0 0 1 0 ${h - bl}
    L 0 ${tl}
    A ${tl} ${tl} 0 0 1 ${tl} 0
    Z
  `;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <path d="${path}" fill="#${color}" fill-opacity="${opacity}" />
    </svg>`;

  return 'data:image/svg+xml;base64,' + btoa(svg);
}

// --- REPLACE THE EXISTING parseColor FUNCTION ---
export function parseColor(str) {
  if (!str || str === 'transparent' || str.trim() === 'rgba(0, 0, 0, 0)') {
    return { hex: null, opacity: 0 };
  }

  const ctx = getCtx();
  ctx.fillStyle = str;
  const computed = ctx.fillStyle;

  // 1. Handle Hex Output (e.g. #ff0000) - Fast Path
  if (computed.startsWith('#')) {
    let hex = computed.slice(1);
    let opacity = 1;
    if (hex.length === 3)
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    if (hex.length === 4)
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    if (hex.length === 8) {
      opacity = parseInt(hex.slice(6), 16) / 255;
      hex = hex.slice(0, 6);
    }
    return { hex: hex.toUpperCase(), opacity };
  }

  // 2. Handle RGB/RGBA Output (standard) - Fast Path
  if (computed.startsWith('rgb')) {
    const match = computed.match(/[\d.]+/g);
    if (match && match.length >= 3) {
      const r = parseInt(match[0]);
      const g = parseInt(match[1]);
      const b = parseInt(match[2]);
      const a = match.length > 3 ? parseFloat(match[3]) : 1;
      const hex = ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
      return { hex, opacity: a };
    }
  }

  // 3. Fallback: Browser returned a format we don't parse (oklch, lab, color(srgb...), etc.)
  // Use Canvas API to convert to sRGB
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillRect(0, 0, 1, 1);
  const data = ctx.getImageData(0, 0, 1, 1).data;
  // data = [r, g, b, a]
  const r = data[0];
  const g = data[1];
  const b = data[2];
  const a = data[3] / 255;

  if (a === 0) return { hex: null, opacity: 0 };

  const hex = ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
  return { hex, opacity: a };
}

export function getPadding(style, scale) {
  const pxToInch = 1 / 96;
  return [
    (parseFloat(style.paddingTop) || 0) * pxToInch * scale,
    (parseFloat(style.paddingRight) || 0) * pxToInch * scale,
    (parseFloat(style.paddingBottom) || 0) * pxToInch * scale,
    (parseFloat(style.paddingLeft) || 0) * pxToInch * scale,
  ];
}

export function getSoftEdges(filterStr, scale) {
  if (!filterStr || filterStr === 'none') return null;
  const match = filterStr.match(/blur\(([\d.]+)px\)/);
  if (match) return parseFloat(match[1]) * 0.75 * scale;
  return null;
}

const DEFAULT_CJK_FONTS = [
  'PingFang SC',
  'Hiragino Sans GB',
  'Microsoft YaHei',
  'Noto Sans CJK SC',
  'Source Han Sans SC',
  'WenQuanYi Micro Hei',
  'SimHei',
  'SimSun',
  'STHeiti'
];

function normalizeFontList(fontFamily) {
  if (!fontFamily || typeof fontFamily !== 'string') return [];
  return fontFamily
    .split(',')
    .map((f) => f.trim().replace(/['"]/g, ''))
    .filter(Boolean);
}

function containsCjk(text) {
  if (!text) return false;
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(text);
}

function normalizeCjkFallbacks(options) {
  if (!options) return [];
  const raw =
    options.fontFallbacks?.cjk ??
    options.cjkFonts ??
    options.cjkFont ??
    [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((f) => (typeof f === 'string' ? f.trim() : String(f)))
    .filter(Boolean);
}

function pickFontFace(fontFamily, text, options) {
  const fontList = normalizeFontList(fontFamily);
  const primary = fontList[0] || 'Arial';

  if (!containsCjk(text)) return primary;

  const lowered = fontList.map((f) => f.toLowerCase());
  const configured = normalizeCjkFallbacks(options);
  if (configured.length > 0) {
    const match = configured.find((f) => lowered.includes(f.toLowerCase()));
    return match || configured[0];
  }

  const autoMatch = DEFAULT_CJK_FONTS.find((f) => lowered.includes(f.toLowerCase()));
  return autoMatch || primary;
}

export function getTextStyle(style, scale, text = '', options = {}) {
  let colorObj = parseColor(style.color);

  const bgClip = style.webkitBackgroundClip || style.backgroundClip;
  if (colorObj.opacity === 0 && bgClip === 'text') {
    const fallback = getGradientFallbackColor(style.backgroundImage);
    if (fallback) colorObj = parseColor(fallback);
  }

  let lineSpacing = null;
  const fontSizePx = parseFloat(style.fontSize);
  const lhStr = style.lineHeight;

  if (lhStr && lhStr !== 'normal') {
    let lhPx = parseFloat(lhStr);

    // Edge Case: If browser returns a raw multiplier (e.g. "1.5")
    // we must multiply by font size to get the height in pixels.
    // (Note: getComputedStyle usually returns 'px', but inline styles might differ)
    if (/^[0-9.]+$/.test(lhStr)) {
      lhPx = lhPx * fontSizePx;
    }

    if (!isNaN(lhPx) && lhPx > 0) {
      // Convert Pixel Height to Point Height (1px = 0.75pt)
      // And apply the global layout scale.
      lineSpacing = lhPx * 0.75 * scale;
    }
  }

  // --- Spacing (Margins) ---
  // Convert CSS margins (px) to PPTX Paragraph Spacing (pt).
  let paraSpaceBefore = 0;
  let paraSpaceAfter = 0;

  const mt = parseFloat(style.marginTop) || 0;
  const mb = parseFloat(style.marginBottom) || 0;

  if (mt > 0) paraSpaceBefore = mt * 0.75 * scale;
  if (mb > 0) paraSpaceAfter = mb * 0.75 * scale;

  const fontFace = pickFontFace(style.fontFamily, text, options);

  return {
    color: colorObj.hex || '000000',
    fontFace: fontFace,
    fontSize: Math.floor(fontSizePx * 0.75 * scale),
    bold: parseInt(style.fontWeight) >= 600,
    italic: style.fontStyle === 'italic',
    underline: style.textDecoration.includes('underline'),
    // Only add if we have a valid value
    ...(lineSpacing && { lineSpacing }),
    ...(paraSpaceBefore > 0 && { paraSpaceBefore }),
    ...(paraSpaceAfter > 0 && { paraSpaceAfter }),
    // Map background color to highlight if present
    ...(parseColor(style.backgroundColor).hex
      ? { highlight: parseColor(style.backgroundColor).hex }
      : {}),
  };
}

/**
 * Determines if a given DOM node is primarily a text container.
 * Updated to correctly reject Icon elements so they are rendered as images.
 */
export function isTextContainer(node) {
  const hasText = node.textContent.trim().length > 0;
  if (!hasText) return false;

  const children = Array.from(node.children);
  if (children.length === 0) return true;

  const isSafeInline = (el) => {
    // 1. Reject Web Components / Custom Elements
    if (el.tagName.includes('-')) return false;
    // 2. Reject Explicit Images/SVGs
    if (el.tagName === 'IMG' || el.tagName === 'SVG') return false;

    // 3. Reject Class-based Icons (FontAwesome, Material, Bootstrap, etc.)
    // If an <i> or <span> has icon classes, it is a visual object, not text.
    if (el.tagName === 'I' || el.tagName === 'SPAN') {
      const cls = el.getAttribute('class') || '';
      if (
        cls.includes('fa-') ||
        cls.includes('fas') ||
        cls.includes('far') ||
        cls.includes('fab') ||
        cls.includes('material-icons') ||
        cls.includes('bi-') ||
        cls.includes('icon')
      ) {
        return false;
      }
    }

    const style = window.getComputedStyle(el);
    const display = style.display;

    // 4. Standard Inline Tag Check
    const isInlineTag = ['SPAN', 'B', 'STRONG', 'EM', 'I', 'A', 'SMALL', 'MARK'].includes(
      el.tagName
    );
    const isInlineDisplay = display.includes('inline');

    if (!isInlineTag && !isInlineDisplay) return false;

    // 5. Structural Styling Check
    // If a child has a background or border, it's a layout block, not a simple text span.
    const bgColor = parseColor(style.backgroundColor);
    const hasVisibleBg = bgColor.hex && bgColor.opacity > 0;
    const hasBorder =
      parseFloat(style.borderWidth) > 0 && parseColor(style.borderColor).opacity > 0;

    if (hasVisibleBg || hasBorder) {
      // Relaxed check: Allow inline elements with background/border to be treated as text.
      // They will be rendered as highlighted text runs (no border support in text runs though).
      // This preserves text flow for "badges".
      // return false;
    }

    // 4. Check for empty shapes (visual objects without text, like dots)
    const hasContent = el.textContent.trim().length > 0;
    if (!hasContent && (hasVisibleBg || hasBorder)) {
      return false;
    }

    // If element has background/border and is not inline, treat as layout block
    if ((hasVisibleBg || hasBorder) && !isInlineDisplay) {
      return false;
    }

    return true;
  };

  return children.every(isSafeInline);
}

export function getRotation(transformStr) {
  if (!transformStr || transformStr === 'none') return 0;
  const values = transformStr.split('(')[1].split(')')[0].split(',');
  if (values.length < 4) return 0;
  const a = parseFloat(values[0]);
  const b = parseFloat(values[1]);
  return Math.round(Math.atan2(b, a) * (180 / Math.PI));
}

/**
 * Converts an SVG node to a PNG data URL (rasterized)
 */
export function svgToPng(node) {
  return new Promise((resolve) => {
    const clone = node.cloneNode(true);
    const rect = node.getBoundingClientRect();
    const width = rect.width || 300;
    const height = rect.height || 150;

    inlineSvgStyles(node, clone);
    clone.setAttribute('width', width);
    clone.setAttribute('height', height);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    const xml = new XMLSerializer().serializeToString(clone);
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 3;
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = svgUrl;
  });
}

/**
 * Converts an SVG node to an SVG data URL (preserves vector format)
 * This allows "Convert to Shape" in PowerPoint
 */
export function svgToSvg(node) {
  return new Promise((resolve) => {
    try {
      const clone = node.cloneNode(true);
      const rect = node.getBoundingClientRect();
      const width = rect.width || 300;
      const height = rect.height || 150;

      inlineSvgStyles(node, clone);
      clone.setAttribute('width', width);
      clone.setAttribute('height', height);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

      // Ensure xmlns:xlink is present for any xlink:href attributes
      if (clone.querySelector('[*|href]') || clone.innerHTML.includes('xlink:')) {
        clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      }

      const xml = new XMLSerializer().serializeToString(clone);
      // Use base64 encoding for better compatibility with PowerPoint
      const svgUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`;
      resolve(svgUrl);
    } catch (e) {
      console.warn('SVG serialization failed:', e);
      resolve(null);
    }
  });
}

/**
 * Helper to inline computed styles into an SVG clone
 */
function inlineSvgStyles(source, target) {
  const computed = window.getComputedStyle(source);
  const properties = [
    'fill',
    'stroke',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'opacity',
    'font-family',
    'font-size',
    'font-weight',
  ];

  if (computed.fill === 'none') target.setAttribute('fill', 'none');
  else if (computed.fill) target.style.fill = computed.fill;

  if (computed.stroke === 'none') target.setAttribute('stroke', 'none');
  else if (computed.stroke) target.style.stroke = computed.stroke;

  properties.forEach((prop) => {
    if (prop !== 'fill' && prop !== 'stroke') {
      const val = computed[prop];
      if (val && val !== 'auto') target.style[prop] = val;
    }
  });

  for (let i = 0; i < source.children.length; i++) {
    if (target.children[i]) inlineSvgStyles(source.children[i], target.children[i]);
  }
}

export function getVisibleShadow(shadowStr, scale) {
  if (!shadowStr || shadowStr === 'none') return null;
  const shadows = shadowStr.split(/,(?![^()]*\))/);
  for (let s of shadows) {
    s = s.trim();
    if (s.startsWith('rgba(0, 0, 0, 0)')) continue;
    const match = s.match(
      /(rgba?\([^)]+\)|#[0-9a-fA-F]+)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/
    );
    if (match) {
      const colorStr = match[1];
      const x = parseFloat(match[2]);
      const y = parseFloat(match[3]);
      const blur = parseFloat(match[4]);
      const distance = Math.sqrt(x * x + y * y);
      let angle = Math.atan2(y, x) * (180 / Math.PI);
      if (angle < 0) angle += 360;
      const colorObj = parseColor(colorStr);
      return {
        type: 'outer',
        angle: angle,
        blur: blur * 0.75 * scale,
        offset: distance * 0.75 * scale,
        color: colorObj.hex || '000000',
        opacity: colorObj.opacity,
      };
    }
  }
  return null;
}

/**
 * Generates an SVG image for gradients, supporting degrees and keywords.
 */
export function generateGradientSVG(w, h, bgString, radius, border) {
  try {
    const match = bgString.match(/linear-gradient\((.*)\)/);
    if (!match) return null;
    const content = match[1];

    // Split by comma, ignoring commas inside parentheses (e.g. rgba())
    const parts = content.split(/,(?![^()]*\))/).map((p) => p.trim());
    if (parts.length < 2) return null;

    let x1 = '0%',
      y1 = '0%',
      x2 = '0%',
      y2 = '100%';
    let stopsStartIndex = 0;
    const firstPart = parts[0].toLowerCase();

    // 1. Check for Keywords (to right, etc.)
    if (firstPart.startsWith('to ')) {
      stopsStartIndex = 1;
      const direction = firstPart.replace('to ', '').trim();
      switch (direction) {
        case 'top':
          y1 = '100%';
          y2 = '0%';
          break;
        case 'bottom':
          y1 = '0%';
          y2 = '100%';
          break;
        case 'left':
          x1 = '100%';
          x2 = '0%';
          break;
        case 'right':
          x2 = '100%';
          break;
        case 'top right':
          x1 = '0%';
          y1 = '100%';
          x2 = '100%';
          y2 = '0%';
          break;
        case 'top left':
          x1 = '100%';
          y1 = '100%';
          x2 = '0%';
          y2 = '0%';
          break;
        case 'bottom right':
          x2 = '100%';
          y2 = '100%';
          break;
        case 'bottom left':
          x1 = '100%';
          y2 = '100%';
          break;
      }
    }
    // 2. Check for Degrees (45deg, 90deg, etc.)
    else if (firstPart.match(/^-?[\d.]+(deg|rad|turn|grad)$/)) {
      stopsStartIndex = 1;
      const val = parseFloat(firstPart);
      // CSS 0deg is Top (North), 90deg is Right (East), 180deg is Bottom (South)
      // We convert this to SVG coordinates on a unit square (0-100%).
      // Formula: Map angle to perimeter coordinates.
      if (!isNaN(val)) {
        const deg = firstPart.includes('rad') ? val * (180 / Math.PI) : val;
        const cssRad = ((deg - 90) * Math.PI) / 180; // Correct CSS angle offset

        // Calculate standard vector for rectangle center (50, 50)
        const scale = 50; // Distance from center to edge (approx)
        const cos = Math.cos(cssRad); // Y component (reversed in SVG)
        const sin = Math.sin(cssRad); // X component

        // Invert Y for SVG coordinate system
        x1 = (50 - sin * scale).toFixed(1) + '%';
        y1 = (50 + cos * scale).toFixed(1) + '%';
        x2 = (50 + sin * scale).toFixed(1) + '%';
        y2 = (50 - cos * scale).toFixed(1) + '%';
      }
    }

    // 3. Process Color Stops
    let stopsXML = '';
    const stopParts = parts.slice(stopsStartIndex);

    stopParts.forEach((part, idx) => {
      // Parse "Color Position" (e.g., "red 50%")
      // Regex looks for optional space + number + unit at the end of the string
      let color = part;
      let offset = Math.round((idx / (stopParts.length - 1)) * 100) + '%';

      const posMatch = part.match(/^(.*?)\s+(-?[\d.]+(?:%|px)?)$/);
      if (posMatch) {
        color = posMatch[1];
        offset = posMatch[2];
      }

      // Handle RGBA/RGB for SVG compatibility
      let opacity = 1;
      if (color.includes('rgba')) {
        const rgbaMatch = color.match(/[\d.]+/g);
        if (rgbaMatch && rgbaMatch.length >= 4) {
          opacity = rgbaMatch[3];
          color = `rgb(${rgbaMatch[0]},${rgbaMatch[1]},${rgbaMatch[2]})`;
        }
      }

      stopsXML += `<stop offset="${offset}" stop-color="${color.trim()}" stop-opacity="${opacity}"/>`;
    });

    let strokeAttr = '';
    if (border) {
      strokeAttr = `stroke="#${border.color}" stroke-width="${border.width}"`;
    }

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
          <defs>
            <linearGradient id="grad" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">
              ${stopsXML}
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="${w}" height="${h}" rx="${radius}" ry="${radius}" fill="url(#grad)" ${strokeAttr} />
      </svg>`;

    return 'data:image/svg+xml;base64,' + btoa(svg);
  } catch (e) {
    console.warn('Gradient generation failed:', e);
    return null;
  }
}

export function generateBlurredSVG(w, h, color, radius, blurPx) {
  const padding = blurPx * 3;
  const fullW = w + padding * 2;
  const fullH = h + padding * 2;
  const x = padding;
  const y = padding;
  let shapeTag = '';
  const isCircle = radius >= Math.min(w, h) / 2 - 1 && Math.abs(w - h) < 2;

  if (isCircle) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;
    shapeTag = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#${color}" filter="url(#f1)" />`;
  } else {
    shapeTag = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" ry="${radius}" fill="#${color}" filter="url(#f1)" />`;
  }

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${fullW}" height="${fullH}" viewBox="0 0 ${fullW} ${fullH}">
    <defs>
      <filter id="f1" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="${blurPx}" />
      </filter>
    </defs>
    ${shapeTag}
  </svg>`;

  return {
    data: 'data:image/svg+xml;base64,' + btoa(svg),
    padding: padding,
  };
}

// src/utils.js

// ... (keep all existing exports) ...

/**
 * Traverses the target DOM and collects all unique font-family names used.
 */
export function getUsedFontFamilies(root) {
  const families = new Set();

  function scan(node) {
    if (node.nodeType === 1) {
      // Element
      const style = window.getComputedStyle(node);
      const fontList = normalizeFontList(style.fontFamily);
      fontList.forEach((f) => families.add(f));
    }
    for (const child of node.childNodes) {
      scan(child);
    }
  }

  // Handle array of roots or single root
  const elements = Array.isArray(root) ? root : [root];
  elements.forEach((el) => {
    const node = typeof el === 'string' ? document.querySelector(el) : el;
    if (node) scan(node);
  });

  return families;
}

/**
 * Scans document.styleSheets to find @font-face URLs for the requested families.
 * Returns an array of { name, url } objects.
 */
export async function getAutoDetectedFonts(usedFamilies) {
  const foundFonts = [];
  const processedUrls = new Set();

  // Helper to extract clean URL from CSS src string
  const extractUrl = (srcStr) => {
    // Look for url("...") or url('...') or url(...)
    // Prioritize woff, ttf, otf. Avoid woff2 if possible as handling is harder,
    // but if it's the only one, take it (convert logic handles it best effort).
    const matches = srcStr.match(/url\((['"]?)(.*?)\1\)/g);
    if (!matches) return null;

    // Filter for preferred formats
    let chosenUrl = null;
    for (const match of matches) {
      const urlRaw = match.replace(/url\((['"]?)(.*?)\1\)/, '$2');
      // Skip data URIs for now (unless you want to support base64 embedding)
      if (urlRaw.startsWith('data:')) continue;

      if (urlRaw.includes('.ttf') || urlRaw.includes('.otf') || urlRaw.includes('.woff')) {
        chosenUrl = urlRaw;
        break; // Found a good one
      }
      // Fallback
      if (!chosenUrl) chosenUrl = urlRaw;
    }
    return chosenUrl;
  };

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      // Accessing cssRules on cross-origin sheets (like Google Fonts) might fail
      // if CORS headers aren't set. We wrap in try/catch.
      const rules = sheet.cssRules || sheet.rules;
      if (!rules) continue;

      for (const rule of Array.from(rules)) {
        if (rule.constructor.name === 'CSSFontFaceRule' || rule.type === 5) {
          const familyName = rule.style.getPropertyValue('font-family').replace(/['"]/g, '').trim();

          if (usedFamilies.has(familyName)) {
            const src = rule.style.getPropertyValue('src');
            const url = extractUrl(src);

            if (url && !processedUrls.has(url)) {
              processedUrls.add(url);
              foundFonts.push({ name: familyName, url: url });
            }
          }
        }
      }
    } catch (e) {
      // SecurityError is common for external stylesheets (CORS).
      // We cannot scan those automatically via CSSOM.
      console.warn('error:', e);
      console.warn('Cannot scan stylesheet for fonts (CORS restriction):', sheet.href);
    }
  }

  return foundFonts;
}
