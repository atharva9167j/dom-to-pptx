import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportToPptx } from '../index.js';
import { getTextStyle, collectTextParts } from '../utils.js';
import JSZip from 'jszip';

// Mock getProcessedImage to check arguments and return mock data URL
vi.mock('../image-processor.js', () => ({
  getProcessedImage: vi.fn(async () => {
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  }),
}));

import { getProcessedImage } from '../image-processor.js';

function rect({ left, top, width, height }) {
  return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height };
}

describe('Image Opacity & Modern Text Features', () => {
  let canvasContextSpy;

  beforeEach(() => {
    canvasContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '#ffffff',
      clearRect: () => {},
      fillRect: () => {},
      getImageData: () => ({ data: [255, 255, 255, 255] }),
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    canvasContextSpy.mockRestore();
  });

  it('exports image with opacity < 1 by passing opacity to processor and injecting alphaModFix into OpenXML', async () => {
    const container = document.createElement('div');
    container.className = 'slide';
    container.setAttribute('style', 'position:relative;width:960px;height:540px;background:#121212;');

    const wrapper = document.createElement('div');
    wrapper.setAttribute('style', 'position:absolute;left:0;top:0;width:960px;height:540px;opacity:0.3;');

    const img = document.createElement('img');
    img.src = 'https://example.com/hero.jpg';
    img.setAttribute('style', 'width:100%;height:100%;object-fit:cover;filter:grayscale(100%);');

    wrapper.appendChild(img);
    container.appendChild(wrapper);
    document.body.appendChild(container);

    container.getBoundingClientRect = () => rect({ left: 0, top: 0, width: 960, height: 540 });
    wrapper.getBoundingClientRect = () => rect({ left: 0, top: 0, width: 960, height: 540 });
    img.getBoundingClientRect = () => rect({ left: 0, top: 0, width: 960, height: 540 });

    try {
      const pptxBlob = await exportToPptx(container, {
        outputType: 'blob',
        autoEmbedFonts: false,
        skipDownload: true,
      });

      const zip = await JSZip.loadAsync(pptxBlob);
      const slideXml = await zip.file('ppt/slides/slide1.xml').async('text');

      // 1. Verify getProcessedImage was called with opacity = 1 (to avoid double-fading with alphaModFix) and filter
      expect(getProcessedImage).toHaveBeenCalled();
      const lastCall = getProcessedImage.mock.calls[0];
      expect(lastCall[6]).toBe(1); // opacity param
      expect(lastCall[7]).toContain('grayscale'); // filter param

      // 2. Verify OpenXML has native <a:alphaModFix amt="30000"/> inside <p:pic><p:blipFill><a:blip>
      expect(slideXml).toMatch(/<a:blip[\s\S]*?<a:alphaModFix\s+amt="30000"\s*\/>/);

      // 3. Verify clean metadata (no leaking transport tokens)
      expect(slideXml).not.toContain('__a_');
    } finally {
      document.body.removeChild(container);
    }
  });

  it('supports strikethrough for text-decoration: line-through and <del> tags', () => {
    // 1. CSS text-decoration: line-through
    const style = {
      color: '#000000',
      opacity: '1',
      fontSize: '16px',
      fontFamily: 'Arial',
      fontWeight: '400',
      fontStyle: 'normal',
      textDecoration: 'line-through',
    };
    const opts = getTextStyle(style, 1);
    expect(opts.strike).toBe(true);

    // 2. Semantic <del> element
    const p = document.createElement('p');
    p.innerHTML = 'Regular <del>Old Price</del> New Price';
    const parts = collectTextParts(p, style, 1);
    const delPart = parts.find((pt) => pt.text.includes('Old Price'));
    expect(delPart).toBeDefined();
    expect(delPart.options.strike).toBe(true);
  });

  it('supports superscript (<sup>) and subscript (<sub>) text runs', () => {
    const style = {
      color: '#000000',
      opacity: '1',
      fontSize: '16px',
      fontFamily: 'Arial',
      fontWeight: '400',
      fontStyle: 'normal',
      textDecoration: 'none',
    };

    // 1. <sup> tag
    const pSup = document.createElement('p');
    pSup.innerHTML = 'Einstein: E = mc<sup>2</sup>';
    const partsSup = collectTextParts(pSup, style, 1);
    const supPart = partsSup.find((pt) => pt.text.includes('2'));
    expect(supPart).toBeDefined();
    expect(supPart.options.superscript).toBe(true);

    // 2. <sub> tag
    const pSub = document.createElement('p');
    pSub.innerHTML = 'Water formula: H<sub>2</sub>O';
    const partsSub = collectTextParts(pSub, style, 1);
    const subPart = partsSub.find((pt) => pt.text.includes('2'));
    expect(subPart).toBeDefined();
    expect(subPart.options.subscript).toBe(true);
  });
});
