import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { exportToPptx } from '../index.js';

// jsdom cannot decode images into a canvas; keep the supplied PNG data URL.
vi.mock('../image-processor.js', () => ({
  getProcessedImage: async (src) => src,
}));

function rect({ left, top, width, height }) {
  return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height };
}

describe('image wrapper background', () => {
  it('exports a solid-fill shape behind a direct img child that fills its wrapper', async () => {
    const canvasContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '',
      clearRect: () => {},
      fillRect: () => {},
      getImageData: () => ({ data: [0, 0, 0, 0] }),
    });

    const slide = document.createElement('div');
    slide.setAttribute('style', 'position:relative;width:960px;height:540px');
    const wrapper = document.createElement('div');
    wrapper.setAttribute(
      'style',
      'position:absolute;left:48px;top:96px;width:192px;height:96px;background-color:#123456'
    );
    const img = document.createElement('img');
    img.setAttribute('style', 'display:block;width:100%;height:100%');
    // A transparent PNG needs the wrapper's background to remain visible.
    img.src =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
    wrapper.appendChild(img);
    slide.appendChild(wrapper);
    document.body.appendChild(slide);

    // jsdom reports offsetWidth/offsetHeight as 0. Mock both bounding rects
    // identically so the fallback measurements make isImageWrapper true.
    slide.getBoundingClientRect = () => rect({ left: 0, top: 0, width: 960, height: 540 });
    wrapper.getBoundingClientRect = () => rect({ left: 48, top: 96, width: 192, height: 96 });
    img.getBoundingClientRect = wrapper.getBoundingClientRect;

    try {
      const blob = await exportToPptx(slide, { skipDownload: true, autoEmbedFonts: false });
      const zip = await JSZip.loadAsync(blob);
      const xml = await zip.file('ppt/slides/slide1.xml').async('string');
      const doc = new DOMParser().parseFromString(xml, 'text/xml');

      // At 960px = 10in, each CSS pixel maps to 9525 EMU.
      // Locate the wrapper itself, excluding jsdom's fallback pseudo-element shapes.
      const shapes = Array.from(doc.getElementsByTagName('p:sp')).filter((shape) => {
        const offset = shape.getElementsByTagName('a:off')[0];
        return Number(offset?.getAttribute('x')) === 48 * 9525 && Number(offset?.getAttribute('y')) === 96 * 9525;
      });
      expect(shapes).toHaveLength(1);
      const properties = shapes[0].getElementsByTagName('p:spPr')[0];
      const fill = properties.getElementsByTagName('a:solidFill')[0];
      expect(fill).toBeDefined();
      expect(fill.getElementsByTagName('a:srgbClr')[0].getAttribute('val')).toBe('123456');

      const extent = properties.getElementsByTagName('a:ext')[0];
      expect(Number(extent.getAttribute('cx'))).toBe(192 * 9525);
      expect(Number(extent.getAttribute('cy'))).toBe(96 * 9525);

      const pictures = Array.from(doc.getElementsByTagName('p:pic'));
      expect(pictures).toHaveLength(1);
      expect(shapes[0].compareDocumentPosition(pictures[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    } finally {
      slide.remove();
      canvasContext.mockRestore();
    }
  });
});
