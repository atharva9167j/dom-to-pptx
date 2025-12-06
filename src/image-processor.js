// src/image-processor.js

export async function getProcessedImage(src, targetW, targetH, radius) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous'; // Critical for canvas manipulation

    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Double resolution for better quality
      const scale = 2;
      canvas.width = targetW * scale;
      canvas.height = targetH * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);

      // Normalize radius input to an object { tl, tr, br, bl }
      let r = { tl: 0, tr: 0, br: 0, bl: 0 };
      if (typeof radius === 'number') {
        r = { tl: radius, tr: radius, br: radius, bl: radius };
      } else if (typeof radius === 'object' && radius !== null) {
        r = { ...r, ...radius }; // Merge with defaults
      }

      // 1. Draw the Mask (Custom Shape with specific corners)
      ctx.beginPath();
      
      // Border Radius Clamping Logic (CSS Spec)
      // Prevents corners from overlapping if radii are too large for the container
      const factor = Math.min(
        (targetW / (r.tl + r.tr)) || Infinity,
        (targetH / (r.tr + r.br)) || Infinity,
        (targetW / (r.br + r.bl)) || Infinity,
        (targetH / (r.bl + r.tl)) || Infinity
      );

      if (factor < 1) {
        r.tl *= factor; r.tr *= factor; r.br *= factor; r.bl *= factor;
      }

      // Draw path: Top-Left -> Top-Right -> Bottom-Right -> Bottom-Left
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

      // 2. Composite Source-In (Crops the next image draw to the mask)
      ctx.globalCompositeOperation = 'source-in';

      // 3. Draw Image (Object Cover Logic)
      const wRatio = targetW / img.width;
      const hRatio = targetH / img.height;
      const maxRatio = Math.max(wRatio, hRatio);
      const renderW = img.width * maxRatio;
      const renderH = img.height * maxRatio;
      const renderX = (targetW - renderW) / 2;
      const renderY = (targetH - renderH) / 2;

      ctx.drawImage(img, renderX, renderY, renderW, renderH);

      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => resolve(null);
    img.src = src;
  });
}