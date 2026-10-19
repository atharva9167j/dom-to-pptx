// src/__tests__/cli-exporter.test.js
//
// Tests for bin/cli-exporter.js's slide-size handling.
//
// Copilot review (PR #67): with `--template` and no explicit `--width`/
// `--height`, the export adopts the template's own declared slide size
// (see docs/template-support.md, "Slide size") — but the CLI's dimension
// display/warning logic treated its own 10x5.625in *defaults* as if they
// were "requested", so it printed a misleading "Slide Dimensions: 10 x
// 5.625" before the export and then warned about a fabricated "mismatch"
// after it, purely because the template's real size differed from that
// default. resolveSlideSizeOptions()/computeSizeMismatch() (extracted from
// runExporter for direct testing) fix this by tracking which dimensions
// were *actually* requested (via `--width`/`--height`) separately from
// values that are merely defaults or adopted from the template.
//
// runExporter() itself is exercised with a controlled exporter stub
// (`deps.loadExporter`) and a captured `deps.exit`, so these tests never
// launch a real headless browser.
import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import {
  runExporter,
  resolveSlideSizeOptions,
  computeSizeMismatch,
  resolveTemplateSldSzInches,
  parseArgs,
} from '../../bin/cli-exporter-core.js';
import { buildTemplateFixture, FIXTURE_SLDSZ_IN } from './fixtures/build-template-fixture.js';

async function buildFakePptxBuffer(widthIn, heightIn) {
  const zip = new JSZip();
  const cx = Math.round(widthIn * 914400);
  const cy = Math.round(heightIn * 914400);
  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldSz cx="${cx}" cy="${cy}"/></p:presentation>`
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('resolveSlideSizeOptions', () => {
  it('treats width/height as defaults (not requested) when neither is given and no template is set', () => {
    const r = resolveSlideSizeOptions(parseArgs(['slides.html']));
    expect(r).toMatchObject({ slideWidth: 10, slideHeight: 5.625, explicitWidth: false, explicitHeight: false });
    expect(r.sizeFromTemplate).toBe(false); // no template at all — always the CLI's own default
    expect(r.forceExplicitSize).toBe(true); // unchanged existing behavior: no-template always forces width/height
  });

  it('marks the size as template-adopted when --template is given with no explicit width/height', () => {
    const r = resolveSlideSizeOptions(parseArgs(['slides.html', '--template', 'corp.pptx']));
    expect(r.sizeFromTemplate).toBe(true);
    expect(r.forceExplicitSize).toBe(false); // pptxOptions must NOT force a size — let the template's own size win
  });

  it('keeps the previously-supported "one explicit dimension" behavior: still forces both width and height', () => {
    const r = resolveSlideSizeOptions(parseArgs(['slides.html', '--template', 'corp.pptx', '--width', '8']));
    expect(r.explicitWidth).toBe(true);
    expect(r.explicitHeight).toBe(false);
    expect(r.slideWidth).toBe(8);
    expect(r.slideHeight).toBe(5.625); // falls back to the default, same as before this fix
    expect(r.sizeFromTemplate).toBe(false);
    expect(r.forceExplicitSize).toBe(true);
  });

  it('is not fooled by both dimensions being explicit alongside a template', () => {
    const r = resolveSlideSizeOptions(
      parseArgs(['slides.html', '--template', 'corp.pptx', '--width', '13.333', '--height', '7.5'])
    );
    expect(r.sizeFromTemplate).toBe(false);
    expect(r.forceExplicitSize).toBe(true);
  });
});

describe('computeSizeMismatch', () => {
  it('never flags a dimension that was not explicitly requested', () => {
    const result = computeSizeMismatch({
      explicitWidth: false,
      explicitHeight: false,
      slideWidth: 10,
      slideHeight: 5.625,
      effectiveWidth: 13.333333,
      effectiveHeight: 7.5,
    });
    expect(result.hasMismatch).toBe(false);
  });

  it('flags a mismatch only for the explicitly requested dimension(s)', () => {
    const widthOnly = computeSizeMismatch({
      explicitWidth: true,
      explicitHeight: false,
      slideWidth: 10,
      slideHeight: 5.625,
      effectiveWidth: 12,
      effectiveHeight: 5.625,
    });
    expect(widthOnly).toMatchObject({ widthMismatch: true, heightMismatch: false, hasMismatch: true });
  });

  it('does not flag a mismatch when the explicitly requested size matches exactly', () => {
    const result = computeSizeMismatch({
      explicitWidth: true,
      explicitHeight: true,
      slideWidth: 13.333333,
      slideHeight: 7.5,
      effectiveWidth: 13.333333,
      effectiveHeight: 7.5,
    });
    expect(result.hasMismatch).toBe(false);
  });
});

// Maintainer review (PR #67, atharva9167j, 2026-10-02): sizeFromTemplate
// correctly stopped the 10x5.625in defaults from overriding the *exported
// PPTX's* coordinate space, but the headless-browser *viewport* was still
// sized from those same defaults before the template was ever inspected —
// for a non-16:9 template, Puppeteer would render the page at the wrong
// aspect ratio. resolveTemplateSldSzInches() resolves the template's real
// size up front (Node-side, via JSZip — no DOMParser/browser needed here).
describe('resolveTemplateSldSzInches (maintainer review, 2026-10-02: template-aware CLI viewport)', () => {
  let tmpDir;
  let templatePath;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dom-to-pptx-cli-template-test-'));
    templatePath = path.join(tmpDir, 'corp-template.pptx');
    fs.writeFileSync(templatePath, await buildTemplateFixture());
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads the real declared slide size from a local template file', async () => {
    const size = await resolveTemplateSldSzInches(templatePath);
    expect(size).not.toBeNull();
    expect(size.width).toBeCloseTo(FIXTURE_SLDSZ_IN.width, 4);
    expect(size.height).toBeCloseTo(FIXTURE_SLDSZ_IN.height, 4);
  });

  it('returns null for a URL rather than trying to read it as a local path', async () => {
    expect(await resolveTemplateSldSzInches('https://example.invalid/corp.pptx')).toBeNull();
  });

  it('returns null (rather than throwing) for a nonexistent local path', async () => {
    expect(await resolveTemplateSldSzInches(path.join(tmpDir, 'does-not-exist.pptx'))).toBeNull();
  });

  it('returns null (rather than throwing) for a path that is not a valid .pptx/zip', async () => {
    const badPath = path.join(tmpDir, 'not-a-pptx.pptx');
    fs.writeFileSync(badPath, 'this is not a zip file');
    expect(await resolveTemplateSldSzInches(badPath)).toBeNull();
  });
});

describe('runExporter (stubbed exporter, no real browser)', () => {
  let tmpDir;
  let htmlPath;
  let logSpy;
  let warnSpy;

  function setup() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dom-to-pptx-cli-test-'));
    htmlPath = path.join(tmpDir, 'slides.html');
    fs.writeFileSync(htmlPath, '<!doctype html><div class="slide"></div>');
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  }

  afterEach(() => {
    vi.restoreAllMocks();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function allLoggedText(spy) {
    return spy.mock.calls.map((args) => args.join(' ')).join('\n');
  }

  it('template with a non-default size and no size options produces no false mismatch warning', async () => {
    setup();
    const stubExporter = vi.fn(async () => buildFakePptxBuffer(13.333333, 7.5));
    const exit = vi.fn();

    await runExporter([htmlPath, '--template', 'corp.pptx'], { loadExporter: async () => stubExporter, exit });

    expect(stubExporter).toHaveBeenCalledTimes(1);
    const [, exporterOptions] = stubExporter.mock.calls[0];
    // No width/height forced — the template's own size must be allowed to win.
    expect(exporterOptions.pptxOptions.width).toBeUndefined();
    expect(exporterOptions.pptxOptions.height).toBeUndefined();

    expect(allLoggedText(logSpy)).toContain('adopted from --template');
    expect(allLoggedText(warnSpy)).not.toContain('differ from');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('matching explicit dimensions produce no warning', async () => {
    setup();
    const stubExporter = vi.fn(async () => buildFakePptxBuffer(13.333333, 7.5));
    const exit = vi.fn();

    await runExporter([htmlPath, '--template', 'corp.pptx', '--width', '13.333333', '--height', '7.5'], {
      loadExporter: async () => stubExporter,
      exit,
    });

    expect(allLoggedText(warnSpy)).not.toContain('differ from');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('deviating explicit dimensions produce a warning', async () => {
    setup();
    const stubExporter = vi.fn(async () => buildFakePptxBuffer(13.333333, 7.5));
    const exit = vi.fn();

    await runExporter([htmlPath, '--template', 'corp.pptx', '--width', '10', '--height', '5.625'], {
      loadExporter: async () => stubExporter,
      exit,
    });

    expect(allLoggedText(warnSpy)).toContain('differ from');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('keeps the previously-supported behavior for a single explicit dimension consistent', async () => {
    setup();
    // Only --width is explicit; height falls back to the 5.625in default,
    // which (per existing behavior) is still forced into pptxOptions rather
    // than adopted from the template — so the stub must return exactly
    // that forced size for there to be no mismatch.
    const stubExporter = vi.fn(async () => buildFakePptxBuffer(8, 5.625));
    const exit = vi.fn();

    await runExporter([htmlPath, '--template', 'corp.pptx', '--width', '8'], {
      loadExporter: async () => stubExporter,
      exit,
    });

    const [, exporterOptions] = stubExporter.mock.calls[0];
    expect(exporterOptions.pptxOptions.width).toBe(8);
    expect(exporterOptions.pptxOptions.height).toBe(5.625);
    expect(allLoggedText(warnSpy)).not.toContain('differ from');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('sizes the headless-browser viewport from the template’s real declared size, not the 1920x1080 default', async () => {
    setup();
    const templatePath = path.join(tmpDir, 'corp-template.pptx');
    fs.writeFileSync(templatePath, await buildTemplateFixture());
    const stubExporter = vi.fn(async () => buildFakePptxBuffer(FIXTURE_SLDSZ_IN.width, FIXTURE_SLDSZ_IN.height));
    const exit = vi.fn();

    await runExporter([htmlPath, '--template', templatePath], { loadExporter: async () => stubExporter, exit });

    const [, exporterOptions] = stubExporter.mock.calls[0];
    expect(exporterOptions.browserWidth).toBe(Math.round(FIXTURE_SLDSZ_IN.width * 192));
    expect(exporterOptions.browserHeight).toBe(Math.round(FIXTURE_SLDSZ_IN.height * 192));
    // Sanity: the fixture's aspect ratio actually differs from the 10x5.625in default (1920x1080).
    expect(exporterOptions.browserWidth).not.toBe(1920);
    expect(exporterOptions.browserHeight).not.toBe(1080);

    // The pre-export display now shows the real resolved size rather than the vague placeholder.
    expect(allLoggedText(logSpy)).toContain('from --template');
    expect(allLoggedText(warnSpy)).not.toContain('differ from');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('still honors an explicit --browser-width/--browser-height over the resolved template size', async () => {
    setup();
    const templatePath = path.join(tmpDir, 'corp-template.pptx');
    fs.writeFileSync(templatePath, await buildTemplateFixture());
    const stubExporter = vi.fn(async () => buildFakePptxBuffer(FIXTURE_SLDSZ_IN.width, FIXTURE_SLDSZ_IN.height));
    const exit = vi.fn();

    await runExporter([htmlPath, '--template', templatePath, '--browser-width', '1280', '--browser-height', '800'], {
      loadExporter: async () => stubExporter,
      exit,
    });

    const [, exporterOptions] = stubExporter.mock.calls[0];
    expect(exporterOptions.browserWidth).toBe(1280);
    expect(exporterOptions.browserHeight).toBe(800);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('export without a template behaves as before (defaults forced, no warning)', async () => {
    setup();
    const stubExporter = vi.fn(async () => buildFakePptxBuffer(10, 5.625));
    const exit = vi.fn();

    await runExporter([htmlPath], { loadExporter: async () => stubExporter, exit });

    const [, exporterOptions] = stubExporter.mock.calls[0];
    expect(exporterOptions.pptxOptions.width).toBe(10);
    expect(exporterOptions.pptxOptions.height).toBe(5.625);
    expect(allLoggedText(warnSpy)).not.toContain('differ from');
    expect(allLoggedText(logSpy)).not.toContain('adopted from --template');
    expect(exit).toHaveBeenCalledWith(0);
  });
});
