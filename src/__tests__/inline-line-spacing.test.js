import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import { collectTextParts } from '../utils.js';

beforeAll(() => {
  let fillStyle = '';
  HTMLCanvasElement.prototype.getContext = () => ({
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value) {
      fillStyle = value;
    },
  });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function collect(tag, contents) {
  const element = document.createElement(tag);
  element.style.cssText = 'font-size:24px;line-height:36px;color:rgb(0,0,0)';
  element.innerHTML = contents;
  document.body.append(element);
  const computed = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((node) => computed(node));
  return collectTextParts(element, window.getComputedStyle(element), 1);
}

const citation = '<span style="font-size:12px;line-height:12px;color:green">[1]</span>';

describe('inline text preserves containing paragraph line spacing', () => {
  for (const parent of ['p', 'div']) {
    for (const [position, contents] of [
      ['start', `${citation} Alpha beta gamma`],
      ['middle', `Alpha ${citation} beta gamma`],
      ['end', `Alpha beta gamma ${citation}`],
    ]) {
      it(`${parent} with a smaller citation at ${position}`, () => {
        const parts = collect(parent, contents);
        expect(parts.every((part) => part.options.lineSpacing === 27)).toBe(true);
        const marker = parts.find((part) => part.text === '[1]');
        expect(marker.options.fontSize).toBe(9);
        expect(marker.options.color).toBe('008000');
      });
    }
  }

  it('handles inherited unitless line-height on smaller inline text', () => {
    const parts = collect('p', 'Alpha <span style="font-size:12px;line-height:1.5">[1]</span>');
    expect(parts.every((part) => part.options.lineSpacing === 27)).toBe(true);
  });

  it('handles inline-block spans and nested inline styling', () => {
    const parts = collect(
      'div',
      'Alpha <span style="font-size:12px;line-height:12px;display:inline-block"><b>[1]</b></span>'
    );
    expect(parts.every((part) => part.options.lineSpacing === 27)).toBe(true);
  });

  it('keeps separate block paragraphs independent', () => {
    const parts = collect('div', 'Alpha<div style="font-size:12px;line-height:12px">[1]</div>');
    expect(parts.find((part) => part.text === 'Alpha').options.lineSpacing).toBe(27);
    expect(parts.find((part) => part.text === '[1]').options.lineSpacing).toBe(9);
  });

  it('scales paragraph spacing along with text geometry', () => {
    collect('p', `Alpha ${citation}`);
    const element = document.body.firstElementChild;
    const parts = collectTextParts(element, window.getComputedStyle(element), 2);
    expect(parts.every((part) => part.options.lineSpacing === 54)).toBe(true);
  });
  it('does not impose a child line-height on a normal-height paragraph', () => {
    collect('p', `Alpha ${citation}`);
    const element = document.body.firstElementChild;
    element.style.lineHeight = 'normal';
    const parts = collectTextParts(element, window.getComputedStyle(element), 1);
    expect(parts.every((part) => part.options.lineSpacing === undefined)).toBe(true);
  });

  it('preserves hyperlinks and explicit line breaks', () => {
    const parts = collect(
      'p',
      'Alpha<br>Beta <a href="https://example.com" style="font-size:12px;line-height:12px">link</a>'
    );
    const link = parts.find((part) => part.text === 'link');
    expect(link.options.hyperlink).toMatchObject({ url: 'https://example.com' });
    expect(link.options.lineSpacing).toBe(27);
    expect(parts.some((part) => part.options.breakLine)).toBe(true);
  });

  it('writes the containing paragraph spacing into PowerPoint XML', async () => {
    const parts = collect('p', `Alpha beta gamma ${citation}`);
    const pptx = new PptxGenJS();
    pptx.addSlide().addText(parts, { x: 0, y: 0, w: 4, h: 2 });
    const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer' }));
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');
    expect(xml).toContain('<a:spcPts val="2700"/>');
    expect(xml).not.toContain('<a:spcPts val="900"/>');
  });
});
