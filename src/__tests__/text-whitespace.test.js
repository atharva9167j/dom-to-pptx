import { describe, it, expect } from 'vitest';
import { splitPreformattedText, textWraps, withTextWidthSlack, withNoWrapInsetSlack } from '../utils.js';

const texts = (segs) => segs.map((s) => s.text);
const breaks = (segs) => segs.map((s) => s.breakLine);

describe('splitPreformattedText', () => {
  it('preserves newlines as hard breaks (pre)', () => {
    const segs = splitPreformattedText('line1\nline2\nline3', 'pre', { isLastChild: true });
    expect(texts(segs)).toEqual(['line1', 'line2', 'line3']);
    expect(breaks(segs)).toEqual([true, true, false]);
  });

  it('preserves leading indentation and inner spaces for pre / pre-wrap', () => {
    expect(texts(splitPreformattedText('  a   b', 'pre', { isLastChild: true }))).toEqual(['  a   b']);
    expect(texts(splitPreformattedText('  a   b', 'pre-wrap', { isLastChild: true }))).toEqual(['  a   b']);
  });

  it('collapses runs of spaces/tabs but keeps newlines for pre-line', () => {
    const segs = splitPreformattedText('a\t \tb\n  c', 'pre-line', { isLastChild: true });
    expect(texts(segs)).toEqual(['a b', ' c']);
    expect(breaks(segs)).toEqual([true, false]);
  });

  it('renders tabs as spaces for pre (no PPTX tab stops)', () => {
    expect(texts(splitPreformattedText('\tx', 'pre', { isLastChild: true }))).toEqual(['    x']);
  });

  it('keeps internal blank lines', () => {
    const segs = splitPreformattedText('a\n\nb', 'pre', { isLastChild: true });
    expect(texts(segs)).toEqual(['a', '', 'b']);
    expect(breaks(segs)).toEqual([true, true, false]);
  });

  it('ignores a single newline immediately after a <pre> start tag', () => {
    const segs = splitPreformattedText('\nfirst\nsecond', 'pre', {
      isFirstChild: true,
      isPre: true,
      isLastChild: true,
    });
    expect(texts(segs)).toEqual(['first', 'second']);
  });

  it('does not strip the leading newline when not the first child or not <pre>', () => {
    const segs = splitPreformattedText('\nfirst', 'pre-wrap', {
      isFirstChild: true,
      isPre: false,
      isLastChild: true,
    });
    expect(texts(segs)).toEqual(['', 'first']);
  });

  it('drops a single trailing newline terminator on the last text node', () => {
    expect(texts(splitPreformattedText('a\n', 'pre', { isLastChild: true }))).toEqual(['a']);
  });

  it('keeps a trailing newline when the text node is not the last child', () => {
    // e.g. <pre>line1\n<span>x</span></pre> — the break before the span must survive
    const segs = splitPreformattedText('line1\n', 'pre', { isLastChild: false });
    expect(texts(segs)).toEqual(['line1', '']);
    expect(breaks(segs)).toEqual([true, false]);
  });

  it('normalizes CRLF to a single break', () => {
    expect(texts(splitPreformattedText('a\r\nb', 'pre', { isLastChild: true }))).toEqual(['a', 'b']);
  });

  it('applies text-transform per line', () => {
    expect(texts(splitPreformattedText('aa\nbb', 'pre', { isLastChild: true, textTransform: 'uppercase' }))).toEqual([
      'AA',
      'BB',
    ]);
  });

  it('returns nothing for empty / terminator-only content', () => {
    expect(splitPreformattedText('\n', 'pre', { isLastChild: true })).toEqual([]);
    expect(splitPreformattedText('', 'pre', { isLastChild: true })).toEqual([]);
  });
});

describe('textWraps', () => {
  it('is false for nowrap and pre (single measured line, wrap="none", no spAutoFit)', () => {
    expect(textWraps({ whiteSpace: 'nowrap' })).toBe(false);
    expect(textWraps({ whiteSpace: 'pre' })).toBe(false);
  });

  it('is true for wrapping white-space modes', () => {
    expect(textWraps({ whiteSpace: 'normal' })).toBe(true);
    expect(textWraps({ whiteSpace: 'pre-wrap' })).toBe(true);
    expect(textWraps({ whiteSpace: 'pre-line' })).toBe(true);
  });
});

describe('withTextWidthSlack', () => {
  const box = (over = {}) => ({ x: 1, y: 1, w: 1, h: 0.2, wrap: false, ...over });

  it('leaves vertical, rotated, and zero-width boxes untouched', () => {
    for (const opts of [box({ vert: 'eaVert' }), box({ rotate: 90 }), box({ w: 0 })]) {
      expect(withTextWidthSlack(opts)).toBe(opts);
    }
  });

  it('keeps wrapping text inside its browser-measured box', () => {
    const opts = box({ wrap: true });
    expect(withTextWidthSlack(opts)).toBe(opts);
  });

  it('widens a left-anchored no-wrap box without moving x', () => {
    const out = withTextWidthSlack(box());
    expect(out.w).toBeCloseTo(1.06);
    expect(out.x).toBe(1);
  });

  it('applies a 0.02in floor for tiny boxes', () => {
    const out = withTextWidthSlack(box({ w: 0.1 }));
    expect(out.w).toBeCloseTo(0.12);
  });

  it('shifts x to keep centered and right-aligned text anchored', () => {
    expect(withTextWidthSlack(box(), 'center').x).toBeCloseTo(1 - 0.03);
    expect(withTextWidthSlack(box(), 'right').x).toBeCloseTo(1 - 0.06);
  });
});

describe('withNoWrapInsetSlack', () => {
  // margin follows the PptxGenJS inset order [lIns, rIns, bIns, tIns], in points
  const box = (over = {}) => ({ x: 1, y: 1, w: 1, h: 0.2, wrap: false, margin: [6, 6, 6, 6], ...over });

  it('leaves wrapping, vertical, zero-width, and non-array-margin boxes untouched', () => {
    for (const opts of [box({ wrap: true }), box({ vert: 'eaVert' }), box({ w: 0 }), box({ margin: 0 })]) {
      expect(withNoWrapInsetSlack(opts)).toBe(opts);
    }
  });

  // margin index order follows PptxGenJS insets: [lIns, rIns, bIns, tIns]
  it('keeps the box geometry and takes slack from the right inset for left-aligned text', () => {
    const out = withNoWrapInsetSlack(box(), 'left');
    expect(out.w).toBe(1);
    expect(out.x).toBe(1);
    expect(out.margin).toEqual([6, 6 - 0.06 * 72, 6, 6]);
  });

  it('splits the slack across both horizontal insets for centered text', () => {
    const out = withNoWrapInsetSlack(box(), 'center');
    expect(out.margin[0]).toBeCloseTo(6 - (0.06 * 72) / 2);
    expect(out.margin[1]).toBeCloseTo(6 - (0.06 * 72) / 2);
    expect(out.margin[2]).toBe(6);
    expect(out.margin[3]).toBe(6);
  });

  it('takes slack from the left inset for right-aligned text and floors insets at 0', () => {
    const out = withNoWrapInsetSlack(box({ margin: [1, 6, 6, 6] }), 'right');
    expect(out.margin[0]).toBe(0);
    expect(out.margin[1]).toBe(6);
  });
});
