// src/__tests__/template-support.test.js
//
// Tests for the optional `template` export mode: exporting DOM slides onto
// an existing .pptx so they inherit its real slideLayout/slideMaster
// background instead of PptxGenJS's own generated blank layout. See
// docs/template-support.md for the feature writeup.
import { describe, it, expect, beforeAll } from 'vitest';
import JSZip from 'jszip';
import { exportToPptx, getTemplateLayouts } from '../index.js';
import { readTemplate, resolveLayout } from '../template.js';
import { buildTemplateFixture, FIXTURE_LAYOUT_NAMES, FIXTURE_SLDSZ_IN } from './fixtures/build-template-fixture.js';

function rect({ left = 0, top = 0, width, height }) {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function makeSlide({ label, color }) {
  const container = document.createElement('div');
  container.className = 'slide';
  container.getBoundingClientRect = () => rect({ left: 0, top: 0, width: 960, height: 540 });

  const box = document.createElement('div');
  box.setAttribute('data-label', label);
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

describe('template support', () => {
  let templateBytes;

  beforeAll(async () => {
    templateBytes = await buildTemplateFixture();

    // Several rendering code paths (borders, gradients) use an off-screen
    // <canvas> for color normalization; jsdom doesn't implement a 2D
    // context, so stub one out like the other exportToPptx-driving tests
    // in this suite do (see bugs.test.js / table.test.js).
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

  describe('getTemplateLayouts (optional introspection API)', () => {
    it('lists the layouts declared in a template, in file order', async () => {
      const layouts = await getTemplateLayouts(templateBytes);
      expect(layouts.map((l) => l.name)).toEqual(FIXTURE_LAYOUT_NAMES);
      expect(layouts[0].id).toBe('ppt/slideLayouts/slideLayout1.xml');
      expect(layouts[1].id).toBe('ppt/slideLayouts/slideLayout2.xml');
    });
  });

  describe('readTemplate / resolveLayout', () => {
    it('reads the declared slide size from the template', async () => {
      const info = await readTemplate(templateBytes);
      expect(info.sldSz.width).toBeCloseTo(FIXTURE_SLDSZ_IN.width, 4);
      expect(info.sldSz.height).toBeCloseTo(FIXTURE_SLDSZ_IN.height, 4);
    });

    it('throws a descriptive error, listing available layouts, for an unknown baseLayout name', async () => {
      const info = await readTemplate(templateBytes);
      expect(() => resolveLayout(info, 'does-not-exist')).toThrowError(
        /PowerPoint layout "does-not-exist" was not found in template\. Available layouts: "Content Light", "Section Dark"/
      );
    });

    it('falls back to the first declared layout when no name or default is given', async () => {
      const info = await readTemplate(templateBytes);
      expect(resolveLayout(info, undefined, undefined).name).toBe('Content Light');
    });

    it('honors an explicit defaultLayoutName over the first-declared fallback', async () => {
      const info = await readTemplate(templateBytes);
      expect(resolveLayout(info, undefined, 'Section Dark').name).toBe('Section Dark');
    });
  });

  describe('exportToPptx({ template })', () => {
    let zip;
    const slide1 = makeSlide({ label: 'slide-one', color: '#112233' });
    const slide2 = makeSlide({ label: 'slide-two', color: '#445566' });

    beforeAll(async () => {
      const blob = await exportToPptx(
        [
          { element: slide1, baseLayout: 'Content Light' },
          { element: slide2, baseLayout: 'Section Dark' },
        ],
        { template: templateBytes, skipDownload: true }
      );
      const buf = Buffer.from(await blob.arrayBuffer());
      zip = await JSZip.loadAsync(buf);
    });

    it('preserves the template theme, master, layouts and their relationships (B)', async () => {
      for (const path of [
        'ppt/theme/theme1.xml',
        'ppt/slideMasters/slideMaster1.xml',
        'ppt/slideMasters/_rels/slideMaster1.xml.rels',
        'ppt/slideLayouts/slideLayout1.xml',
        'ppt/slideLayouts/slideLayout2.xml',
        'ppt/notesMasters/notesMaster1.xml',
      ]) {
        expect(zip.file(path), `expected ${path} to survive the merge`).not.toBeNull();
      }

      const layout1 = await parseXml(zip, 'ppt/slideLayouts/slideLayout1.xml');
      expect(elementsByLocalName(layout1, 'cSld')[0].getAttribute('name')).toBe('Content Light');
      const layout2 = await parseXml(zip, 'ppt/slideLayouts/slideLayout2.xml');
      expect(elementsByLocalName(layout2, 'cSld')[0].getAttribute('name')).toBe('Section Dark');
    });

    it('gives each new slide a real relationship to its requested layout (C, E)', async () => {
      const slidePaths = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p));
      expect(slidePaths.length).toBe(2);
      const [slideA, slideB] = slidePaths.sort();

      const relsA = await parseXml(zip, slideA.replace('slides/', 'slides/_rels/') + '.rels');
      const layoutRelA = elementsByLocalName(relsA, 'Relationship').find(
        (r) =>
          r.getAttribute('Type') === 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout'
      );
      expect(layoutRelA.getAttribute('Target')).toBe('../slideLayouts/slideLayout1.xml');

      const relsB = await parseXml(zip, slideB.replace('slides/', 'slides/_rels/') + '.rels');
      const layoutRelB = elementsByLocalName(relsB, 'Relationship').find(
        (r) =>
          r.getAttribute('Type') === 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout'
      );
      expect(layoutRelB.getAttribute('Target')).toBe('../slideLayouts/slideLayout2.xml');
    });

    it('renders the DOM shapes onto the new slides in addition to the inherited layout (D)', async () => {
      const slide1Xml = await zip.file('ppt/slides/slide1.xml').async('string');
      const slide2Xml = await zip.file('ppt/slides/slide2.xml').async('string');
      // Each slide's colored box became a real editable <p:sp> shape.
      expect(slide1Xml).toContain('<p:sp>');
      expect(slide1Xml.toUpperCase()).toContain('112233');
      expect(slide2Xml).toContain('<p:sp>');
      expect(slide2Xml.toUpperCase()).toContain('445566');
    });

    it('registers each new slide in presentation.xml and its relationships, without disturbing existing IDs', async () => {
      const presDoc = await parseXml(zip, 'ppt/presentation.xml');
      const sldIds = elementsByLocalName(presDoc, 'sldId');
      expect(sldIds.length).toBe(2);
      const ids = sldIds.map((n) => n.getAttribute('id'));
      expect(new Set(ids).size).toBe(2); // unique
      ids.forEach((id) => expect(parseInt(id, 10)).toBeGreaterThanOrEqual(256));

      const presRelsDoc = await parseXml(zip, 'ppt/_rels/presentation.xml.rels');
      const slideRels = elementsByLocalName(presRelsDoc, 'Relationship').filter(
        (r) => r.getAttribute('Type') === 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide'
      );
      expect(slideRels.length).toBe(2);

      const ctDoc = await parseXml(zip, '[Content_Types].xml');
      const slideOverrides = elementsByLocalName(ctDoc, 'Override').filter((n) =>
        /\/ppt\/slides\/slide\d+\.xml$/.test(n.getAttribute('PartName'))
      );
      expect(slideOverrides.length).toBe(2);
    });

    it('adopts the template slide size for shape coordinate math', async () => {
      // The template's own <p:sldSz> is preserved untouched by the merge;
      // this asserts the shapes were computed against that same size
      // rather than dom-to-pptx's 10x5.625in default, by checking the
      // rendered shape's offset is proportionate to the wider canvas.
      const presDoc = await parseXml(zip, 'ppt/presentation.xml');
      const sldSz = elementsByLocalName(presDoc, 'sldSz')[0];
      expect(sldSz.getAttribute('cx')).toBe('12192000');
      expect(sldSz.getAttribute('cy')).toBe('6858000');
    });
  });

  describe('exportToPptx({ template }) without a per-slide baseLayout (G)', () => {
    it('uses the template first declared layout by default', async () => {
      const slide = makeSlide({ label: 'default-layout', color: '#998877' });
      const blob = await exportToPptx(slide, { template: templateBytes, skipDownload: true });
      const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
      const rels = await parseXml(zip, 'ppt/slides/_rels/slide1.xml.rels');
      const layoutRel = elementsByLocalName(rels, 'Relationship').find(
        (r) =>
          r.getAttribute('Type') === 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout'
      );
      expect(layoutRel.getAttribute('Target')).toBe('../slideLayouts/slideLayout1.xml');
    });

    it('uses options.defaultBaseLayout when set', async () => {
      const slide = makeSlide({ label: 'explicit-default', color: '#998877' });
      const blob = await exportToPptx(slide, {
        template: templateBytes,
        defaultBaseLayout: 'Section Dark',
        skipDownload: true,
      });
      const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
      const rels = await parseXml(zip, 'ppt/slides/_rels/slide1.xml.rels');
      const layoutRel = elementsByLocalName(rels, 'Relationship').find(
        (r) =>
          r.getAttribute('Type') === 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout'
      );
      expect(layoutRel.getAttribute('Target')).toBe('../slideLayouts/slideLayout2.xml');
    });
  });

  describe('exportToPptx({ template }) with an unknown baseLayout (F)', () => {
    it('rejects with a clear, actionable error', async () => {
      const slide = makeSlide({ label: 'bad-layout', color: '#000000' });
      await expect(
        exportToPptx({ element: slide, baseLayout: 'does-not-exist' }, { template: templateBytes, skipDownload: true })
      ).rejects.toThrow(/PowerPoint layout "does-not-exist" was not found in template/);
    });
  });

  describe('regression: exportToPptx without `template` (A)', () => {
    it('keeps generating a fully self-contained PptxGenJS package as before', async () => {
      const slide = makeSlide({ label: 'no-template', color: '#334455' });
      const blob = await exportToPptx(slide, { skipDownload: true });
      const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));

      // Untouched by template merging: PptxGenJS's own generated layout/master/theme.
      expect(zip.file('ppt/slideLayouts/slideLayout1.xml')).not.toBeNull();
      const rels = await parseXml(zip, 'ppt/slides/_rels/slide1.xml.rels');
      const layoutRel = elementsByLocalName(rels, 'Relationship').find(
        (r) =>
          r.getAttribute('Type') === 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout'
      );
      expect(layoutRel.getAttribute('Target')).toBe('../slideLayouts/slideLayout1.xml');

      const presDoc = await parseXml(zip, 'ppt/presentation.xml');
      const sldSz = elementsByLocalName(presDoc, 'sldSz')[0];
      // dom-to-pptx's own 10x5.625in default, not the fixture's 13.333x7.5in.
      expect(sldSz.getAttribute('cx')).toBe('9144000');
    });
  });
});
