// src/image-processor.js

export async function getProcessedImage(
  src,
  targetW,
  targetH,
  radius,
  objectFit = 'fill',
  objectPosition = '50% 50%',
  opacity = 1,
  filter = 'none'
) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 2; // Double resolution
      canvas.width = targetW * scale;
      canvas.height = targetH * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);

      // Normalize radius
      let r = { tl: 0, tr: 0, br: 0, bl: 0 };
      if (typeof radius === 'number') {
        r = { tl: radius, tr: radius, br: radius, bl: radius };
      } else if (typeof radius === 'object' && radius !== null) {
        r = { ...r, ...radius };
      }

      // 1. Draw Mask
      ctx.beginPath();
      // ... (radius clamping logic remains the same) ...
      const factor = Math.min(
        targetW / (r.tl + r.tr) || Infinity,
        targetH / (r.tr + r.br) || Infinity,
        targetW / (r.br + r.bl) || Infinity,
        targetH / (r.bl + r.tl) || Infinity
      );

      if (factor < 1) {
        r.tl *= factor;
        r.tr *= factor;
        r.br *= factor;
        r.bl *= factor;
      }

      ctx.moveTo(r.tl, 0);
      ctx.lineTo(targetW - r.tr, 0);
      ctx.arcTo(targetW, 0, targetW, r.tr, r.tr);
      ctx.lineTo(targetW, targetH - r.br);
      ctx.arcTo(targetW, targetH, targetW - r.br, targetH, r.br);
      ctx.lineTo(r.bl, targetH);
      ctx.arcTo(0, targetH, 0, targetH - r.bl, r.bl);
      ctx.lineTo(0, r.tl);
      ctx.arcTo(0, 0, r.tl, 0, r.tl);
      ctx.closePath();
      ctx.fillStyle = '#000';
      ctx.fill();

      // 2. Composite Source-In
      ctx.globalCompositeOperation = 'source-in';

      // 3. Draw Image with Object Fit logic
      const wRatio = targetW / img.width;
      const hRatio = targetH / img.height;
      let renderW, renderH;

      if (objectFit === 'contain') {
        const fitScale = Math.min(wRatio, hRatio);
        renderW = img.width * fitScale;
        renderH = img.height * fitScale;
      } else if (objectFit === 'cover') {
        const coverScale = Math.max(wRatio, hRatio);
        renderW = img.width * coverScale;
        renderH = img.height * coverScale;
      } else if (objectFit === 'none') {
        renderW = img.width;
        renderH = img.height;
      } else if (objectFit === 'scale-down') {
        const scaleDown = Math.min(1, Math.min(wRatio, hRatio));
        renderW = img.width * scaleDown;
        renderH = img.height * scaleDown;
      } else {
        // 'fill' (default)
        renderW = targetW;
        renderH = targetH;
      }

      // Handle Object Position (simplified parsing for "x% y%" or keywords)
      let posX = 0.5; // Default center
      let posY = 0.5;

      const posParts = objectPosition.split(' ');
      if (posParts.length > 0) {
        const parsePos = (val) => {
          if (val === 'left' || val === 'top') return 0;
          if (val === 'center') return 0.5;
          if (val === 'right' || val === 'bottom') return 1;
          if (val.includes('%')) return parseFloat(val) / 100;
          return 0.5; // fallback
        };
        posX = parsePos(posParts[0]);
        posY = posParts.length > 1 ? parsePos(posParts[1]) : 0.5;
      }

      const renderX = (targetW - renderW) * posX;
      const renderY = (targetH - renderH) * posY;

      if (filter && filter !== 'none') {
        try {
          ctx.filter = filter;
        } catch {
          // Ignore invalid filter strings in environments where ctx.filter is unsupported
        }
      }
      if (typeof opacity === 'number' && !isNaN(opacity) && opacity >= 0 && opacity <= 1) {
        ctx.globalAlpha = opacity;
      }

      ctx.drawImage(img, renderX, renderY, renderW, renderH);

      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => resolve(null);
    img.src = src;
  });
}
