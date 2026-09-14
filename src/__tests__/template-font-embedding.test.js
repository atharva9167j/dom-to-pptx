// src/__tests__/template-font-embedding.test.js
//
// Tests for combining `template` with embedded fonts: exported slides must
// be able to inherit a real PowerPoint master/layout background AND embed
// custom fonts in the same export, with no fallback to system fonts.
//
// Font data itself is supplied as plain synthetic bytes (`new
// Uint8Array(...)`), never run through real fetch()/fontToEot()/opentype
// parsing — this mirrors the existing convention in font-embedder.test.js
// ("We push directly to embedder.fonts ... so we do not need real font
// buffers"). mergeFonts()/mergeTemplate() only care about (name, variant,
// data) as opaque values; the .fntdata conversion itself is fonteditor-core's
// concern and is exercised elsewhere (PPTXEmbedFonts.addFont), not here.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import JSZip from 'jszip';
import { exportToPptx } from '../index.js';
import { readTemplate, mergeTemplate } from '../template.js';
import { buildTemplateFixture } from './fixtures/build-template-fixture.js';

const P_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const FONT_REL_TYPE = `${R_NS}/font`;

function rect({ left = 0, top = 0, width, height }) {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function makeSlide(color) {
  const container = document.createElement('div');
  container.className = 'slide';
  container.getBoundingClientRect = () => rect({ left: 0, top: 0, width: 960, height: 540 });
  const box = document.createElement('div');
  box.style.backgroundColor = color;
  box.getBoundingClientRect = () => rect({ left: 40, top: 40, width: 200, height: 100 });
  container.appendChild(box);
  document.body.appendChild(container);
  return container;
}

async function parseXml(zip, path) {
  const str = await zip.file(path).async('string');
  return new DOMParser().parseFromString(str, 'text/xml');
}

function elementsByLocalName(doc, name) {
  return Array.from(doc.getElementsByTagName('*')).filter((n) => n.localName === name);
}

/** Builds a plain (no template, no fonts) generated PptxGenJS package to merge from — real DOM shapes, via the unmodified renderer. */
async function buildGeneratedZip(colors = ['#112233']) {
  const slides = colors.map(makeSlide);
  const blob = await exportToPptx(slides, { skipDownload: true });
  return JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
}

/** Loads the shared template fixture, then lets a caller override presentation-level parts to set up specific rId/embeddedFontLst/font-file scenarios. */
async function loadTemplateInfo({ presentationXml, presentationRelsXml, extraFontFiles } = {}) {
  const info = await readTemplate(await buildTemplateFixture());
  if (presentationXml) info.zip.file('ppt/presentation.xml', presentationXml);
  if (presentationRelsXml) info.zip.file('ppt/_rels/presentation.xml.rels', presentationRelsXml);
  for (const name of extraFontFiles || []) {
    info.zip.file(`ppt/fonts/${name}`, new Uint8Array([1, 2, 3, 4]));
  }
  return info;
}

function relationshipsXml(entries) {
  const rels = entries.map((e) => `<Relationship Id="${e.id}" Type="${e.type}" Target="${e.target}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${RELS_NS}">${rels}</Relationships>`;
}

function presentationXmlWith({ embeddedFontLstXml = '', extraAttrs = '' } = {}) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${R_NS}" xmlns:p="${P_NS}"${extraAttrs}>
<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
<p:sldIdLst/>
<p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst>
<p:sldSz cx="12192000" cy="6858000"/>
<p:notesSz cx="6858000" cy="12192000"/>
${embeddedFontLstXml}</p:presentation>`;
}

describe('template + font embedding', () => {
  beforeAll(() => {
    let fillStyle = '';
    HTMLCanvasElement.prototype.getContext = () => ({
      get fillStyle() {
        return fillStyle;
      },
      set fillStyle(val) {
        fillStyle = val;
      },
      clearRect: () => {},
      fillRect: () => {},
      getImageData: () => ({ data: [0, 0, 0, 0] }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('exportToPptx wiring (no more skip-and-warn)', () => {
    it('still fetches fonts when both `template` and custom fonts are requested (A regression + limitation removed)', async () => {
      const fetchMock = vi.fn(() => Promise.reject(new Error('network disabled in test')));
      vi.stubGlobal('fetch', fetchMock);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const slide = makeSlide('#334455');
      const templateBytes = await buildTemplateFixture();

      await exportToPptx(slide, {
        template: templateBytes,
        skipDownload: true,
        fonts: [{ name: 'Corporate Font', url: 'https://example.invalid/corporate-font.woff2' }],
      });

      // The old behavior skipped embedding entirely (and never fetched)
      // whenever `template` was set. It must now attempt to fetch just
      // like the no-template path always has.
      expect(fetchMock).toHaveBeenCalledWith('https://example.invalid/corporate-font.woff2');
      const warnedAboutUnsupported = warnSpy.mock.calls.some((args) =>
        String(args[0]).includes('not currently supported together with the `template` option')
      );
      expect(warnedAboutUnsupported).toBe(false);

      warnSpy.mockRestore();
    });

    it('still fetches fonts when no `template` is set (A regression)', async () => {
      const fetchMock = vi.fn(() => Promise.reject(new Error('network disabled in test')));
      vi.stubGlobal('fetch', fetchMock);
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const slide = makeSlide('#334455');
      await exportToPptx(slide, {
        skipDownload: true,
        fonts: [{ name: 'Some Font', url: 'https://example.invalid/some-font.woff2' }],
      });

      expect(fetchMock).toHaveBeenCalledWith('https://example.invalid/some-font.woff2');
    });
  });

  describe('mergeTemplate({ fontsToEmbed })', () => {
    it('embeds a single regular custom font alongside the inherited layout (B)', async () => {
      const templateInfo = await loadTemplateInfo();
      const generatedZip = await buildGeneratedZip();

      const blob = await mergeTemplate({
        templateInfo,
        generatedZip,
        slideAssignments: ['Content Light'],
        fontsToEmbed: [{ name: 'Corporate Font', variant: 'regular', data: new Uint8Array([9, 9, 9]) }],
      });
      const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));

      // Template/master/layout preserved.
      expect(zip.file('ppt/slideLayouts/slideLayout1.xml')).not.toBeNull();
      expect(zip.file('ppt/slideLayouts/slideLayout2.xml')).not.toBeNull();
      const slideRels = await parseXml(zip, 'ppt/slides/_rels/slide1.xml.rels');
      const layoutRel = elementsByLocalName(slideRels, 'Relationship').find((r) =>
        r.getAttribute('Type').endsWith('/slideLayout')
      );
      expect(layoutRel.getAttribute('Target')).toBe('../slideLayouts/slideLayout1.xml');

      // Font file present.
      const fontFiles = Object.keys(zip.files).filter((p) => /^ppt\/fonts\/font\d+\.fntdata$/.test(p));
      expect(fontFiles).toHaveLength(1);
      const fontBytes = await zip.file(fontFiles[0]).async('uint8array');
      expect(Array.from(fontBytes)).toEqual([9, 9, 9]);

      // embeddedFontLst present with a relationship that resolves to that file.
      const presDoc = await parseXml(zip, 'ppt/presentation.xml');
      const embedFonts = elementsByLocalName(presDoc, 'embeddedFont');
      expect(embedFonts).toHaveLength(1);
      const fontEl = elementsByLocalName(embedFonts[0], 'font')[0];
      expect(fontEl.getAttribute('typeface')).toBe('Corporate Font');
      const regularEl = elementsByLocalName(embedFonts[0], 'regular')[0];
      expect(regularEl).toBeTruthy();
      const rId = regularEl.getAttributeNS(R_NS, 'id');

      const presRelsDoc = await parseXml(zip, 'ppt/_rels/presentation.xml.rels');
      const fontRel = elementsByLocalName(presRelsDoc, 'Relationship').find((r) => r.getAttribute('Id') === rId);
      expect(fontRel).toBeTruthy();
      expect(fontRel.getAttribute('Type')).toBe(FONT_REL_TYPE);
      expect(fontRel.getAttribute('Target')).toBe(`fonts/${fontFiles[0].split('/').pop()}`);

      expect(presDoc.documentElement.getAttribute('saveSubsetFonts')).toBe('true');
      expect(presDoc.documentElement.getAttribute('embedTrueTypeFonts')).toBe('true');

      // Content type for .fntdata registered exactly once.
      const ctDoc = await parseXml(zip, '[Content_Types].xml');
      const fntdataDefaults = elementsByLocalName(ctDoc, 'Default').filter(
        (n) => n.getAttribute('Extension') === 'fntdata'
      );
      expect(fntdataDefaults).toHaveLength(1);
      expect(fntdataDefaults[0].getAttribute('ContentType')).toBe('application/x-fontdata');
    });

    it('embeds all four style slots with correct relationships (C)', async () => {
      const templateInfo = await loadTemplateInfo();
      const generatedZip = await buildGeneratedZip();

      const blob = await mergeTemplate({
        templateInfo,
        generatedZip,
        slideAssignments: ['Content Light'],
        // Deliberately out of schema order, to prove ordering isn't just insertion order.
        fontsToEmbed: [
          { name: 'Corporate Font', variant: 'boldItalic', data: new Uint8Array([4]) },
          { name: 'Corporate Font', variant: 'italic', data: new Uint8Array([3]) },
          { name: 'Corporate Font', variant: 'bold', data: new Uint8Array([2]) },
          { name: 'Corporate Font', variant: 'regular', data: new Uint8Array([1]) },
        ],
      });
      const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));

      const fontFiles = Object.keys(zip.files).filter((p) => /^ppt\/fonts\/font\d+\.fntdata$/.test(p));
      expect(fontFiles).toHaveLength(4);

      const presDoc = await parseXml(zip, 'ppt/presentation.xml');
      const embedFonts = elementsByLocalName(presDoc, 'embeddedFont');
      expect(embedFonts).toHaveLength(1);

      const children = Array.from(embedFonts[0].childNodes)
        .filter((n) => n.nodeType === 1)
        .map((n) => n.localName);
      expect(children).toEqual(['font', 'regular', 'bold', 'italic', 'boldItalic']);

      const presRelsDoc = await parseXml(zip, 'ppt/_rels/presentation.xml.rels');
      for (const variant of ['regular', 'bold', 'italic', 'boldItalic']) {
        const el = elementsByLocalName(embedFonts[0], variant)[0];
        const rId = el.getAttributeNS(R_NS, 'id');
        const rel = elementsByLocalName(presRelsDoc, 'Relationship').find((r) => r.getAttribute('Id') === rId);
        expect(rel, `relationship for ${variant}`).toBeTruthy();
        expect(rel.getAttribute('Type')).toBe(FONT_REL_TYPE);
      }
    });

    it('allocates font relationship IDs past the template highest existing rId, however high (D)', async () => {
      const existingRels = [
        { id: 'rId1', type: `${R_NS}/slideMaster`, target: 'slideMasters/slideMaster1.xml' },
        { id: 'rId2', type: `${R_NS}/notesMaster`, target: 'notesMasters/notesMaster1.xml' },
        ...Array.from({ length: 35 }, (_, i) => ({
          id: `rId${i + 3}`,
          type: `${R_NS}/hyperlink`,
          target: `https://example.invalid/${i}`,
        })),
      ]; // rId1..rId37
      const templateInfo = await loadTemplateInfo({
        presentationRelsXml: relationshipsXml(existingRels),
      });
      const generatedZip = await buildGeneratedZip();

      const blob = await mergeTemplate({
        templateInfo,
        generatedZip,
        slideAssignments: ['Content Light'],
        fontsToEmbed: [{ name: 'Corporate Font', variant: 'regular', data: new Uint8Array([1]) }],
      });
      const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));

      const presRelsDoc = await parseXml(zip, 'ppt/_rels/presentation.xml.rels');
      const rels = elementsByLocalName(presRelsDoc, 'Relationship');
      const ids = rels.map((r) => parseInt(r.getAttribute('Id').replace('rId', ''), 10));
      // No collisions: every ID unique, and the new slide/font relationships landed above 37.
      expect(new Set(ids).size).toBe(ids.length);
      const fontRel = rels.find((r) => r.getAttribute('Type') === FONT_REL_TYPE);
      expect(parseInt(fontRel.getAttribute('Id').replace('rId', ''), 10)).toBeGreaterThan(37);
    });

    it('does not overwrite existing ppt/fonts/*.fntdata files (E)', async () => {
      const existingFontNames = Array.from({ length: 6 }, (_, i) => `font${i + 1}.fntdata`);
      const templateInfo = await loadTemplateInfo({ extraFontFiles: existingFontNames });
      const generatedZip = await buildGeneratedZip();

      const beforeBytes = {};
      for (const name of existingFontNames) {
        beforeBytes[name] = await templateInfo.zip.file(`ppt/fonts/${name}`).async('uint8array');
      }

      const blob = await mergeTemplate({
        templateInfo,
        generatedZip,
        slideAssignments: ['Content Light'],
        fontsToEmbed: [{ name: 'Corporate Font', variant: 'regular', data: new Uint8Array([99, 99]) }],
      });
      const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));

      for (const name of existingFontNames) {
        const afterBytes = await zip.file(`ppt/fonts/${name}`).async('uint8array');
        expect(Array.from(afterBytes)).toEqual(Array.from(beforeBytes[name]));
      }
      // New font must land on a fresh, non-colliding number.
      expect(zip.file('ppt/fonts/font7.fntdata')).not.toBeNull();
      const newBytes = await zip.file('ppt/fonts/font7.fntdata').async('uint8array');
      expect(Array.from(newBytes)).toEqual([99, 99]);
    });

    it('appends a new font family to an existing embeddedFontLst without disturbing the existing one (F)', async () => {
      const templateInfo = await loadTemplateInfo({
        extraFontFiles: ['font1.fntdata'],
        presentationRelsXml: relationshipsXml([
          { id: 'rId1', type: `${R_NS}/slideMaster`, target: 'slideMasters/slideMaster1.xml' },
          { id: 'rId2', type: `${R_NS}/notesMaster`, target: 'notesMasters/notesMaster1.xml' },
          { id: 'rId50', type: FONT_REL_TYPE, target: 'fonts/font1.fntdata' },
        ]),
        presentationXml: presentationXmlWith({
          embeddedFontLstXml:
            '<p:embeddedFontLst><p:embeddedFont><p:font typeface="Existing Corp Font"/><p:regular r:id="rId50"/></p:embeddedFont></p:embeddedFontLst>',
        }),
      });
      const generatedZip = await buildGeneratedZip();

      const blob = await mergeTemplate({
        templateInfo,
        generatedZip,
        slideAssignments: ['Content Light'],
        fontsToEmbed: [{ name: 'New Corp Font', variant: 'regular', data: new Uint8Array([7]) }],
      });
      const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));

      const presDoc = await parseXml(zip, 'ppt/presentation.xml');
      const embedFonts = elementsByLocalName(presDoc, 'embeddedFont');
      expect(embedFonts).toHaveLength(2);

      const existing = embedFonts.find(
        (n) => elementsByLocalName(n, 'font')[0].getAttribute('typeface') === 'Existing Corp Font'
      );
      expect(existing).toBeTruthy();
      // Untouched: still points at the original rId50 / font1.fntdata.
      expect(elementsByLocalName(existing, 'regular')[0].getAttributeNS(R_NS, 'id')).toBe('rId50');

      const added = embedFonts.find(
        (n) => elementsByLocalName(n, 'font')[0].getAttribute('typeface') === 'New Corp Font'
      );
      expect(added).toBeTruthy();
      expect(elementsByLocalName(added, 'regular')).toHaveLength(1);

      // Original font file untouched.
      const originalBytes = await zip.file('ppt/fonts/font1.fntdata').async('uint8array');
      expect(Array.from(originalBytes)).toEqual([1, 2, 3, 4]);
    });

    it('does not duplicate an already-embedded (typeface, variant) (G)', async () => {
      const templateInfo = await loadTemplateInfo({
        extraFontFiles: ['font1.fntdata'],
        presentationRelsXml: relationshipsXml([
          { id: 'rId1', type: `${R_NS}/slideMaster`, target: 'slideMasters/slideMaster1.xml' },
          { id: 'rId2', type: `${R_NS}/notesMaster`, target: 'notesMasters/notesMaster1.xml' },
          { id: 'rId50', type: FONT_REL_TYPE, target: 'fonts/font1.fntdata' },
        ]),
        presentationXml: presentationXmlWith({
          embeddedFontLstXml:
            '<p:embeddedFontLst><p:embeddedFont><p:font typeface="Existing Corp Font"/><p:regular r:id="rId50"/></p:embeddedFont></p:embeddedFontLst>',
        }),
      });
      const generatedZip = await buildGeneratedZip();

      const blob = await mergeTemplate({
        templateInfo,
        generatedZip,
        slideAssignments: ['Content Light'],
        fontsToEmbed: [{ name: 'Existing Corp Font', variant: 'regular', data: new Uint8Array([255]) }],
      });
      const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));

      // No new font file — the request was a no-op dedup.
      const fontFiles = Object.keys(zip.files).filter((p) => /^ppt\/fonts\/font\d+\.fntdata$/.test(p));
      expect(fontFiles).toEqual(['ppt/fonts/font1.fntdata']);

      const presDoc = await parseXml(zip, 'ppt/presentation.xml');
      const embedFonts = elementsByLocalName(presDoc, 'embeddedFont');
      expect(embedFonts).toHaveLength(1);
      expect(elementsByLocalName(embedFonts[0], 'regular')).toHaveLength(1);
      expect(elementsByLocalName(embedFonts[0], 'regular')[0].getAttributeNS(R_NS, 'id')).toBe('rId50');

      // No stray new font-type relationship was added either.
      const presRelsDoc = await parseXml(zip, 'ppt/_rels/presentation.xml.rels');
      const fontRels = elementsByLocalName(presRelsDoc, 'Relationship').filter(
        (r) => r.getAttribute('Type') === FONT_REL_TYPE
      );
      expect(fontRels).toHaveLength(1);
    });

    it('combines a template master background, multi-variant embedded fonts, and DOM shapes across two slides, structurally valid throughout (H)', async () => {
      const templateInfo = await loadTemplateInfo();
      const generatedZip = await buildGeneratedZip(['#0F62FE', '#F1C21B']);

      const blob = await mergeTemplate({
        templateInfo,
        generatedZip,
        slideAssignments: ['Content Light', 'Section Dark'],
        fontsToEmbed: [
          { name: 'Corporate Font', variant: 'regular', data: new Uint8Array([1]) },
          { name: 'Corporate Font', variant: 'bold', data: new Uint8Array([2]) },
        ],
      });
      const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));

      // Every XML/rels part must be well-formed.
      for (const [path, file] of Object.entries(zip.files)) {
        if (file.dir || !(path.endsWith('.xml') || path.endsWith('.rels'))) continue;
        const str = await file.async('string');
        const doc = new DOMParser().parseFromString(str, 'text/xml');
        expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
      }

      // Master/layout backgrounds present and correctly wired per slide.
      const rels1 = await parseXml(zip, 'ppt/slides/_rels/slide1.xml.rels');
      expect(
        elementsByLocalName(rels1, 'Relationship')
          .find((r) => r.getAttribute('Type').endsWith('/slideLayout'))
          .getAttribute('Target')
      ).toBe('../slideLayouts/slideLayout1.xml');
      const rels2 = await parseXml(zip, 'ppt/slides/_rels/slide2.xml.rels');
      expect(
        elementsByLocalName(rels2, 'Relationship')
          .find((r) => r.getAttribute('Type').endsWith('/slideLayout'))
          .getAttribute('Target')
      ).toBe('../slideLayouts/slideLayout2.xml');

      // DOM shapes present.
      const slide1Xml = await zip.file('ppt/slides/slide1.xml').async('string');
      expect(slide1Xml).toContain('<p:sp>');

      // Both font variants embedded under one family, files present.
      const presDoc = await parseXml(zip, 'ppt/presentation.xml');
      const embedFonts = elementsByLocalName(presDoc, 'embeddedFont');
      expect(embedFonts).toHaveLength(1);
      expect(elementsByLocalName(embedFonts[0], 'regular')).toHaveLength(1);
      expect(elementsByLocalName(embedFonts[0], 'bold')).toHaveLength(1);
      const fontFiles = Object.keys(zip.files).filter((p) => /^ppt\/fonts\/font\d+\.fntdata$/.test(p));
      expect(fontFiles).toHaveLength(2);
    });
  });
});
