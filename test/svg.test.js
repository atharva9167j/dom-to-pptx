/* eslint-env node */
/* global global */
import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';

// Set up DOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.XMLSerializer = dom.window.XMLSerializer;

// Mock getComputedStyle
global.window.getComputedStyle = (element) => ({
  fill: element.getAttribute('fill') || 'none',
  stroke: element.getAttribute('stroke') || 'none',
  'stroke-width': '1',
  'stroke-linecap': 'butt',
  'stroke-linejoin': 'miter',
  opacity: '1',
  'font-family': 'Arial',
  'font-size': '12px',
  'font-weight': 'normal',
});

import { svgToPng, svgToSvg } from '../src/utils.js';

describe('SVG conversion utilities', () => {
  let testSvg;

  beforeEach(() => {
    // Create a simple SVG element for testing
    testSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    testSvg.setAttribute('width', '100');
    testSvg.setAttribute('height', '100');
    testSvg.setAttribute('viewBox', '0 0 100 100');

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '10');
    rect.setAttribute('y', '10');
    rect.setAttribute('width', '80');
    rect.setAttribute('height', '80');
    rect.setAttribute('fill', '#ff0000');
    testSvg.appendChild(rect);

    document.body.appendChild(testSvg);

    // Mock getBoundingClientRect
    testSvg.getBoundingClientRect = () => ({
      width: 100,
      height: 100,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
    });
  });

  describe('svgToSvg', () => {
    it('should return an SVG data URL', async () => {
      const result = await svgToSvg(testSvg);

      expect(result).toBeTruthy();
      expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it('should preserve SVG structure in the output', async () => {
      const result = await svgToSvg(testSvg);

      // Decode base64 to check content
      const base64Data = result.replace('data:image/svg+xml;base64,', '');
      const svgContent = atob(base64Data);

      expect(svgContent).toContain('<svg');
      expect(svgContent).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svgContent).toContain('<rect');
    });

    it('should set width and height attributes', async () => {
      const result = await svgToSvg(testSvg);

      const base64Data = result.replace('data:image/svg+xml;base64,', '');
      const svgContent = atob(base64Data);

      expect(svgContent).toContain('width="100"');
      expect(svgContent).toContain('height="100"');
    });
  });

  describe('svgToPng', () => {
    it('should be a function', () => {
      expect(typeof svgToPng).toBe('function');
    });

    // Note: Full PNG conversion tests require canvas which isn't available in jsdom
    // These would need a browser environment or canvas polyfill
  });
});

describe('svgAsVector option', () => {
  it('should be documented in the export function JSDoc', async () => {
    // This is a documentation check - the option should exist
    const indexSource = await import('fs').then((fs) =>
      fs.promises.readFile('./src/index.js', 'utf-8')
    );

    expect(indexSource).toContain('svgAsVector');
    expect(indexSource).toContain('If true, keeps SVG as vector');
  });
});
