import { describe, it, expect } from 'vitest';
import { getTransformProperties, getRotation, getClippingAncestor } from '../utils.js';

describe('getTransformProperties and getRotation', () => {
  it('handles null, empty, or "none"', () => {
    expect(getTransformProperties(null)).toEqual({ rotate: 0, flipH: false, flipV: false });
    expect(getTransformProperties('')).toEqual({ rotate: 0, flipH: false, flipV: false });
    expect(getTransformProperties('none')).toEqual({ rotate: 0, flipH: false, flipV: false });
    expect(getRotation('none')).toBe(0);
  });

  it('decomposes standard rotation without reflection', () => {
    // 45deg rotation
    const rad45 = (45 * Math.PI) / 180;
    const m45 = `matrix(${Math.cos(rad45)}, ${Math.sin(rad45)}, ${-Math.sin(rad45)}, ${Math.cos(rad45)}, 0, 0)`;
    const res45 = getTransformProperties(m45);
    expect(res45.rotate).toBe(45);
    expect(res45.flipH).toBe(false);
    expect(res45.flipV).toBe(false);
  });

  it('decomposes rotate(8.18deg) scale(-1, 1) without losing flipH or corrupting rotation angle', () => {
    const deg = 8.183762615441651;
    const rad = (deg * Math.PI) / 180;
    // CSS computed matrix for rotate(8.18deg) scale(-1, 1):
    // R(8.18) * S(-1, 1)
    const a = -Math.cos(rad);
    const b = -Math.sin(rad);
    const c = -Math.sin(rad);
    const d = Math.cos(rad);
    const matrixStr = `matrix(${a}, ${b}, ${c}, ${d}, 0, 0)`;

    const props = getTransformProperties(matrixStr);
    expect(props.rotate).toBe(8);
    expect(props.flipH).toBe(true);
    expect(props.flipV).toBe(false);

    // Old getRotation would return ~188 or -172 deg because it omitted reflection
    expect(getRotation(matrixStr)).toBe(8);
  });

  it('handles explicit inline function notation rotate(8.18deg) scale(-1, 1)', () => {
    const transformStr = 'rotate(8.183762615441651deg) scale(-1, 1)';
    const props = getTransformProperties(transformStr);
    expect(props.rotate).toBe(8);
    expect(props.flipH).toBe(true);
    expect(props.flipV).toBe(false);
  });

  it('handles scale(-1, -1) and scaleY(-1)', () => {
    expect(getTransformProperties('scale(-1, 1)')).toEqual({ rotate: 0, flipH: true, flipV: false });
    expect(getTransformProperties('scale(1, -1)')).toEqual({ rotate: 0, flipH: false, flipV: true });
    expect(getTransformProperties('scaleX(-1)')).toEqual({ rotate: 0, flipH: true, flipV: false });
    expect(getTransformProperties('scaleY(-1)')).toEqual({ rotate: 0, flipH: false, flipV: true });
  });
});

describe('getClippingAncestor', () => {
  it('detects ancestor with overflow: hidden', () => {
    const container = document.createElement('div');
    container.style.overflow = 'hidden';
    const child = document.createElement('div');
    const grandChild = document.createElement('img');
    container.appendChild(child);
    child.appendChild(grandChild);
    document.body.appendChild(container);

    const ancestor = getClippingAncestor(grandChild);
    expect(ancestor).toBe(container);

    document.body.removeChild(container);
  });

  it('returns null if all ancestors have visible overflow', () => {
    const container = document.createElement('div');
    container.style.overflow = 'visible';
    const child = document.createElement('img');
    container.appendChild(child);
    document.body.appendChild(container);

    const ancestor = getClippingAncestor(child);
    expect(ancestor).toBeNull();

    document.body.removeChild(container);
  });
});
