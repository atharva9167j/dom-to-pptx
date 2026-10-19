// src/__tests__/template-support.test.js
//
// Tests for the optional `template` export mode: exporting DOM slides onto
// an existing .pptx so they inherit its real slideLayout/slideMaster
// background instead of PptxGenJS's own generated blank layout. See
// docs/template-support.md for the feature writeup.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import JSZip from 'jszip';
import { exportToPptx, getTemplateLayouts } from '../index.js';
import { readTemplate, resolveLayout, mergeTemplate } from '../template.js';
import {
  buildTemplateFixture,
  buildTemplateFixtureWithExistingContent,
  EXISTING_CONTENT,
  FIXTURE_LAYOUT_NAMES,
  FIXTURE_SLDSZ_IN,
} from './fixtures/build-template-fixture.js';

function rect({ left = 0, top = 0, width, height }) {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function makeSlide({ label, color, notes }) {
  const container = document.createElement('div');
  container.className = 'slide';
  container.getBoundingClientRect = () => rect({ left: 0, top: 0, width: 960, height: 540 });

  const box = document.createElement('div');
  box.setAttribute('data-label', label);
  box.style.backgroundColor = color;
  box.getBoundingClientRect = () => rect({ left: 40, top: 40, width: 200, height: 100 });
  container.appendChild(box);

  if (notes) {
    const notesEl = document.createElement('div');
    notesEl.setAttribute('data-pptx-notes', '');
    notesEl.hidden = true;
    notesEl.textContent = notes;
    container.appendChild(notesEl);
  }

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

  // Copilot review (PR #67): the documented "first declared layout" default
  // must come from presentation.xml -> slide master(s) -> <p:sldLayoutIdLst>
  // declaration order, resolved through the real relationships, never from
  // slideLayoutN.xml file numbering (which real PowerPoint templates don't
  // guarantee lines up with declaration order at all).
  describe('layout resolution follows declared relationships, not slideLayoutN.xml file numbering', () => {
    it('honors <sldLayoutIdLst> declaration order within a single master even when it contradicts file numbering', async () => {
      const zip = await JSZip.loadAsync(await buildTemplateFixture());
      const masterXml = await zip.file('ppt/slideMasters/slideMaster1.xml').async('string');
      // slideLayout1.xml ("Content Light") is declared file-numerically first,
      // but we flip <sldLayoutIdLst> so slideLayout2.xml ("Section Dark") is
      // the one actually declared first.
      const reordered = masterXml.replace(
        '<p:sldLayoutId id="2147483649" r:id="rId1"/>\n<p:sldLayoutId id="2147483650" r:id="rId2"/>',
        '<p:sldLayoutId id="2147483650" r:id="rId2"/>\n<p:sldLayoutId id="2147483649" r:id="rId1"/>'
      );
      expect(reordered, 'sanity: the replacement above must have matched').not.toBe(masterXml);
      zip.file('ppt/slideMasters/slideMaster1.xml', reordered);
      const bytes = await zip.generateAsync({ type: 'uint8array' });

      const layouts = await getTemplateLayouts(bytes);
      expect(layouts.map((l) => l.name)).toEqual(['Section Dark', 'Content Light']);

      const info = await readTemplate(bytes);
      expect(resolveLayout(info, undefined, undefined).name).toBe('Section Dark');
    });

    it('orders layouts across multiple slide masters by <sldMasterIdLst> declaration, not slideMasterN.xml file numbering', async () => {
      const zip = await JSZip.loadAsync(await buildTemplateFixture());
      const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

      const SLIDE_MASTER_2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${R_NS}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
<p:sldLayoutIdLst><p:sldLayoutId id="2147483700" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`;
      const SLIDE_MASTER_2_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${R_NS}/slideLayout" Target="../slideLayouts/slideLayout3.xml"/>
</Relationships>`;
      // Numerically the *last* layout file, but it's the only layout on the
      // slide master that will be declared *first* in presentation.xml.
      const SLIDE_LAYOUT_3 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${R_NS}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
<p:cSld name="Second Master Layout"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
</p:sldLayout>`;
      const SLIDE_LAYOUT_3_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${R_NS}/slideMaster" Target="../slideMasters/slideMaster2.xml"/>
</Relationships>`;

      zip.file('ppt/slideMasters/slideMaster2.xml', SLIDE_MASTER_2);
      zip.file('ppt/slideMasters/_rels/slideMaster2.xml.rels', SLIDE_MASTER_2_RELS);
      zip.file('ppt/slideLayouts/slideLayout3.xml', SLIDE_LAYOUT_3);
      zip.file('ppt/slideLayouts/_rels/slideLayout3.xml.rels', SLIDE_LAYOUT_3_RELS);

      const presentationXml = await zip.file('ppt/presentation.xml').async('string');
      const updatedPresentation = presentationXml.replace(
        '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>',
        '<p:sldMasterIdLst><p:sldMasterId id="2147483701" r:id="rId7"/><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
      );
      expect(updatedPresentation).not.toBe(presentationXml);
      zip.file('ppt/presentation.xml', updatedPresentation);

      const presRels = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
      const updatedPresRels = presRels.replace(
        '</Relationships>',
        `<Relationship Id="rId7" Type="${R_NS}/slideMaster" Target="slideMasters/slideMaster2.xml"/></Relationships>`
      );
      zip.file('ppt/_rels/presentation.xml.rels', updatedPresRels);

      const bytes = await zip.generateAsync({ type: 'uint8array' });

      const layouts = await getTemplateLayouts(bytes);
      expect(layouts.map((l) => l.name)).toEqual(['Second Master Layout', 'Content Light', 'Section Dark']);

      const info = await readTemplate(bytes);
      expect(resolveLayout(info, undefined, undefined).name).toBe('Second Master Layout');
    });

    it('ignores an orphaned slideLayoutN.xml file that no slide master links to, however low its number', async () => {
      const zip = await JSZip.loadAsync(await buildTemplateFixture());
      const orphan = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
<p:cSld name="Orphan Layout"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
</p:sldLayout>`;
      // slideLayout0.xml would sort before slideLayout1/2.xml under a
      // file-number-based fallback, but nothing in any master's
      // <sldLayoutIdLst>/rels links to it, so it must never be selectable.
      zip.file('ppt/slideLayouts/slideLayout0.xml', orphan);
      const bytes = await zip.generateAsync({ type: 'uint8array' });

      const layouts = await getTemplateLayouts(bytes);
      expect(layouts.map((l) => l.name)).toEqual(FIXTURE_LAYOUT_NAMES);

      const info = await readTemplate(bytes);
      expect(resolveLayout(info, undefined, undefined).name).toBe('Content Light');
    });

    it('resolves a duplicate layout name to the first *declared* match, not the numerically-first file', async () => {
      const zip = await JSZip.loadAsync(await buildTemplateFixture());

      // Give slideLayout2.xml the same name as slideLayout1.xml...
      let layout2Xml = await zip.file('ppt/slideLayouts/slideLayout2.xml').async('string');
      layout2Xml = layout2Xml.replace('name="Section Dark"', 'name="Content Light"');
      expect(layout2Xml).toContain('name="Content Light"');
      zip.file('ppt/slideLayouts/slideLayout2.xml', layout2Xml);

      // ...and flip declaration order so the numerically-*second* file
      // (slideLayout2.xml) is the one declared *first*.
      const masterXml = await zip.file('ppt/slideMasters/slideMaster1.xml').async('string');
      const reordered = masterXml.replace(
        '<p:sldLayoutId id="2147483649" r:id="rId1"/>\n<p:sldLayoutId id="2147483650" r:id="rId2"/>',
        '<p:sldLayoutId id="2147483650" r:id="rId2"/>\n<p:sldLayoutId id="2147483649" r:id="rId1"/>'
      );
      zip.file('ppt/slideMasters/slideMaster1.xml', reordered);
      const bytes = await zip.generateAsync({ type: 'uint8array' });

      const info = await readTemplate(bytes);
      expect(info.layouts.map((l) => l.id)).toEqual([
        'ppt/slideLayouts/slideLayout2.xml',
        'ppt/slideLayouts/slideLayout1.xml',
      ]);
      // Both layouts are named "Content Light"; the declared-first one
      // (slideLayout2.xml here) must win deterministically.
      expect(resolveLayout(info, 'Content Light', undefined).id).toBe('ppt/slideLayouts/slideLayout2.xml');
    });

    it('throws a descriptive, diagnosable error when a declared slide layout relationship cannot be resolved', async () => {
      const zip = await JSZip.loadAsync(await buildTemplateFixture());
      const masterRels = await zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels').async('string');
      const broken = masterRels.replace(/<Relationship Id="rId2"[^>]*\/>/, '');
      expect(broken, 'sanity: the rId2 relationship must have been removed').not.toBe(masterRels);
      zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', broken);
      const bytes = await zip.generateAsync({ type: 'uint8array' });

      await expect(readTemplate(bytes)).rejects.toThrow(/slide layout relationship "rId2"/);
    });
  });

  // Copilot review (PR #67): the notes master a merged notes slide links to
  // must be the one presentation.xml actually declares (via
  // <p:notesMasterIdLst> + ppt/_rels/presentation.xml.rels), not simply the
  // numerically-first notesMasterN.xml file in the package.
  describe('notes master resolution follows the declared relationship, not file numbering', () => {
    it('links new notes slides to the declared notesMaster, ignoring an orphaned lower-numbered file', async () => {
      const zip = await JSZip.loadAsync(await buildTemplateFixture());
      const notesMasterXml = await zip.file('ppt/notesMasters/notesMaster1.xml').async('string');
      const notesMasterRels = await zip.file('ppt/notesMasters/_rels/notesMaster1.xml.rels').async('string');
      // notesMaster1.xml stays in the package but becomes orphaned: the
      // presentation is repointed at a higher-numbered notesMaster7.xml.
      zip.file('ppt/notesMasters/notesMaster7.xml', notesMasterXml);
      zip.file('ppt/notesMasters/_rels/notesMaster7.xml.rels', notesMasterRels);

      const presRels = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
      const updatedPresRels = presRels.replace(
        'Target="notesMasters/notesMaster1.xml"',
        'Target="notesMasters/notesMaster7.xml"'
      );
      expect(updatedPresRels, 'sanity: the notesMaster relationship target must have changed').not.toBe(presRels);
      zip.file('ppt/_rels/presentation.xml.rels', updatedPresRels);
      const bytes = await zip.generateAsync({ type: 'uint8array' });

      const info = await readTemplate(bytes);
      expect(info.notesMasterId).toBe('ppt/notesMasters/notesMaster7.xml');

      const slide = makeSlide({ label: 'notes-declared', color: '#221100', notes: 'Speaker notes for slide one.' });
      const blob = await exportToPptx(
        { element: slide, baseLayout: 'Content Light' },
        {
          template: bytes,
          skipDownload: true,
        }
      );
      const outZip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));

      const notesSlideRelsPath = Object.keys(outZip.files).find((p) =>
        /^ppt\/notesSlides\/_rels\/notesSlide\d+\.xml\.rels$/.test(p)
      );
      expect(notesSlideRelsPath).toBeTruthy();
      const notesRelsDoc = await parseXml(outZip, notesSlideRelsPath);
      const notesMasterRel = elementsByLocalName(notesRelsDoc, 'Relationship').find((r) =>
        r.getAttribute('Type').endsWith('/notesMaster')
      );
      expect(notesMasterRel.getAttribute('Target')).toBe('../notesMasters/notesMaster7.xml');
    });

    it('throws a descriptive, diagnosable error when the declared notes master relationship cannot be resolved', async () => {
      const zip = await JSZip.loadAsync(await buildTemplateFixture());
      const presRels = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
      const broken = presRels.replace(/<Relationship Id="rId2"[^>]*\/>/, '');
      expect(broken, 'sanity: the rId2 (notesMaster) relationship must have been removed').not.toBe(presRels);
      zip.file('ppt/_rels/presentation.xml.rels', broken);
      const bytes = await zip.generateAsync({ type: 'uint8array' });

      await expect(readTemplate(bytes)).rejects.toThrow(/notes master relationship "rId2"/);
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

  // Copilot review (PR #67): the preservation promise ("existing template
  // content survives the merge") was previously exercised only against a
  // template with no pre-existing slides at all, which can't actually prove
  // preservation. This uses a template that already has a real content
  // slide + notes page + image + deliberately high/gapped ids (see
  // buildTemplateFixtureWithExistingContent) and checks the produced ZIP
  // part-by-part: unchanged parts compared by their unpacked bytes, added
  // parts compared by structure. A whole-zip byte comparison is unsuitable
  // here because DEFLATE output and zip metadata legitimately differ
  // between runs even when the semantic content doesn't.
  describe('preserves pre-existing template content (existing slide, notes, media, high/gapped ids)', () => {
    let sourceZip; // the untouched fixture, loaded once, to diff produced output against
    let outZip;

    beforeAll(async () => {
      const fixtureBytes = await buildTemplateFixtureWithExistingContent();
      sourceZip = await JSZip.loadAsync(fixtureBytes);

      const slide1 = makeSlide({ label: 'new-one', color: '#0a0b0c', notes: 'Notes for the first new slide.' });
      const slide2 = makeSlide({ label: 'new-two', color: '#0d0e0f', notes: 'Notes for the second new slide.' });
      const blob = await exportToPptx(
        [
          { element: slide1, baseLayout: 'Content Light' },
          { element: slide2, baseLayout: 'Section Dark' },
        ],
        { template: fixtureBytes, skipDownload: true }
      );
      outZip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
    });

    async function expectByteIdenticalPart(path) {
      const before = await sourceZip.file(path).async('uint8array');
      const after = await outZip.file(path).async('uint8array');
      expect(after, `expected ${path} to survive the merge untouched`).not.toBeNull();
      expect(Array.from(after)).toEqual(Array.from(before));
    }

    it('leaves the existing slide, its notes, its image, and the master/theme/layouts byte-identical', async () => {
      await expectByteIdenticalPart('ppt/theme/theme1.xml');
      await expectByteIdenticalPart('ppt/slideMasters/slideMaster1.xml');
      await expectByteIdenticalPart('ppt/slideMasters/_rels/slideMaster1.xml.rels');
      await expectByteIdenticalPart('ppt/slideLayouts/slideLayout1.xml');
      await expectByteIdenticalPart('ppt/slideLayouts/slideLayout2.xml');
      await expectByteIdenticalPart('ppt/notesMasters/notesMaster1.xml');
      await expectByteIdenticalPart(EXISTING_CONTENT.slidePath);
      await expectByteIdenticalPart(EXISTING_CONTENT.slideRelsPath);
      await expectByteIdenticalPart(EXISTING_CONTENT.notesSlidePath);
      await expectByteIdenticalPart(EXISTING_CONTENT.notesSlideRelsPath);
      await expectByteIdenticalPart(EXISTING_CONTENT.imagePath);
    });

    it('keeps the existing slide first and appends new slides after it, with no id/part-name collisions', async () => {
      const presDoc = await parseXml(outZip, 'ppt/presentation.xml');
      const sldIds = elementsByLocalName(presDoc, 'sldId');
      expect(sldIds).toHaveLength(3);
      expect(sldIds[0].getAttribute('id')).toBe(EXISTING_CONTENT.slideId); // existing slide stayed first
      expect(
        sldIds[0].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
      ).toBe(EXISTING_CONTENT.presentationRelId);
      const newIds = [sldIds[1], sldIds[2]].map((n) => parseInt(n.getAttribute('id'), 10));
      expect(new Set([...newIds, parseInt(EXISTING_CONTENT.slideId, 10)]).size).toBe(3); // all unique
      newIds.forEach((id) => expect(id).toBeGreaterThan(parseInt(EXISTING_CONTENT.slideId, 10)));

      // New slide/notes part names must land past the existing gapped numbers
      // (slide5.xml / notesSlide8.xml), not collide with or precede them.
      expect(outZip.file('ppt/slides/slide6.xml')).not.toBeNull();
      expect(outZip.file('ppt/slides/slide7.xml')).not.toBeNull();
      expect(outZip.file('ppt/notesSlides/notesSlide9.xml')).not.toBeNull();
      expect(outZip.file('ppt/notesSlides/notesSlide10.xml')).not.toBeNull();

      // New presentation-level relationship ids must land past the existing
      // high rId20, not reuse/collide with it.
      const presRelsDoc = await parseXml(outZip, 'ppt/_rels/presentation.xml.rels');
      const relIds = elementsByLocalName(presRelsDoc, 'Relationship').map((r) =>
        parseInt(r.getAttribute('Id').replace('rId', ''), 10)
      );
      expect(new Set(relIds).size).toBe(relIds.length); // no collisions at all
      const newSlideRelIds = relIds.filter((n) => n > 20);
      expect(newSlideRelIds.length).toBeGreaterThanOrEqual(2);
    });

    it('wires each new slide to its requested layout and each new notes page to its own new slide', async () => {
      const relsA = await parseXml(outZip, 'ppt/slides/_rels/slide6.xml.rels');
      expect(
        elementsByLocalName(relsA, 'Relationship')
          .find((r) => r.getAttribute('Type').endsWith('/slideLayout'))
          .getAttribute('Target')
      ).toBe('../slideLayouts/slideLayout1.xml'); // Content Light

      const relsB = await parseXml(outZip, 'ppt/slides/_rels/slide7.xml.rels');
      expect(
        elementsByLocalName(relsB, 'Relationship')
          .find((r) => r.getAttribute('Type').endsWith('/slideLayout'))
          .getAttribute('Target')
      ).toBe('../slideLayouts/slideLayout2.xml'); // Section Dark

      const notesRelsA = await parseXml(outZip, 'ppt/notesSlides/_rels/notesSlide9.xml.rels');
      expect(
        elementsByLocalName(notesRelsA, 'Relationship')
          .find((r) => r.getAttribute('Type').endsWith('/slide'))
          .getAttribute('Target')
      ).toBe('../slides/slide6.xml'); // points at its OWN new slide, not the pre-existing slide5
      expect(
        elementsByLocalName(notesRelsA, 'Relationship')
          .find((r) => r.getAttribute('Type').endsWith('/notesMaster'))
          .getAttribute('Target')
      ).toBe('../notesMasters/notesMaster1.xml');
    });

    it('adds Content_Types overrides for the new parts while keeping the existing ones for the pre-existing slide/notes', async () => {
      const ctDoc = await parseXml(outZip, '[Content_Types].xml');
      const overrides = elementsByLocalName(ctDoc, 'Override').map((n) => n.getAttribute('PartName'));
      expect(overrides).toContain(`/${EXISTING_CONTENT.slidePath}`);
      expect(overrides).toContain(`/${EXISTING_CONTENT.notesSlidePath}`);
      expect(overrides).toContain('/ppt/slides/slide6.xml');
      expect(overrides).toContain('/ppt/slides/slide7.xml');
      expect(overrides).toContain('/ppt/notesSlides/notesSlide9.xml');
      expect(overrides).toContain('/ppt/notesSlides/notesSlide10.xml');
    });
  });

  // Companion to the byte-identical-preservation suite above: exercises
  // mergeTemplate's media-copying path in isolation (no real DOM rendering
  // needed for the image), against a template whose media folder already
  // has a high-numbered existing image (image9.png, from
  // buildTemplateFixtureWithExistingContent).
  describe('mergeTemplate copies a new slide image without colliding with existing template media', () => {
    it('numbers the new image past the template highest existing ppt/media/imageN, and preserves the old one', async () => {
      const templateInfo = await readTemplate(await buildTemplateFixtureWithExistingContent());

      const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
      const generatedZip = new JSZip();
      generatedZip.file(
        '[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>`
      );
      generatedZip.file(
        'ppt/slides/slide1.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${R_NS}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:pic><p:nvPicPr><p:cNvPr id="2" name="Picture"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr/></p:pic></p:spTree></p:cSld></p:sld>`
      );
      generatedZip.file(
        'ppt/slides/_rels/slide1.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R_NS}/slideLayout" Target="../slideLayouts/slideLayoutPLACEHOLDER.xml"/><Relationship Id="rId2" Type="${R_NS}/image" Target="../media/image1.png"/></Relationships>`
      );
      generatedZip.file('ppt/media/image1.png', new Uint8Array([1, 2, 3, 4, 5]));

      const blob = await mergeTemplate({
        templateInfo,
        generatedZip,
        slideAssignments: ['Content Light'],
      });
      const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));

      // New image landed past the template's existing image9.png.
      expect(zip.file('ppt/media/image10.png')).not.toBeNull();
      const newImageBytes = await zip.file('ppt/media/image10.png').async('uint8array');
      expect(Array.from(newImageBytes)).toEqual([1, 2, 3, 4, 5]);

      // Existing template image preserved untouched.
      const oldImageBytes = await zip.file(EXISTING_CONTENT.imagePath).async('uint8array');
      expect(oldImageBytes.length).toBeGreaterThan(0);

      // The new slide's image relationship was rewritten to point at the new path.
      const newSlideRels = await parseXml(zip, 'ppt/slides/_rels/slide6.xml.rels');
      const imageRel = elementsByLocalName(newSlideRels, 'Relationship').find((r) =>
        r.getAttribute('Type').endsWith('/image')
      );
      expect(imageRel.getAttribute('Target')).toBe('../media/image10.png');
    });
  });

  // Combined integration check (PR #67, review point 9): everything this PR
  // touches exercised together in one merge — a template that already has
  // real content, two new slides on two different layouts, each with its
  // own notes page, one new slide with its own new image, and embedded
  // fonts (same synthetic-bytes strategy already used throughout
  // template-font-embedding.test.js — no real fetch/font parsing needed to
  // exercise mergeTemplate's OOXML surgery).
  describe('combined: existing content + multiple layouts + notes + images + fonts in one merge', () => {
    it('produces a structurally valid package with every new part correctly wired and all existing content preserved', async () => {
      const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
      const templateInfo = await readTemplate(await buildTemplateFixtureWithExistingContent());

      const generatedZip = new JSZip();
      generatedZip.file(
        '[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>`
      );
      // Slide 1: a shape + an image (on "Content Light") + its own notes page.
      generatedZip.file(
        'ppt/slides/slide1.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${R_NS}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Shape"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>New Slide One</a:t></a:r></a:p></p:txBody></p:sp><p:pic><p:nvPicPr><p:cNvPr id="3" name="Picture"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId3"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr/></p:pic></p:spTree></p:cSld></p:sld>`
      );
      generatedZip.file(
        'ppt/slides/_rels/slide1.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R_NS}/slideLayout" Target="../slideLayouts/slideLayoutPLACEHOLDER.xml"/><Relationship Id="rId2" Type="${R_NS}/notesSlide" Target="../notesSlides/notesSlide1.xml"/><Relationship Id="rId3" Type="${R_NS}/image" Target="../media/image1.png"/></Relationships>`
      );
      generatedZip.file(
        'ppt/notesSlides/notesSlide1.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${R_NS}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>Notes for new slide one</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`
      );
      generatedZip.file(
        'ppt/notesSlides/_rels/notesSlide1.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R_NS}/notesMaster" Target="../notesMasters/notesMasterPLACEHOLDER.xml"/><Relationship Id="rId2" Type="${R_NS}/slide" Target="../slides/slidePLACEHOLDER.xml"/></Relationships>`
      );
      generatedZip.file('ppt/media/image1.png', new Uint8Array([9, 8, 7, 6]));

      // Slide 2: a shape only (on "Section Dark") + its own notes page, no image.
      generatedZip.file(
        'ppt/slides/slide2.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${R_NS}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Shape"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>New Slide Two</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
      );
      generatedZip.file(
        'ppt/slides/_rels/slide2.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R_NS}/slideLayout" Target="../slideLayouts/slideLayoutPLACEHOLDER.xml"/><Relationship Id="rId2" Type="${R_NS}/notesSlide" Target="../notesSlides/notesSlide2.xml"/></Relationships>`
      );
      generatedZip.file(
        'ppt/notesSlides/notesSlide2.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${R_NS}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>Notes for new slide two</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`
      );
      generatedZip.file(
        'ppt/notesSlides/_rels/notesSlide2.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R_NS}/notesMaster" Target="../notesMasters/notesMasterPLACEHOLDER.xml"/><Relationship Id="rId2" Type="${R_NS}/slide" Target="../slides/slidePLACEHOLDER.xml"/></Relationships>`
      );

      const blob = await mergeTemplate({
        templateInfo,
        generatedZip,
        slideAssignments: ['Content Light', 'Section Dark'],
        fontsToEmbed: [
          { name: 'Combo Font', variant: 'regular', data: new Uint8Array([5, 6, 7]) },
          { name: 'Combo Font', variant: 'bold', data: new Uint8Array([8, 9, 10]) },
        ],
      });
      const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));

      // Every XML/rels part in the merged output must be well-formed (structural
      // sanity, not a substitute for full OOXML schema validation or opening
      // the file in PowerPoint — see docs/template-support.md).
      for (const [zipPath, file] of Object.entries(zip.files)) {
        if (file.dir || !(zipPath.endsWith('.xml') || zipPath.endsWith('.rels'))) continue;
        const str = await file.async('string');
        const doc = new DOMParser().parseFromString(str, 'text/xml');
        expect(doc.getElementsByTagName('parsererror'), `${zipPath} must be well-formed`).toHaveLength(0);
      }

      // Pre-existing content untouched.
      const existingSlide = await zip.file(EXISTING_CONTENT.slidePath).async('string');
      expect(existingSlide).toContain(EXISTING_CONTENT.slideText);
      const existingImageBytes = await zip.file(EXISTING_CONTENT.imagePath).async('uint8array');
      expect(existingImageBytes.length).toBeGreaterThan(0);

      // New slides landed past the existing gap (slide5.xml), one per requested layout.
      const relsSlide6 = await parseXml(zip, 'ppt/slides/_rels/slide6.xml.rels');
      expect(
        elementsByLocalName(relsSlide6, 'Relationship')
          .find((r) => r.getAttribute('Type').endsWith('/slideLayout'))
          .getAttribute('Target')
      ).toBe('../slideLayouts/slideLayout1.xml'); // Content Light
      const relsSlide7 = await parseXml(zip, 'ppt/slides/_rels/slide7.xml.rels');
      expect(
        elementsByLocalName(relsSlide7, 'Relationship')
          .find((r) => r.getAttribute('Type').endsWith('/slideLayout'))
          .getAttribute('Target')
      ).toBe('../slideLayouts/slideLayout2.xml'); // Section Dark

      // Each new notes page points at its own new slide and the real notes master.
      const notesRels9 = await parseXml(zip, 'ppt/notesSlides/_rels/notesSlide9.xml.rels');
      expect(
        elementsByLocalName(notesRels9, 'Relationship')
          .find((r) => r.getAttribute('Type').endsWith('/slide'))
          .getAttribute('Target')
      ).toBe('../slides/slide6.xml');
      expect(
        elementsByLocalName(notesRels9, 'Relationship')
          .find((r) => r.getAttribute('Type').endsWith('/notesMaster'))
          .getAttribute('Target')
      ).toBe('../notesMasters/notesMaster1.xml');
      const notesRels10 = await parseXml(zip, 'ppt/notesSlides/_rels/notesSlide10.xml.rels');
      expect(
        elementsByLocalName(notesRels10, 'Relationship')
          .find((r) => r.getAttribute('Type').endsWith('/slide'))
          .getAttribute('Target')
      ).toBe('../slides/slide7.xml');

      // New image landed past the template's existing image9.png, and the
      // new slide's image relationship points at it.
      expect(zip.file('ppt/media/image10.png')).not.toBeNull();
      const imageRel = elementsByLocalName(relsSlide6, 'Relationship').find((r) =>
        r.getAttribute('Type').endsWith('/image')
      );
      expect(imageRel.getAttribute('Target')).toBe('../media/image10.png');

      // Both font variants embedded under one family.
      const presDoc = await parseXml(zip, 'ppt/presentation.xml');
      const embedFonts = elementsByLocalName(presDoc, 'embeddedFont');
      expect(embedFonts).toHaveLength(1);
      expect(elementsByLocalName(embedFonts[0], 'font')[0].getAttribute('typeface')).toBe('Combo Font');
      expect(elementsByLocalName(embedFonts[0], 'regular')).toHaveLength(1);
      expect(elementsByLocalName(embedFonts[0], 'bold')).toHaveLength(1);
      const fontFiles = Object.keys(zip.files).filter((p) => /^ppt\/fonts\/font\d+\.fntdata$/.test(p));
      expect(fontFiles).toHaveLength(2);

      // All new slide ids appended after the pre-existing one, no collisions.
      const sldIds = elementsByLocalName(presDoc, 'sldId').map((n) => parseInt(n.getAttribute('id'), 10));
      expect(sldIds).toHaveLength(3);
      expect(new Set(sldIds).size).toBe(3);
    });
  });

  // Maintainer review (PR #67, atharva9167j, 2026-10-02): with both
  // `template` and `layout` set, PptxGenJS rendered shapes against the
  // named `layout` preset's coordinate space, but mergeTemplate() always
  // preserves the *template's* own real <p:sldSz> in the final package —
  // a silent canvas-size mismatch. The template's real size must win
  // (src/index.js), since a named preset essentially never matches an
  // arbitrary template's actual declared size.
  describe('exportToPptx({ template, layout }) conflict — template size wins (maintainer review, 2026-10-02)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('ignores options.layout in favor of the template size when both are provided, and warns', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const slide = makeSlide({ label: 'layout-template-conflict', color: '#101010' });

      const blob = await exportToPptx(slide, {
        template: templateBytes,
        layout: 'LAYOUT_16x10', // PptxGenJS's own built-in 10in x 6.25in — deliberately NOT the template's 13.333x7.5in
        skipDownload: true,
      });
      const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
      const presDoc = await parseXml(zip, 'ppt/presentation.xml');
      const sldSz = elementsByLocalName(presDoc, 'sldSz')[0];
      // Template's real size (13.333x7.5in), not LAYOUT_16x10's 10x6.25in.
      expect(sldSz.getAttribute('cx')).toBe('12192000');
      expect(sldSz.getAttribute('cy')).toBe('6858000');

      const warnedAboutConflict = warnSpy.mock.calls.some(
        (args) => String(args[0]).includes('options.layout') && String(args[0]).includes('template')
      );
      expect(warnedAboutConflict).toBe(true);
    });

    it('still applies options.layout normally when no template is set (regression)', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const slide = makeSlide({ label: 'layout-no-template', color: '#202020' });

      const blob = await exportToPptx(slide, { layout: 'LAYOUT_16x10', skipDownload: true });
      const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
      const presDoc = await parseXml(zip, 'ppt/presentation.xml');
      const sldSz = elementsByLocalName(presDoc, 'sldSz')[0];
      expect(sldSz.getAttribute('cx')).toBe('9144000'); // 10in
      expect(sldSz.getAttribute('cy')).toBe('5715000'); // 6.25in

      const warnedAboutConflict = warnSpy.mock.calls.some((args) => String(args[0]).includes('options.layout'));
      expect(warnedAboutConflict).toBe(false);
    });
  });

  // Maintainer review (PR #67, atharva9167j, 2026-10-02): the per-slide rels
  // loop in mergeTemplate() only rewrites slideLayout/notesSlide/image
  // relationships; any other internal relationship type (chart, embedded
  // media, ...) was copied into the new slide's .rels unchanged while its
  // target part was never copied into the template zip — a silent dangling
  // relationship. This must fail loudly instead.
  describe('mergeTemplate() fails loudly on an internal relationship it cannot carry over (maintainer review, 2026-10-02)', () => {
    it('throws rather than leaving a dangling relationship for an unsupported internal relationship type', async () => {
      const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
      const templateInfo = await readTemplate(await buildTemplateFixture());

      const generatedZip = new JSZip();
      generatedZip.file(
        '[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>`
      );
      generatedZip.file(
        'ppt/slides/slide1.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${R_NS}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld></p:sld>`
      );
      // A chart relationship: its target part (ppt/charts/chart1.xml) is
      // never created here, simulating a hypothetical future renderer
      // feature mergeTemplate() doesn't yet know how to carry over.
      generatedZip.file(
        'ppt/slides/_rels/slide1.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R_NS}/slideLayout" Target="../slideLayouts/slideLayoutPLACEHOLDER.xml"/><Relationship Id="rId2" Type="${R_NS}/chart" Target="../charts/chart1.xml"/></Relationships>`
      );

      await expect(mergeTemplate({ templateInfo, generatedZip, slideAssignments: ['Content Light'] })).rejects.toThrow(
        /internal relationship of type ".*chart.*"/
      );
    });
  });

  // Maintainer review (PR #67, atharva9167j, 2026-10-02): mergeTemplate()
  // silently `continue`d past a slideAssignments entry with no matching
  // generatedZip slide, producing fewer merged slides than requested with
  // no indication anything was wrong. A malformed intermediate package (or
  // a slideAssignments/generatedZip mismatch) must fail loudly instead.
  describe('mergeTemplate() fails loudly when a requested slide is missing from generatedZip (maintainer review, 2026-10-02)', () => {
    it('throws instead of silently producing fewer slides than slideAssignments requested', async () => {
      const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
      const templateInfo = await readTemplate(await buildTemplateFixture());

      const generatedZip = new JSZip();
      generatedZip.file(
        '[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>`
      );
      generatedZip.file(
        'ppt/slides/slide1.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${R_NS}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld></p:sld>`
      );
      generatedZip.file(
        'ppt/slides/_rels/slide1.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R_NS}/slideLayout" Target="../slideLayouts/slideLayoutPLACEHOLDER.xml"/></Relationships>`
      );
      // Deliberately no slide2.xml, while slideAssignments below claims two slides were generated.

      await expect(
        mergeTemplate({ templateInfo, generatedZip, slideAssignments: ['Content Light', 'Section Dark'] })
      ).rejects.toThrow(/expected a generated slide at "ppt\/slides\/slide2\.xml"/);
    });
  });
});
