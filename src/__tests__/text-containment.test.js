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
});
