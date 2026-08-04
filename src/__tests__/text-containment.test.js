import { beforeAll, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportToPptx } from '../index.js';

const EMU_PER_PX = 4762.5;

function rect({ left, top, width, height }) {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON() {
      return this;
    },
  };
}

function shapeContainingText(xml, text) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const textNode = Array.from(doc.getElementsByTagName('a:t')).find((node) => node.textContent.includes(text));
  expect(textNode).toBeDefined();

  let shape = textNode;
  while (shape && shape.localName !== 'sp') {
    shape = shape.parentNode;
  }
  expect(shape).toBeDefined();
  return shape;
}

function shapeGeometry(shape) {
  const offset = shape.getElementsByTagName('a:off')[0];
  const extent = shape.getElementsByTagName('a:ext')[0];
  return {
    x: Number(offset.getAttribute('x')),
    y: Number(offset.getAttribute('y')),
    width: Number(extent.getAttribute('cx')),
    height: Number(extent.getAttribute('cy')),
  };
}

function bodyInsets(shape) {
  const bodyPr = shape.getElementsByTagName('a:bodyPr')[0];
  return {
    left: Number(bodyPr.getAttribute('lIns')),
    right: Number(bodyPr.getAttribute('rIns')),
    bottom: Number(bodyPr.getAttribute('bIns')),
    top: Number(bodyPr.getAttribute('tIns')),
  };
}

describe('bare text containment and no-wrap compatibility', () => {
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
      getImageData: () => ({ data: [0, 0, 0, 255] }),
    });
  });

  it('contains wrapping text while retaining width slack for a no-wrap badge', async () => {
    const slide = document.createElement('div');
    slide.setAttribute('style', 'position:relative;width:1920px;height:1080px;background:#fff');

    const copy = document.createElement('div');
    copy.textContent =
      'Design concept copy deliberately runs long enough to exercise wrapping while preserving the authored right inset.';
    copy.setAttribute(
      'style',
      'position:absolute;left:1052px;top:300px;width:820px;height:320px;color:#111;font-size:24px;line-height:32px;white-space:normal;overflow-wrap:anywhere'
    );

    const badge = document.createElement('div');
    badge.textContent = 'NO WRAP';
    Object.assign(badge.style, {
      position: 'absolute',
      left: '48px',
      top: '48px',
      width: '120px',
      height: '32px',
      color: '#fff',
      backgroundColor: '#123456',
      borderTopLeftRadius: '16px',
      borderTopRightRadius: '16px',
      borderBottomRightRadius: '16px',
      borderBottomLeftRadius: '16px',
      fontSize: '16px',
      lineHeight: '32px',
      textAlign: 'center',
      whiteSpace: 'nowrap',
    });

    slide.append(copy, badge);
    document.body.appendChild(slide);

    slide.getBoundingClientRect = () => rect({ left: 0, top: 0, width: 1920, height: 1080 });
    copy.getBoundingClientRect = () => rect({ left: 1052, top: 300, width: 820, height: 320 });
    badge.getBoundingClientRect = () => rect({ left: 48, top: 48, width: 120, height: 32 });

    try {
      const blob = await exportToPptx(slide, {
        skipDownload: true,
        autoEmbedFonts: false,
      });
      const zip = await JSZip.loadAsync(blob);
      const xml = await zip.file('ppt/slides/slide1.xml').async('string');

      const copyShape = shapeContainingText(xml, 'Design concept copy');
      const copyGeometry = shapeGeometry(copyShape);
      const authoredRightEdge = Math.round((1052 + 820) * EMU_PER_PX);
      expect(copyGeometry.x + copyGeometry.width).toBeLessThanOrEqual(authoredRightEdge);
      expect(copyGeometry.width).toBe(Math.round(820 * EMU_PER_PX));
      expect(copyShape.getElementsByTagName('a:normAutofit')).toHaveLength(1);

      const badgeShape = shapeContainingText(xml, 'NO WRAP');
      const badgeGeometry = shapeGeometry(badgeShape);
      expect(badgeGeometry.width).toBe(Math.round(120 * 1.06 * EMU_PER_PX));
      expect(badgeShape.getElementsByTagName('a:spAutoFit')).toHaveLength(0);
      expect(badgeShape.getElementsByTagName('a:normAutofit')).toHaveLength(0);
      expect(badgeShape.getElementsByTagName('a:bodyPr')[0].getAttribute('wrap')).toBe('none');
    } finally {
      slide.remove();
    }
  });

  it('widens no-wrap text by its insets while preserving visible geometry and wrapping containment', async () => {
    const slide = document.createElement('div');
    slide.setAttribute('style', 'position:relative;width:1920px;height:1080px;background:#fff');

    const label = document.createElement('div');
    label.textContent = 'White';
    label.setAttribute(
      'style',
      'position:absolute;color:#111;font-size:9px;line-height:20px;white-space:nowrap;padding-right:4px'
    );

    const pill = document.createElement('div');
    pill.textContent = 'COLLECTION PITCH';
    Object.assign(pill.style, {
      position: 'absolute',
      color: '#fff',
      backgroundColor: '#123456',
      border: '1px solid #123456',
      borderRadius: '16px',
      fontSize: '10px',
      lineHeight: '16px',
      textAlign: 'center',
      whiteSpace: 'nowrap',
      padding: '8px 18px',
    });

    const copy = document.createElement('div');
    copy.textContent = 'Wrapping control remains inside its exact authored width.';
    copy.setAttribute(
      'style',
      'position:absolute;color:#111;font-size:24px;line-height:32px;white-space:normal;padding:0'
    );

    slide.append(label, pill, copy);
    document.body.appendChild(slide);

    slide.getBoundingClientRect = () => rect({ left: 0, top: 0, width: 1920, height: 1080 });
    label.getBoundingClientRect = () =>
      rect({ left: 1800, top: 530, width: 162446 / EMU_PER_PX, height: 95250 / EMU_PER_PX });
    pill.getBoundingClientRect = () =>
      rect({ left: 48, top: 48, width: 752252 / EMU_PER_PX, height: 150019 / EMU_PER_PX });
    copy.getBoundingClientRect = () => rect({ left: 1052, top: 300, width: 820, height: 320 });

    try {
      const blob = await exportToPptx(slide, {
        skipDownload: true,
        autoEmbedFonts: false,
      });
      const zip = await JSZip.loadAsync(blob);
      const xml = await zip.file('ppt/slides/slide1.xml').async('string');

      const labelShape = shapeContainingText(xml, 'White');
      const labelGeometry = shapeGeometry(labelShape);
      expect(labelGeometry.width).toBe(181496);
      expect(labelGeometry.width - bodyInsets(labelShape).right).toBe(162446);
      expect(labelGeometry.x + labelGeometry.width).toBeLessThanOrEqual(9144000);
      expect(bodyInsets(labelShape)).toEqual({ left: 0, right: 19050, bottom: 0, top: 0 });

      const pillTextShape = shapeContainingText(xml, 'COLLECTION PITCH');
      const pillTextGeometry = shapeGeometry(pillTextShape);
      expect(pillTextGeometry.x).toBe(142875);
      expect(pillTextGeometry.width).toBe(923702);
      expect(pillTextGeometry.width - bodyInsets(pillTextShape).left - bodyInsets(pillTextShape).right).toBe(752252);
      expect(pillTextGeometry.x + pillTextGeometry.width).toBeLessThanOrEqual(9144000);
      expect(bodyInsets(pillTextShape)).toEqual({ left: 85725, right: 85725, bottom: 38100, top: 38100 });

      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      const visiblePill = Array.from(doc.getElementsByTagName('p:sp')).find((shape) => {
        const geometry = shapeGeometry(shape);
        return !shape.getElementsByTagName('a:t').length && geometry.x === 228600 && geometry.width === 752252;
      });
      expect(visiblePill).toBeDefined();
      expect(shapeGeometry(visiblePill)).toEqual({ x: 228600, y: 228600, width: 752252, height: 150019 });

      const copyShape = shapeContainingText(xml, 'Wrapping control');
      const copyGeometry = shapeGeometry(copyShape);
      expect(copyGeometry.width).toBe(Math.round(820 * EMU_PER_PX));
      expect(copyGeometry.x + copyGeometry.width).toBeLessThanOrEqual(Math.round((1052 + 820) * EMU_PER_PX));
      expect(bodyInsets(copyShape)).toEqual({ left: 0, right: 0, bottom: 0, top: 0 });
      expect(copyShape.getElementsByTagName('a:bodyPr')[0].getAttribute('wrap')).toBe('square');
    } finally {
      slide.remove();
    }
  });
});
