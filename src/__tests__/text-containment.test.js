import { beforeAll, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import { getTextStyle } from '../utils.js';

const DRAWINGML_PERCENT_SCALE = 100000;
const PPTX_SINGLE_SPACING_BASIS = 1.2;

beforeAll(() => {
  let fillStyle = '';
  HTMLCanvasElement.prototype.getContext = () => ({
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value) {
      fillStyle = value;
    },
    clearRect: () => {},
    fillRect: () => {},
    getImageData: () => ({ data: [0, 0, 0, 0] }),
  });
});

function textStyle({ fontSizePx = 16, lineHeightPx = 25, whiteSpace = 'normal' } = {}) {
  return {
    color: '#000000',
    opacity: '1',
    webkitBackgroundClip: 'border-box',
    backgroundClip: 'border-box',
    backgroundImage: 'none',
    fontSize: `${fontSizePx}px`,
    lineHeight: `${lineHeightPx}px`,
    whiteSpace,
    marginTop: '0px',
    marginBottom: '0px',
    fontFamily: 'Arial, sans-serif',
    fontWeight: '400',
    fontStyle: 'normal',
    textDecoration: 'none',
    backgroundColor: 'transparent',
    letterSpacing: 'normal',
    getPropertyValue: () => '',
  };
}

async function serializeTextStyle(style, scale = 0.5) {
  const options = getTextStyle(style, scale);
  const pptx = new PptxGenJS();
  const slide = pptx.addSlide();
  slide.addText([{ text: 'A wrapping paragraph for line spacing.', options: { ...options } }], {
    x: 1,
    y: 1,
    w: 2,
    h: 1,
    margin: 0,
    wrap: !(style.whiteSpace === 'nowrap' || style.whiteSpace === 'pre'),
  });

  const buffer = await pptx.write({ outputType: 'nodebuffer' });
  const zip = await JSZip.loadAsync(buffer);
  return {
    options,
    xml: await zip.file('ppt/slides/slide1.xml').async('string'),
  };
}

describe('soft-wrapped text line spacing', () => {
  it('serializes relative spacing with floor rounding', async () => {
    const style = textStyle({ fontSizePx: 14, lineHeightPx: 25 });
    const { options, xml } = await serializeTextStyle(style);
    const expectedSpcPct = Math.floor((25 / 14 / PPTX_SINGLE_SPACING_BASIS) * DRAWINGML_PERCENT_SCALE);

    expect(expectedSpcPct).toBe(148809);
    expect(options.lineSpacing).toBeUndefined();
    expect(options.lineSpacingMultiple).toBe(expectedSpcPct / DRAWINGML_PERCENT_SCALE);
    expect(xml).toContain(`<a:lnSpc><a:spcPct val="${expectedSpcPct}"/></a:lnSpc>`);
    expect(xml).not.toContain('<a:lnSpc><a:spcPts');
  });

  it('reproduces the Chromium-measured height within serialization rounding', async () => {
    const scale = 0.5;
    const lineHeightPx = 25;
    const { options } = await serializeTextStyle(textStyle({ fontSizePx: 16, lineHeightPx }), scale);
    const chromiumPointHeight = lineHeightPx * 0.75 * scale;
    const oldSerializedPointHeight = Math.round(chromiumPointHeight * 100) / 100;
    const relativePointHeight = options.fontSize * PPTX_SINGLE_SPACING_BASIS * options.lineSpacingMultiple;

    expect(options.lineSpacingMultiple).toBe(1.30208);
    expect(relativePointHeight).toBeCloseTo(chromiumPointHeight, 4);
    expect(Math.abs(relativePointHeight - oldSerializedPointHeight)).toBeLessThanOrEqual(0.01);
  });

  it('keeps the no-wrap badge path byte-identical as exact-point spacing', async () => {
    const { options, xml } = await serializeTextStyle(textStyle({ whiteSpace: 'nowrap' }));

    expect(options.lineSpacing).toBe(9.375);
    expect(options.lineSpacingMultiple).toBeUndefined();
    expect(xml).toContain('<a:lnSpc><a:spcPts val="938"/></a:lnSpc>');
    expect(xml).not.toContain('<a:lnSpc><a:spcPct');
  });
});
