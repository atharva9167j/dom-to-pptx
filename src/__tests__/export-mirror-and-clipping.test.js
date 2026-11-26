import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportToPptx } from '../index.js';
import JSZip from 'jszip';

// jsdom cannot decode images into a canvas; keep the supplied PNG data URL.
vi.mock('../image-processor.js', () => ({
  getProcessedImage: async (src) => src,
}));

function rect({ left, top, width, height }) {
  return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height };
}

describe('Export with transform reflection and overflow clipping', () => {
  let canvasContextSpy;

  beforeEach(() => {
    canvasContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '#ffffff',
      clearRect: () => {},
      fillRect: () => {},
      getImageData: () => ({ data: [255, 255, 255, 255] }),
    });
  });

  afterEach(() => {
    canvasContextSpy.mockRestore();
  });

  it('exports mirrored and rotated img with flipH="1" and correct rotation in OOXML', async () => {
    const container = document.createElement('div');
    container.className = 'slide';
    container.setAttribute('style', 'position:relative;width:960px;height:540px;overflow:hidden;background:#fff;');

    const img = document.createElement('img');
    img.src =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    img.setAttribute(
      'style',
      'position:absolute;left:80px;top:80px;width:240px;height:360px;transform:rotate(8.183762615441651deg) scale(-1, 1);'
    );

    container.appendChild(img);
    document.body.appendChild(container);

    container.getBoundingClientRect = () => rect({ left: 0, top: 0, width: 960, height: 540 });
    img.getBoundingClientRect = () => rect({ left: 80, top: 80, width: 240, height: 360 });

    try {
      const pptxBlob = await exportToPptx(container, {
        outputType: 'blob',
        autoEmbedFonts: false,
        skipDownload: true,
      });

      const zip = await JSZip.loadAsync(pptxBlob);
      const slideXml = await zip.file('ppt/slides/slide1.xml').async('text');

      expect(slideXml).toContain('flipH="1"');
      // 8.18 deg in DrawingML (64000 units/deg): 8 * 64000 = 512000
      expect(slideXml).toMatch(/rot="(?:480000|512000|523760)"/);
      expect(slideXml).not.toContain('rot="-10320000"');
    } finally {
      document.body.removeChild(container);
    }
  });

  it('exports mirrored img with native editable picture outline (<p:pic><p:spPr><a:ln>)', async () => {
    const container = document.createElement('div');
    container.className = 'slide';
    container.setAttribute('style', 'position:relative;width:960px;height:540px;overflow:hidden;background:#fff;');

    const img = document.createElement('img');
    img.src =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    img.setAttribute(
      'style',
      'position:absolute;left:80px;top:80px;width:240px;height:360px;transform:rotate(8.183762615441651deg) scale(-1, 1);border:2px dashed #6366f1;'
    );

    container.appendChild(img);
    document.body.appendChild(container);

    container.getBoundingClientRect = () => rect({ left: 0, top: 0, width: 960, height: 540 });
    img.getBoundingClientRect = () => rect({ left: 80, top: 80, width: 240, height: 360 });

    try {
      const pptxBlob = await exportToPptx(container, {
        outputType: 'blob',
        autoEmbedFonts: false,
        skipDownload: true,
      });

      const zip = await JSZip.loadAsync(pptxBlob);
      const slideXml = await zip.file('ppt/slides/slide1.xml').async('text');

      // The border should be directly inside <p:pic><p:spPr><a:ln> making it editable in PowerPoint
      expect(slideXml).toContain('flipH="1"');
      expect(slideXml).toMatch(/<p:pic>[\s\S]*?<p:spPr>[\s\S]*?<a:ln[\s\S]*?6366F1/);
      expect(slideXml).toMatch(/<a:prstDash\s+val="(?:dash|sysDash|dashDot)"/);
      // No detached overlay shape holding the border color
      const spElements = slideXml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || [];
      expect(spElements.some((sp) => sp.includes('6366F1'))).toBe(false);
      // Clean transport metadata
      expect(slideXml).not.toContain('__b_');
      expect(slideXml).not.toContain('__type_');
    } finally {
      document.body.removeChild(container);
    }
  });

  it('clips unrotated image extending outside an overflow:hidden slide using a:srcRect', async () => {
    const container = document.createElement('div');
    container.className = 'slide';
    container.setAttribute('style', 'position:relative;width:960px;height:540px;overflow:hidden;background:#fff;');

    const img = document.createElement('img');
    img.src =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    img.setAttribute('style', 'position:absolute;left:-100px;top:-50px;width:500px;height:400px;');

    container.appendChild(img);
    document.body.appendChild(container);

    container.getBoundingClientRect = () => rect({ left: 0, top: 0, width: 960, height: 540 });
    img.getBoundingClientRect = () => rect({ left: -100, top: -50, width: 500, height: 400 });

    try {
      const pptxBlob = await exportToPptx(container, {
        outputType: 'blob',
        autoEmbedFonts: false,
        skipDownload: true,
      });

      const zip = await JSZip.loadAsync(pptxBlob);
      const slideXml = await zip.file('ppt/slides/slide1.xml').async('text');

      // The unrotated image should be cropped using <a:srcRect>
      expect(slideXml).toContain('<a:srcRect');
      // Position clipped to slide origin
      expect(slideXml).toMatch(/<a:off\s+x="0"\s+y="0"/);
    } finally {
      document.body.removeChild(container);
    }
  });

  it('exports rotated image extending outside slide with accurate scale and without distortion', async () => {
    const container = document.createElement('div');
    container.className = 'slide';
    container.setAttribute('style', 'position:relative;width:960px;height:540px;overflow:hidden;background:#fff;');

    const img = document.createElement('img');
    img.src =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    img.setAttribute(
      'style',
      'position:absolute;left:-170px;top:-230px;width:650px;height:820px;transform:rotate(8.183762615441651deg) scale(-1, 1);'
    );

    container.appendChild(img);
    document.body.appendChild(container);

    container.getBoundingClientRect = () => rect({ left: 0, top: 0, width: 960, height: 540 });
    img.getBoundingClientRect = () => rect({ left: -170, top: -230, width: 650, height: 820 });

    try {
      const pptxBlob = await exportToPptx(container, {
        outputType: 'blob',
        autoEmbedFonts: false,
        skipDownload: true,
      });

      const zip = await JSZip.loadAsync(pptxBlob);
      const slideXml = await zip.file('ppt/slides/slide1.xml').async('text');

      // Preserves flipH and rotation
      expect(slideXml).toContain('flipH="1"');
      expect(slideXml).toMatch(/rot="(?:480000|512000|523760)"/);
      // Sizing crop omitted for rotated images so texture scale is not distorted
      expect(slideXml).not.toContain('<a:srcRect');
    } finally {
      document.body.removeChild(container);
    }
  });

  it('exports label box with inline code tags without duplicate or fragmented text', async () => {
    const container = document.createElement('div');
    container.className = 'slide';
    container.setAttribute('style', 'position:relative;width:960px;height:540px;overflow:hidden;background:#fff;');

    const labelBox = document.createElement('div');
    labelBox.className = 'label-box';
    labelBox.setAttribute(
      'style',
      'position:absolute;left:450px;top:80px;width:440px;background:#f8fafc;padding:24px;'
    );

    labelBox.innerHTML = `
      <h2>2. Clipping with Negative Coordinates</h2>
      <p>CSS Position: <code>left: -170px; top: -230px; width: 650px; height: 820px;</code></p>
      <p>CSS Overflow on Slide: <code>overflow: hidden</code></p>
      <p><strong>Expected OpenXML:</strong></p>
      <p><code>&lt;a:off x="0" y="0"/&gt;</code> with <code>&lt;a:srcRect l=".." t=".."/&gt;</code></p>
      <p style="color: #64748b;">Previously exported outside slide bounds with negative coordinates (<code>x="-1618488"</code>).</p>
    `;

    container.appendChild(labelBox);
    document.body.appendChild(container);

    container.getBoundingClientRect = () => rect({ left: 0, top: 0, width: 960, height: 540 });
    labelBox.getBoundingClientRect = () => rect({ left: 450, top: 80, width: 440, height: 350 });

    // Mock getBoundingClientRect for all descendants in labelBox
    Array.from(labelBox.querySelectorAll('*')).forEach((el, i) => {
      el.getBoundingClientRect = () => rect({ left: 450, top: 80 + i * 40, width: 400, height: 30 });
    });

    try {
      const pptxBlob = await exportToPptx(container, {
        outputType: 'blob',
        autoEmbedFonts: false,
        skipDownload: true,
      });

      const zip = await JSZip.loadAsync(pptxBlob);
      const slideXml = await zip.file('ppt/slides/slide1.xml').async('text');

      const texts = Array.from(slideXml.matchAll(/<a:t>([^<]*)<\/a:t>/g)).map((m) => m[1]);

      // Check that "Coordinates" only appears once in the entire slide XML
      const coordMatches = texts.filter((t) => t.includes('Coordinates'));
      expect(coordMatches).toHaveLength(1);
      expect(coordMatches[0]).toBe('2. Clipping with Negative Coordinates');
    } finally {
      document.body.removeChild(container);
    }
  });
});
