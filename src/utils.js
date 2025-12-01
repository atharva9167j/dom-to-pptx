// src/utils.js

export function parseColor(str) {
  if (!str || str === "transparent" || str.startsWith("rgba(0, 0, 0, 0)")) {
      return { hex: null, opacity: 0 };
  }
  if (str.startsWith('#')) {
      let hex = str.slice(1);
      if (hex.length === 3) hex = hex.split('').map(c => c+c).join('');
      return { hex: hex.toUpperCase(), opacity: 1 };
  }
  const match = str.match(/[\d\.]+/g);
  if (match && match.length >= 3) {
      const r = parseInt(match[0]);
      const g = parseInt(match[1]);
      const b = parseInt(match[2]);
      const a = match.length > 3 ? parseFloat(match[3]) : 1;
      const hex = ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
      return { hex, opacity: a };
  }
  return { hex: null, opacity: 0 };
}

// FIX: New helper to save gradient text
export function getGradientFallbackColor(bgImage) {
    if (!bgImage) return null;
    // Extract first hex or rgb color
    // linear-gradient(to right, #4f46e5, ...) -> #4f46e5
    const hexMatch = bgImage.match(/#(?:[0-9a-fA-F]{3}){1,2}/);
    if (hexMatch) return hexMatch[0];
    
    const rgbMatch = bgImage.match(/rgba?\(.*?\)/);
    if (rgbMatch) return rgbMatch[0];
    
    return null;
}

export function getPadding(style, scale) {
    const pxToInch = 1 / 96;
    return [
        (parseFloat(style.paddingTop) || 0) * pxToInch * scale,
        (parseFloat(style.paddingRight) || 0) * pxToInch * scale,
        (parseFloat(style.paddingBottom) || 0) * pxToInch * scale,
        (parseFloat(style.paddingLeft) || 0) * pxToInch * scale
    ];
}

export function getSoftEdges(filterStr, scale) {
  if (!filterStr || filterStr === "none") return null;
  const match = filterStr.match(/blur\(([\d\.]+)px\)/);
  if (match) return parseFloat(match[1]) * 0.75 * scale;
  return null;
}

export function getTextStyle(style, scale) {
  let colorObj = parseColor(style.color);
  
  // FIX: Handle text-transparent used in gradients
  // If text is transparent but has background-clip: text, we can't render gradient text easily.
  // We fallback to the gradient's first color so it's at least visible.
  const bgClip = style.webkitBackgroundClip || style.backgroundClip;
  if (colorObj.opacity === 0 && bgClip === 'text') {
      const fallback = getGradientFallbackColor(style.backgroundImage);
      if (fallback) colorObj = parseColor(fallback);
  }

  return {
    color: colorObj.hex || "000000",
    fontFace: style.fontFamily.split(",")[0].replace(/['"]/g, ""),
    fontSize: parseFloat(style.fontSize) * 0.75 * scale,
    bold: parseInt(style.fontWeight) >= 600,
    italic: style.fontStyle === "italic",
    underline: style.textDecoration.includes("underline"),
  };
}

export function isTextContainer(node) {
  const hasText = node.textContent.trim().length > 0;
  if (!hasText) return false;
  const children = Array.from(node.children);
  if (children.length === 0) return true;
  const isInline = (el) => 
    window.getComputedStyle(el).display.includes("inline") || 
    ["SPAN", "B", "STRONG", "EM", "I", "A", "SMALL"].includes(el.tagName);
  return children.every(isInline);
}

export function getRotation(transformStr) {
  if (!transformStr || transformStr === 'none') return 0;
  const values = transformStr.split('(')[1].split(')')[0].split(',');
  if (values.length < 4) return 0;
  const a = parseFloat(values[0]);
  const b = parseFloat(values[1]);
  return Math.round(Math.atan2(b, a) * (180 / Math.PI));
}

export function svgToPng(node) {
  return new Promise((resolve) => {
    const clone = node.cloneNode(true);
    const rect = node.getBoundingClientRect();
    const width = rect.width || 300; 
    const height = rect.height || 150;

    function inlineStyles(source, target) {
      const computed = window.getComputedStyle(source);
      const properties = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight'];
      
      if (computed.fill === 'none') target.setAttribute('fill', 'none');
      else if (computed.fill) target.style.fill = computed.fill;
      
      if (computed.stroke === 'none') target.setAttribute('stroke', 'none');
      else if (computed.stroke) target.style.stroke = computed.stroke;

      properties.forEach(prop => {
          if (prop !== 'fill' && prop !== 'stroke') {
              const val = computed[prop];
              if (val && val !== 'auto') target.style[prop] = val;
          }
      });

      for (let i = 0; i < source.children.length; i++) {
          if (target.children[i]) inlineStyles(source.children[i], target.children[i]);
      }
    }
    
    inlineStyles(node, clone);

    clone.setAttribute('width', width);
    clone.setAttribute('height', height);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    const xml = new XMLSerializer().serializeToString(clone);
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

    const img = new Image();
    img.crossOrigin = "Anonymous";
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

export function getVisibleShadow(shadowStr, scale) {
  if (!shadowStr || shadowStr === "none") return null;
  const shadows = shadowStr.split(/,(?![^(]*\))/);
  for (let s of shadows) {
    s = s.trim();
    if (s.startsWith("rgba(0, 0, 0, 0)")) continue;
    const match = s.match(/(rgba?\([^\)]+\)|#[0-9a-fA-F]+)\s+(-?[\d\.]+)px\s+(-?[\d\.]+)px\s+([\d\.]+)px/);
    if (match) {
      const colorStr = match[1];
      const x = parseFloat(match[2]);
      const y = parseFloat(match[3]);
      const blur = parseFloat(match[4]);
      const distance = Math.sqrt(x*x + y*y);
      let angle = Math.atan2(y, x) * (180 / Math.PI);
      if (angle < 0) angle += 360;
      const colorObj = parseColor(colorStr);
      return {
        type: "outer",
        angle: angle,
        blur: blur * 0.75 * scale,
        offset: distance * 0.75 * scale,
        color: colorObj.hex || "000000",
        opacity: colorObj.opacity 
      };
    }
  }
  return null;
}

export function generateGradientSVG(w, h, bgString, radius, border) {
    try {
      const match = bgString.match(/linear-gradient\((.*)\)/);
      if (!match) return null;
      const content = match[1];
      const parts = content.split(/,(?![^(]*\))/).map((p) => p.trim());
      
      let x1 = "0%", y1 = "0%", x2 = "0%", y2 = "100%";
      let stopsStartIdx = 0;
      if (parts[0].includes("to right")) { x1 = "0%"; x2 = "100%"; y2 = "0%"; stopsStartIdx = 1; }
      else if (parts[0].includes("to left")) { x1 = "100%"; x2 = "0%"; y2 = "0%"; stopsStartIdx = 1; }
      else if (parts[0].includes("to top")) { y1 = "100%"; y2 = "0%"; stopsStartIdx = 1; }
      else if (parts[0].includes("to bottom")) { y1 = "0%"; y2 = "100%"; stopsStartIdx = 1; }

      let stopsXML = "";
      const stopParts = parts.slice(stopsStartIdx);
      stopParts.forEach((part, idx) => {
        let color = part;
        let offset = Math.round((idx / (stopParts.length - 1)) * 100) + "%";
        const posMatch = part.match(/(.*?)\s+(\d+(\.\d+)?%?)$/);
        if (posMatch) { color = posMatch[1]; offset = posMatch[2]; }
        let opacity = 1;
        if (color.includes("rgba")) {
           const rgba = color.match(/[\d\.]+/g);
           if(rgba && rgba.length > 3) { opacity = rgba[3]; color = `rgb(${rgba[0]},${rgba[1]},${rgba[2]})`; }
        }
        stopsXML += `<stop offset="${offset}" stop-color="${color}" stop-opacity="${opacity}"/>`;
      });

      let strokeAttr = "";
      if (border) { strokeAttr = `stroke="#${border.color}" stroke-width="${border.width}"`; }

      const svg = `
          <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
              <defs><linearGradient id="grad" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stopsXML}</linearGradient></defs>
              <rect x="0" y="0" width="${w}" height="${h}" rx="${radius}" ry="${radius}" fill="url(#grad)" ${strokeAttr} />
          </svg>`;
      return "data:image/svg+xml;base64," + btoa(svg);
    } catch (e) { return null; }
}

export function generateBlurredSVG(w, h, color, radius, blurPx) {
  const padding = blurPx * 3; 
  const fullW = w + (padding * 2);
  const fullH = h + (padding * 2);
  const x = padding;
  const y = padding;
  let shapeTag = "";
  // Is it a Circle? Use strict check
  const isCircle = radius >= (Math.min(w, h) / 2) - 1 && Math.abs(w - h) < 2;

  if (isCircle) {
      const cx = x + w/2;
      const cy = y + h/2;
      const rx = w/2;
      const ry = h/2;
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
      padding: padding
  };
}