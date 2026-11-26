import { describe, it, expect, beforeAll } from 'vitest';
import { getTextStyle } from '../utils.js';

// jsdom does not compute -webkit-text-stroke, so pass the computed style values directly.
const computedStyle = (overrides = {}) => ({
  color: 'rgb(23, 32, 51)',
  opacity: '1',
  fontFamily: 'Arial, sans-serif',
  fontSize: '40px',
  fontWeight: '700',
  fontStyle: 'normal',
  textDecoration: 'none',
  lineHeight: 'normal',
  marginTop: '0px',
  marginBottom: '0px',
  backgroundColor: 'rgba(0, 0, 0, 0)',
  letterSpacing: 'normal',
  webkitTextStrokeWidth: '0px',
  webkitTextStrokeColor: 'rgb(23, 32, 51)',
  getPropertyValue: () => '',
  ...overrides,
});

describe('getTextStyle text stroke', () => {
  beforeAll(() => {
    // Mock HTMLCanvasElement.prototype.getContext for JSDOM env
    let fillStyle = '';
    HTMLCanvasElement.prototype.getContext = () => ({
      get fillStyle() {
        return fillStyle;
      },
      set fillStyle(val) {
        fillStyle = val;
      },
    });
  });

  it('maps -webkit-text-stroke to an outline in points', () => {
    const style = computedStyle({ webkitTextStrokeWidth: '4px', webkitTextStrokeColor: 'rgb(255, 255, 255)' });
    expect(getTextStyle(style, 1).outline).toEqual({ size: 3, color: 'FFFFFF' });
    expect(getTextStyle(style, 0.5).outline).toEqual({ size: 1.5, color: 'FFFFFF' });
  });

  it('keeps the color of a translucent stroke', () => {
    const style = computedStyle({ webkitTextStrokeWidth: '2px', webkitTextStrokeColor: 'rgba(255, 0, 0, 0.5)' });
    expect(getTextStyle(style, 1).outline).toEqual({ size: 1.5, color: 'FF0000' });
  });

  it('adds no outline without a visible stroke', () => {
    expect(getTextStyle(computedStyle(), 1)).not.toHaveProperty('outline');
    const transparent = computedStyle({ webkitTextStrokeWidth: '4px', webkitTextStrokeColor: 'rgba(255, 0, 0, 0)' });
    expect(getTextStyle(transparent, 1)).not.toHaveProperty('outline');
    // Browsers without the property report undefined.
    const unsupported = computedStyle({ webkitTextStrokeWidth: undefined, webkitTextStrokeColor: undefined });
    expect(getTextStyle(unsupported, 1)).not.toHaveProperty('outline');
  });
});
