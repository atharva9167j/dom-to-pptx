// src/__tests__/animations.test.js
import { describe, it, expect } from 'vitest';
import { parseAnimation } from '../animations/css-parser.js';
import { getPreset, buildTimingXml } from '../animations/xml-templates.js';
import { normalizePptxZip } from '../pptx-normalizer.js';
import JSZip from 'jszip';
import { applyBrowserAnimations } from '../index.js';

describe('css-parser - parseAnimation', () => {
  it('returns null when no animation is defined', () => {
    const node = { nodeType: 1, dataset: {}, classList: [] };
    const style = { animationName: 'none', getPropertyValue: () => '' };
    expect(parseAnimation(node, style)).toBeNull();
  });

  it('parses dataset attributes with highest priority', () => {
    const node = {
      nodeType: 1,
      dataset: {
        pptxAnimation: 'zoom-in',
        pptxAnimationStart: 'after',
        pptxAnimationDuration: '1.5s',
        pptxAnimationDelay: '500ms',
        pptxAnimationClass: 'entr',
      },
      classList: [],
    };
    const style = {
      animationName: 'fade-in',
      animationDuration: '1s',
      animationDelay: '0s',
      getPropertyValue: () => '',
    };

    const parsed = parseAnimation(node, style);
    expect(parsed).toEqual({
      name: 'zoom-in',
      class: 'entr',
      duration: 1500,
      delay: 500,
      start: 'after',
      subtype: null,
      build: 'all',
      direction: null,
      orientation: null,
    });
  });

  it('parses custom properties correctly', () => {
    const node = { nodeType: 1, dataset: {}, classList: [] };
    const customProps = {
      '--pptx-animation-name': 'fly-in',
      '--pptx-start': 'with-previous',
      '--pptx-duration': '800ms',
      '--pptx-delay': '0.2s',
      '--pptx-class': 'entr',
      '--pptx-subtype': 'from-left',
    };
    const style = {
      animationName: 'none',
      getPropertyValue: (key) => customProps[key] || '',
    };

    const parsed = parseAnimation(node, style);
    expect(parsed).toEqual({
      name: 'fly-in',
      class: 'entr',
      duration: 800,
      delay: 200,
      start: 'with',
      subtype: 'from-left',
      build: 'all',
      direction: 'up',
      orientation: null,
    });
  });

  it('parses standard CSS animation properties', () => {
    const node = { nodeType: 1, dataset: {}, classList: [] };
    const style = {
      animationName: 'fade-out',
      animationDuration: '2s',
      animationDelay: '100ms',
      getPropertyValue: () => '',
    };

    const parsed = parseAnimation(node, style);
    expect(parsed).toEqual({
      name: 'fade-out',
      class: 'exit', // Inferred from name 'fade-out'
      duration: 2000,
      delay: 100,
      start: 'click',
      subtype: null,
      build: 'all',
      direction: null,
      orientation: null,
    });
  });

  it('infers class list start triggers from animate-trigger-after class', () => {
    const node = {
      nodeType: 1,
      dataset: { pptxAnimation: 'fade-in' },
      className: 'fade-in animate-trigger-after',
      classList: ['fade-in', 'animate-trigger-after'],
    };
    const style = {
      animationName: 'fade-in',
      animationDuration: '0.7s',
      animationDelay: '0s',
      getPropertyValue: () => '',
    };

    const parsed = parseAnimation(node, style);
    expect(parsed.start).toBe('after');
  });

  it('does not throw on SVG elements whose className is an SVGAnimatedString', () => {
    // Regression: parseAnimation used to call node.className.split(/\s+/),
    // which throws on SVG elements because SVGElement.className is an
    // SVGAnimatedString, not a string. Any inline <svg> with a class
    // attribute would abort the entire PPTX export. classList is safe on
    // both HTML and SVG elements.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'fade-in some-utility');
    // dataset is not defined on SVGElement in every DOM implementation, so
    // add an empty one to keep the parser happy — the point of the test is
    // just that we do not crash on the className access.
    if (!svg.dataset) svg.dataset = {};
    const style = {
      animationName: 'fade-in',
      animationDuration: '0.5s',
      animationDelay: '0s',
      getPropertyValue: () => '',
    };

    expect(() => parseAnimation(svg, style)).not.toThrow();
    const parsed = parseAnimation(svg, style);
    expect(parsed).not.toBeNull();
    expect(parsed.name).toBe('fade-in');
  });
});

describe('xml-templates - getPreset', () => {
  it('maps names and classes to correct preset configurations', () => {
    const fadeEntr = getPreset('fade-in', 'entr');
    expect(fadeEntr.presetId).toBe('10');
    expect(fadeEntr.filter).toBe('fade');
    expect(fadeEntr.presetSubtype).toBe('0');
    expect(fadeEntr.class).toBe('entr');

    const zoomExit = getPreset('zoom-out', 'exit');
    expect(zoomExit.presetId).toBe('53'); // PowerPoint zoom-out = presetID 53 (Grow/Shrink)
    expect(zoomExit.type).toBe('zoom'); // Uses ppt_w/ppt_h animation, not animEffect filter
    expect(zoomExit.class).toBe('exit');

    const appearEntr = getPreset('appear', 'entr');
    expect(appearEntr.presetId).toBe('1');
    expect(appearEntr.type).toBe('set'); // appear = set visibility, no animEffect

    const bounceIn = getPreset('bounce-in', 'entr');
    expect(bounceIn.presetId).toBe('26'); // PowerPoint's Bounce entrance = presetID 26
    expect(bounceIn.class).toBe('entr');

    const wipeIn = getPreset('wipe-in', 'entr');
    expect(wipeIn.filter).toBe('wipe(down)');
    expect(wipeIn.presetId).toBe('22');

    const splitIn = getPreset('split-in', 'entr');
    expect(splitIn.filter).toBe('barn(inVertical)');
    expect(splitIn.presetSubtype).toBe('21');
  });

  it('handles fallbacks for unknown animation names', () => {
    const unknown = getPreset('unknown-effect', 'entr');
    expect(unknown.filter).toBe('fade');
    expect(unknown.presetId).toBe('10');
  });
});

describe('xml-templates - buildTimingXml', () => {
  it('returns empty string if no animations', () => {
    expect(buildTimingXml([], new Map())).toBe('');
  });

  it('generates correct preset IDs, subtypes, and nodeTypes for entrance animations', () => {
    const anims = [
      { domOrder: 0, name: 'fade-in', class: 'entr', duration: 500, delay: 0, start: 'click' },
      { domOrder: 1, name: 'fly-in', class: 'entr', duration: 500, delay: 0, start: 'with' },
      { domOrder: 2, name: 'wipe-in', class: 'entr', duration: 500, delay: 0, start: 'with' },
    ];
    const domToSpIdMap = new Map([
      [0, ['18']],
      [1, ['19']],
      [2, ['20']],
    ]);
    const xml = buildTimingXml(anims, domToSpIdMap);

    // Fade-in: presetID=10, presetSubtype=0, filter=fade
    expect(xml).toContain('presetID="10" presetClass="entr" presetSubtype="0"');
    expect(xml).toContain('filter="fade"');

    // Fly-in: presetID=2, presetSubtype=4, uses p:anim (ppt_y motion)
    expect(xml).toContain('presetID="2" presetClass="entr" presetSubtype="4"');
    expect(xml).toContain('ppt_y');

    // Wipe-in: presetID=22, presetSubtype=4, filter=wipe(down)
    expect(xml).toContain('presetID="22" presetClass="entr" presetSubtype="4"');
    expect(xml).toContain('filter="wipe(down)"');

    // All effects must have a visibility set block
    expect(xml).toContain('style.visibility');
    expect(xml).toContain('<p:strVal val="visible"/>');

    // clickEffect for first anim, withEffect for the rest
    expect(xml).toContain('nodeType="clickEffect"');
    expect(xml).toContain('nodeType="withEffect"');
  });

  it('emits afterEffect nodeType and correct outer delay structure for start=after', () => {
    const anims = [
      { domOrder: 0, name: 'fade-in', class: 'entr', duration: 500, delay: 0, start: 'click' },
      { domOrder: 1, name: 'fade-in', class: 'entr', duration: 500, delay: 0, start: 'after' },
    ];
    const domToSpIdMap = new Map([
      [0, ['18']],
      [1, ['19']],
    ]);
    const xml = buildTimingXml(anims, domToSpIdMap);

    expect(xml).toContain('nodeType="afterEffect"');
  });

  it('generates correct structure matching PowerPoint reference XML', () => {
    const anims = [{ domOrder: 0, name: 'fade-in', class: 'entr', duration: 500, delay: 0, start: 'click' }];
    const domToSpIdMap = new Map([[0, ['18']]]);
    const xml = buildTimingXml(anims, domToSpIdMap);

    // Root structure
    expect(xml).toContain('nodeType="tmRoot"');
    expect(xml).toContain('nodeType="mainSeq"');
    expect(xml).toContain('concurrent="1" nextAc="seek"');

    // Outer wrapper delay=indefinite → numbered animation (not ⚡)
    expect(xml).toContain('delay="indefinite"');

    // CRITICAL: prevCondLst and nextCondLst must target the SLIDE
    // Without <p:sldTgt/>, PowerPoint shows ⚡ instead of numbered animations
    expect(xml).toContain('<p:sldTgt/>');
    expect(xml).toContain('evt="onPrev"');
    expect(xml).toContain('evt="onNext"');

    // p:bldLst required for Animation Pane to show numbered entries
    expect(xml).toContain('<p:bldLst>');
    expect(xml).toContain('spid="18"');

    // Effect cTn attributes
    // clickEffect gets grpId="0" just like native PPT
    expect(xml).toContain(
      'presetID="10" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="clickEffect"'
    );
  });

  it('supports multiple spIds per domOrder', () => {
    const anims = [{ domOrder: 0, name: 'fade-in', class: 'entr', duration: 1000, delay: 0, start: 'click' }];
    const domToSpIdMap = new Map([[0, ['3', '4']]]);
    const xml = buildTimingXml(anims, domToSpIdMap);
    expect(xml).toContain('spid="3"');
    expect(xml).toContain('spid="4"');
  });

  it('groups with effects as SIBLINGS inside ONE inner wrapper (not separate inner wrappers)', () => {
    // click + with + after in ONE click-group
    const anims = [
      { domOrder: 0, name: 'fade-in', class: 'entr', duration: 500, delay: 0, start: 'click' },
      { domOrder: 1, name: 'wipe-in', class: 'entr', duration: 500, delay: 0, start: 'with' },
      { domOrder: 2, name: 'zoom-in', class: 'entr', duration: 500, delay: 100, start: 'after' },
    ];
    const domToSpIdMap = new Map([
      [0, ['10']],
      [1, ['11']],
      [2, ['12']],
    ]);
    const xml = buildTimingXml(anims, domToSpIdMap);

    // Only ONE outer click-group → only ONE delay="indefinite"
    const indefiniteCount = (xml.match(/delay="indefinite"/g) || []).length;
    expect(indefiniteCount).toBe(1);

    // All three nodeTypes present
    expect(xml).toContain('nodeType="clickEffect"');
    expect(xml).toContain('nodeType="withEffect"');
    expect(xml).toContain('nodeType="afterEffect"');

    // After effect inner delay = 500 (click duration) + 100 (its own delay) = 600
    expect(xml).toContain('delay="600"');

    // p:sldTgt for numbered animation (no ⚡)
    expect(xml).toContain('<p:sldTgt/>');

    // p:bldLst with all 3 animated shapes
    expect(xml).toContain('<p:bldLst>');
    expect(xml).toContain('spid="10"');
    expect(xml).toContain('spid="11"');
    expect(xml).toContain('spid="12"');
  });

  it('creates a NEW outer click-group for each start=click animation', () => {
    const anims = [
      { domOrder: 0, name: 'fade-in', class: 'entr', duration: 500, delay: 0, start: 'click' },
      { domOrder: 1, name: 'fade-in', class: 'entr', duration: 500, delay: 0, start: 'click' },
      { domOrder: 2, name: 'fade-in', class: 'entr', duration: 500, delay: 0, start: 'click' },
    ];
    const domToSpIdMap = new Map([
      [0, ['10']],
      [1, ['11']],
      [2, ['12']],
    ]);
    const xml = buildTimingXml(anims, domToSpIdMap);

    // 3 separate click anims → 3 outer click-groups → 3 delay="indefinite"
    const indefiniteCount = (xml.match(/delay="indefinite"/g) || []).length;
    expect(indefiniteCount).toBe(3);
  });
});

describe('normalizer integration', () => {
  it('correctly injects p:timing block into slide XML', async () => {
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types><Default Extension="xml" ContentType="application/xml"/></Types>`
    );

    const slideXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr/>
      <p:grpSpPr/>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Shape" descr="__z_0__dom_0"/>
        </p:nvSpPr>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:extLst/>
</p:sld>`;
    zip.file('ppt/slides/slide1.xml', slideXml);

    const options = {
      _slideAnimations: {
        0: [{ domOrder: 0, name: 'fade-in', class: 'entr', duration: 1000, delay: 0, start: 'click' }],
      },
    };

    await normalizePptxZip(zip, options);

    const resultXml = await zip.file('ppt/slides/slide1.xml').async('string');
    expect(resultXml).toContain('<p:timing');
    expect(resultXml).toContain('spid="3"');
    expect(resultXml).toContain('presetID="10"');
    expect(resultXml).toContain('presetClass="entr"');

    // Ensure it was placed BEFORE p:extLst
    const extLstIndex = resultXml.indexOf('<p:extLst/>');
    const timingIndex = resultXml.indexOf('<p:timing');
    expect(timingIndex).toBeGreaterThan(-1);
    expect(extLstIndex).toBeGreaterThan(-1);
    expect(timingIndex).toBeLessThan(extLstIndex);
  });
});

describe('animation options and validation', () => {
  it('parses build, direction, and orientation correctly from classes', () => {
    const node = {
      nodeType: 1,
      dataset: {},
      className: 'fly-in paragraph to-left',
      classList: ['fly-in', 'paragraph', 'to-left'],
    };
    const style = {
      animationName: 'fly-in',
      getPropertyValue: () => '',
    };
    const parsed = parseAnimation(node, style);
    expect(parsed.build).toBe('paragraph');
    expect(parsed.direction).toBe('left');
    expect(parsed.orientation).toBeNull();
  });

  it('validates options and ignores invalid options', () => {
    // 1. to-left on split -> orientation vertical, direction null
    const node1 = {
      nodeType: 1,
      dataset: {},
      className: 'split-in to-left',
      classList: ['split-in', 'to-left'],
    };
    const style1 = {
      animationName: 'split-in',
      getPropertyValue: () => '',
    };
    const parsed1 = parseAnimation(node1, style1);
    expect(parsed1.orientation).toBe('vertical');
    expect(parsed1.direction).toBeNull();

    // 2. vertical on fly-in -> direction up, orientation null
    const node2 = {
      nodeType: 1,
      dataset: {},
      className: 'fly-in vertical',
      classList: ['fly-in', 'vertical'],
    };
    const style2 = {
      animationName: 'fly-in',
      getPropertyValue: () => '',
    };
    const parsed2 = parseAnimation(node2, style2);
    expect(parsed2.direction).toBe('up');
    expect(parsed2.orientation).toBeNull();

    // 3. to-up on fade-in -> direction/orientation null
    const node3 = {
      nodeType: 1,
      dataset: {},
      className: 'fade-in to-up',
      classList: ['fade-in', 'to-up'],
    };
    const style3 = {
      animationName: 'fade-in',
      getPropertyValue: () => '',
    };
    const parsed3 = parseAnimation(node3, style3);
    expect(parsed3.direction).toBeNull();
    expect(parsed3.orientation).toBeNull();
  });

  it('dynamically resolves Wipe directions in getPreset', () => {
    const wipeLeft = getPreset('wipe-in', 'entr', { direction: 'left' });
    expect(wipeLeft.filter).toBe('wipe(left)');
    expect(wipeLeft.presetSubtype).toBe('1');

    const wipeRight = getPreset('wipe-in', 'entr', { direction: 'right' });
    expect(wipeRight.filter).toBe('wipe(right)');
    expect(wipeRight.presetSubtype).toBe('2');
  });

  it('dynamically resolves Split orientations in getPreset', () => {
    const splitHoriz = getPreset('split-in', 'entr', { orientation: 'horizontal' });
    expect(splitHoriz.filter).toBe('barn(inHorizontal)');
    expect(splitHoriz.presetSubtype).toBe('5');

    const splitVert = getPreset('split-in', 'entr', { orientation: 'vertical' });
    expect(splitVert.filter).toBe('barn(inVertical)');
    expect(splitVert.presetSubtype).toBe('21');
  });

  it('generates multiple paragraph timing nodes for build=paragraph', () => {
    const anims = [
      {
        domOrder: 0,
        name: 'fade-in',
        class: 'entr',
        duration: 500,
        delay: 0,
        start: 'click',
        build: 'paragraph',
        numParagraphs: 2,
      },
    ];
    const domToSpIdMap = new Map([[0, ['18']]]);
    const xml = buildTimingXml(anims, domToSpIdMap);

    // Should contain background animation target
    expect(xml).toContain('<p:bg/>');

    // Should contain two pRg entries (st="0" and st="1")
    expect(xml).toContain('<p:pRg st="0" end="0"/>');
    expect(xml).toContain('<p:pRg st="1" end="1"/>');

    // Subsequent paragraphs start after
    expect(xml).toContain('nodeType="afterEffect"');

    // Should have build="p" and animBg="1" in bldLst
    expect(xml).toContain('<p:bldP spid="18" grpId="0" build="p" animBg="1"/>');
  });

  it('generates iterate lt timings for build=letter', () => {
    const anims = [
      {
        domOrder: 0,
        name: 'fade-in',
        class: 'entr',
        duration: 500,
        delay: 0,
        start: 'click',
        build: 'letter',
        numParagraphs: 1,
      },
    ];
    const domToSpIdMap = new Map([[0, ['18']]]);
    const xml = buildTimingXml(anims, domToSpIdMap);

    expect(xml).toContain('<p:iterate type="lt">');
    expect(xml).toContain('<p:tmPct val="10000"/>');
    // Letter build should not split into paragraph ranges
    expect(xml).not.toContain('<p:pRg st="0" end="0"/>');
    // Letter build should have animBg="1" but not build="p"
    expect(xml).toContain('<p:bldP spid="18" grpId="0" animBg="1"/>');
    expect(xml).not.toContain('build="p"');
  });
});

describe('applyBrowserAnimations', () => {
  it('parses duration and delay utility classes and applies them as inline styles', () => {
    const child = {
      nodeType: 1,
      classList: ['animate-duration-[750]', 'animate-delay-[250]'],
      style: {},
    };

    const parent = {
      nodeType: 1,
      classList: [],
      style: {},
      querySelectorAll: () => [child],
    };

    applyBrowserAnimations(parent);

    expect(child.style.animationDuration).toBe('750ms');
    expect(child.style.animationDelay).toBe('250ms');
  });

  it('staggers sequences with auto-advance when enableClick is false', () => {
    const child1 = {
      nodeType: 1,
      className: 'fade-in animate-duration-[500]',
      classList: ['fade-in', 'animate-duration-[500]'],
      style: {},
    };
    const child2 = {
      nodeType: 1,
      className: 'fade-in animate-duration-[500] animate-trigger-after',
      classList: ['fade-in', 'animate-duration-[500]', 'animate-trigger-after'],
      style: {},
    };

    const slide = {
      nodeType: 1,
      classList: ['slide'],
      style: {},
      querySelectorAll: () => [child1, child2],
    };

    const parent = {
      nodeType: 1,
      classList: [],
      style: {},
      querySelectorAll: () => [slide],
    };

    applyBrowserAnimations(parent, { enableClick: false });

    expect(child1.style.animationName).toBe('fade-in');
    expect(child1.style.animationDelay).toBe('0ms');
    expect(child1.style.animationPlayState).toBe('running');

    expect(child2.style.animationDelay).toBe('500ms');
  });

  it('pauses and handles slide clicks when enableClick is true', () => {
    const child1 = {
      nodeType: 1,
      className: 'fade-in animate-duration-[500]',
      classList: ['fade-in', 'animate-duration-[500]'],
      style: {},
    };
    const child2 = {
      nodeType: 1,
      className: 'fade-in animate-duration-[500] animate-trigger-on-click',
      classList: ['fade-in', 'animate-duration-[500]', 'animate-trigger-on-click'],
      style: {},
    };

    const clickListeners = [];
    const slide = {
      nodeType: 1,
      classList: ['slide'],
      style: {},
      querySelectorAll: () => [child1, child2],
      addEventListener: (evt, cb) => {
        if (evt === 'click') clickListeners.push(cb);
      },
    };

    const parent = {
      nodeType: 1,
      classList: [],
      style: {},
      querySelectorAll: () => [slide],
    };

    applyBrowserAnimations(parent, { enableClick: true });

    expect(child1.style.animationPlayState).toBe('running');
    expect(child2.style.animationPlayState).toBe('paused');

    expect(clickListeners.length).toBe(1);
    clickListeners[0]({ target: slide });

    expect(child2.style.animationPlayState).toBe('running');
  });

  it('creates paragraph build staggering on child elements', () => {
    const grandchild1 = { nodeType: 1, style: {} };
    const grandchild2 = { nodeType: 1, style: {} };

    const child = {
      nodeType: 1,
      className: 'fade-in paragraph animate-duration-[500]',
      classList: ['fade-in', 'paragraph', 'animate-duration-[500]'],
      style: {},
      children: [grandchild1, grandchild2],
    };

    const slide = {
      nodeType: 1,
      classList: ['slide'],
      style: {},
      querySelectorAll: () => [child],
    };

    const parent = {
      nodeType: 1,
      classList: [],
      style: {},
      querySelectorAll: () => [slide],
    };

    applyBrowserAnimations(parent);

    expect(child.style.animationName).toBe('fade-in');

    expect(grandchild1.style.animationName).toBe('fade-in');
    expect(grandchild1.style.animationDelay).toBe('500ms');

    expect(grandchild2.style.animationDelay).toBe('1800ms');
  });

  it('resolves browser animation names for direction/orientation variants', () => {
    const child1 = {
      nodeType: 1,
      className: 'fly-in to-left',
      classList: ['fly-in', 'to-left'],
      style: {},
    };
    const child2 = {
      nodeType: 1,
      className: 'split-out horizontal',
      classList: ['split-out', 'horizontal'],
      style: {},
    };

    const slide = {
      nodeType: 1,
      classList: ['slide'],
      style: {},
      querySelectorAll: () => [child1, child2],
    };

    const parent = {
      nodeType: 1,
      classList: [],
      style: {},
      querySelectorAll: () => [slide],
    };

    applyBrowserAnimations(parent);

    expect(child1.style.animationName).toBe('fly-in-to-left');
    expect(child2.style.animationName).toBe('split-out-horizontal');
  });

  it('creates letter build splitting and staggering on text content', () => {
    const textNode = {
      nodeType: 3,
      textContent: 'AB',
      parentNode: null,
    };
    const child = {
      nodeType: 1,
      className: 'fade-in letter animate-duration-[500]',
      classList: ['fade-in', 'letter', 'animate-duration-[500]'],
      style: {},
      childNodes: [textNode],
      children: [],
      replaceChild: (newFragment) => {
        child.replacedNodes = Array.from(newFragment.childNodes);
      },
    };
    textNode.parentNode = child;

    const slide = {
      nodeType: 1,
      classList: ['slide'],
      style: {},
      querySelectorAll: () => [child],
    };

    const parent = {
      nodeType: 1,
      classList: [],
      style: {},
      querySelectorAll: () => [slide],
    };

    const originalCreateElement = globalThis.document?.createElement;
    const originalCreateFragment = globalThis.document?.createDocumentFragment;

    const createdSpans = [];
    globalThis.document = {
      createElement: (tag) => {
        const el = { nodeType: 1, tagName: tag.toUpperCase(), style: {} };
        if (tag === 'span') createdSpans.push(el);
        return el;
      },
      createDocumentFragment: () => {
        const frag = {
          nodeType: 11,
          childNodes: [],
          appendChild: (node) => frag.childNodes.push(node),
        };
        return frag;
      },
    };

    applyBrowserAnimations(parent);

    expect(child.style.animationName).toBe('fade-in');

    expect(createdSpans.length).toBe(2);
    expect(createdSpans[0].textContent).toBe('A');
    expect(createdSpans[0].style.animationName).toBe('fade-in');
    expect(createdSpans[0].style.animationDelay).toBe('500ms');

    expect(createdSpans[1].textContent).toBe('B');
    expect(createdSpans[1].style.animationDelay).toBe('530ms');

    if (originalCreateElement) {
      globalThis.document.createElement = originalCreateElement;
      globalThis.document.createDocumentFragment = originalCreateFragment;
    } else {
      delete globalThis.document;
    }
  });

  it('correctly calculates the end time of a paragraph build and queues the next click-trigger group after it', () => {
    const grandchild1 = { nodeType: 1, style: {} };
    const grandchild2 = { nodeType: 1, style: {} };

    const child1 = {
      nodeType: 1,
      className: 'fade-in paragraph animate-duration-[500]',
      classList: ['fade-in', 'paragraph', 'animate-duration-[500]'],
      style: {},
      children: [grandchild1, grandchild2],
    };

    const child2 = {
      nodeType: 1,
      className: 'fade-in animate-duration-[500] animate-trigger-on-click',
      classList: ['fade-in', 'animate-duration-[500]', 'animate-trigger-on-click'],
      style: {},
    };

    const slide = {
      nodeType: 1,
      classList: ['slide'],
      style: {},
      querySelectorAll: () => [child1, child2],
    };

    const parent = {
      nodeType: 1,
      classList: [],
      style: {},
      querySelectorAll: () => [slide],
    };

    applyBrowserAnimations(parent, { enableClick: false });

    expect(child1.style.animationDelay).toBe('0ms');
    expect(grandchild1.style.animationDelay).toBe('500ms');
    expect(grandchild2.style.animationDelay).toBe('1800ms');
    expect(child2.style.animationDelay).toBe('3100ms');
  });

  it('correctly calculates the end time of a letter build and queues the next click-trigger group after it', () => {
    const textNode = {
      nodeType: 3,
      textContent: 'AB',
      parentNode: null,
    };
    const child1 = {
      nodeType: 1,
      className: 'fade-in letter animate-duration-[500]',
      classList: ['fade-in', 'letter', 'animate-duration-[500]'],
      style: {},
      childNodes: [textNode],
      children: [],
      replaceChild: (newFragment) => {
        child1.replacedNodes = Array.from(newFragment.childNodes);
      },
    };
    textNode.parentNode = child1;

    const child2 = {
      nodeType: 1,
      className: 'fade-in animate-duration-[500] animate-trigger-on-click',
      classList: ['fade-in', 'animate-duration-[500]', 'animate-trigger-on-click'],
      style: {},
    };

    const slide = {
      nodeType: 1,
      classList: ['slide'],
      style: {},
      querySelectorAll: () => [child1, child2],
    };

    const parent = {
      nodeType: 1,
      classList: [],
      style: {},
      querySelectorAll: () => [slide],
    };

    const originalCreateElement = globalThis.document?.createElement;
    const originalCreateFragment = globalThis.document?.createDocumentFragment;

    const createdSpans = [];
    globalThis.document = {
      createElement: (tag) => {
        const el = { nodeType: 1, tagName: tag.toUpperCase(), style: {} };
        if (tag === 'span') createdSpans.push(el);
        return el;
      },
      createDocumentFragment: () => {
        const frag = {
          nodeType: 11,
          childNodes: [],
          appendChild: (node) => frag.childNodes.push(node),
        };
        return frag;
      },
    };

    applyBrowserAnimations(parent, { enableClick: false });

    expect(child1.style.animationDelay).toBe('0ms');
    expect(createdSpans.length).toBe(2);
    expect(createdSpans[0].style.animationDelay).toBe('500ms');
    expect(createdSpans[1].style.animationDelay).toBe('530ms');
    expect(child2.style.animationDelay).toBe('1830ms');

    if (originalCreateElement) {
      globalThis.document.createElement = originalCreateElement;
      globalThis.document.createDocumentFragment = originalCreateFragment;
    } else {
      delete globalThis.document;
    }
  });
});
