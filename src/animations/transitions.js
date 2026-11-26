/**
 * Slide Transitions for dom-to-pptx.
 *
 * CSS Class Convention:
 *  - slide-transition-{name}          → selects the transition type
 *  - transition-dir-{d|u|l|r|ld|rd|lu|ru|horz|vert|in|out} → direction attribute
 *  - transition-orient-{horz|vert}    → orient attribute (for split, blinds)
 *  - transition-pattern-{hexagon|rectangle|diamond} → pattern attribute (glitter, checker)
 *  - transition-spokes-{1|2|3|4|8}   → spokes attribute (wheel)
 *  - transition-dur-{ms}             → custom duration in milliseconds
 *
 * For transitions with built-in directional variants that cannot be expressed
 * via a generic dir attribute (e.g. p15 transitions with invX="1"), we use
 * distinct transition names instead:
 *  - slide-transition-airplane-left   (airplane, left direction)
 *  - slide-transition-airplane-right  (airplane, invX=1)
 *  - slide-transition-wind-left       (wind)
 *  - slide-transition-wind-right      (wind, invX=1)
 *  - slide-transition-origami-left    (origami)
 *  - slide-transition-origami-right   (origami, invX=1)
 *  - slide-transition-fallover-left   (fallOver)
 *  - slide-transition-fallover-right  (fallOver, invX=1)
 *  - slide-transition-drape-left      (drape)
 *  - slide-transition-drape-right     (drape, invX=1)
 *  - slide-transition-prism-inverted  (prism, isInverted=1)
 *  - slide-transition-shred-in        (shred, dir=in)
 *  - slide-transition-shred-out       (shred, dir=out)
 *  - slide-transition-shred-rect-in   (shred, pattern=rectangle)
 *  - slide-transition-shred-rect-out  (shred, pattern=rectangle, dir=out)
 */

const NS = {
  p14: 'http://schemas.microsoft.com/office/powerpoint/2010/main',
  p15: 'http://schemas.microsoft.com/office/powerpoint/2012/main',
};

/**
 * Transition Definition Map.
 *
 * Each key is a CSS class name suffix (the part after `slide-transition-`).
 * Each value:
 *   tag      - the XML element to emit (e.g. 'p:fade', 'p14:vortex', 'p15:prstTrans')
 *   attrs    - hardcoded XML attributes already baked into this variant (e.g. prst="wind")
 *   ns       - array of namespace prefixes required (p14, p15) — injected onto <p:sld> root
 *   dynamic  - array of attribute names that are passed-through from CSS classes
 *              (dir, orient, pattern, spokes, dur)
 *   spd      - 'med' | 'slow' — default playback speed
 *   selfClose - whether to emit as a self-closing tag (default: true)
 */
const TRANSITION_DEF = {
  // ── Classic Native P: transitions ─────────────────────────────────────────
  fade: { tag: 'p:fade', dynamic: [], spd: 'med' },
  cut: { tag: 'p:cut', dynamic: [], spd: 'med' },
  push: { tag: 'p:push', dynamic: ['dir'], spd: 'med' },
  wipe: { tag: 'p:wipe', dynamic: ['dir'], spd: 'med' },
  split: { tag: 'p:split', dynamic: ['dir', 'orient'], spd: 'med' },
  strips: { tag: 'p:strips', dynamic: ['dir'], spd: 'med' },
  pull: { tag: 'p:pull', dynamic: ['dir'], spd: 'med' },
  dissolve: { tag: 'p:dissolve', dynamic: [], spd: 'slow' },
  checker: { tag: 'p:checker', dynamic: ['dir'], spd: 'slow' },
  randomBar: { tag: 'p:randomBar', dynamic: ['dir'], spd: 'med' },
  circle: { tag: 'p:circle', dynamic: [], spd: 'med' },
  comb: { tag: 'p:comb', dynamic: ['dir'], spd: 'slow' },
  wheel: { tag: 'p:wheel', dynamic: ['spokes'], spd: 'slow' },
  newsflash: { tag: 'p:newsflash', dynamic: [], spd: 'slow' },
  blinds: { tag: 'p:blinds', dynamic: ['dir'], spd: 'slow' },
  reveal: { tag: 'p:reveal', dynamic: ['dir'], spd: 'med' },
  zoom: { tag: 'p:zoom', dynamic: ['dir'], spd: 'med' },
  cover: { tag: 'p:cover', dynamic: ['dir'], spd: 'med' },
  uncover: { tag: 'p:uncover', dynamic: ['dir'], spd: 'med' },
  flash: { tag: 'p:flash', dynamic: [], spd: 'slow' },

  // ── P14 (PowerPoint 2010) transitions ─────────────────────────────────────
  honeycomb: { tag: 'p14:honeycomb', dynamic: [], spd: 'slow', ns: ['p14'] },
  ripple: { tag: 'p14:ripple', dynamic: [], spd: 'med', ns: ['p14'] },
  glitter: { tag: 'p14:glitter', dynamic: ['dir', 'pattern'], spd: 'slow', ns: ['p14'] },
  vortex: { tag: 'p14:vortex', dynamic: ['dir'], spd: 'slow', ns: ['p14'] },
  shred: { tag: 'p14:shred', dynamic: ['pattern'], spd: 'slow', ns: ['p14'] },
  switch: { tag: 'p14:switch', dynamic: ['dir'], spd: 'slow', ns: ['p14'] },
  flip: { tag: 'p14:flip', dynamic: ['dir'], spd: 'slow', ns: ['p14'] },
  gallery: { tag: 'p14:gallery', dynamic: ['dir'], spd: 'slow', ns: ['p14'] },
  conveyor: { tag: 'p14:conveyor', dynamic: ['dir'], spd: 'slow', ns: ['p14'] },
  prism: { tag: 'p14:prism', dynamic: ['dir'], spd: 'slow', ns: ['p14'] },
  warp: { tag: 'p14:warp', dynamic: ['dir'], spd: 'slow', ns: ['p14'] },
  doors: { tag: 'p14:doors', dynamic: ['dir'], spd: 'slow', ns: ['p14'] },
  window: { tag: 'p14:window', dynamic: ['dir'], spd: 'slow', ns: ['p14'] },
  ferris: { tag: 'p14:ferris', dynamic: ['dir'], spd: 'slow', ns: ['p14'] },
  flythrough: { tag: 'p14:flythrough', dynamic: ['dir'], spd: 'slow', ns: ['p14'] },

  // ── P14 "shred" direction variants (baked-in) ─────────────────────────────
  'shred-in': { tag: 'p14:shred', attrs: { dir: 'in' }, spd: 'slow', ns: ['p14'] },
  'shred-out': { tag: 'p14:shred', attrs: { dir: 'out' }, spd: 'slow', ns: ['p14'] },
  'shred-rect-in': { tag: 'p14:shred', attrs: { pattern: 'rectangle' }, spd: 'slow', ns: ['p14'] },
  'shred-rect-out': {
    tag: 'p14:shred',
    attrs: { pattern: 'rectangle', dir: 'out' },
    spd: 'slow',
    ns: ['p14'],
  },

  // ── P14 "prism" inverted variants ─────────────────────────────────────────
  'prism-inverted': { tag: 'p14:prism', attrs: { isInverted: '1' }, spd: 'slow', ns: ['p14'] },
  'prism-inverted-r': {
    tag: 'p14:prism',
    attrs: { dir: 'r', isInverted: '1' },
    spd: 'slow',
    ns: ['p14'],
  },
  'prism-inverted-u': {
    tag: 'p14:prism',
    attrs: { dir: 'u', isInverted: '1' },
    spd: 'slow',
    ns: ['p14'],
  },
  'prism-inverted-d': {
    tag: 'p14:prism',
    attrs: { dir: 'd', isInverted: '1' },
    spd: 'slow',
    ns: ['p14'],
  },

  // ── P15 (PowerPoint 2013+) prstTrans variants ──────────────────────────────
  // Each directional variant is a distinct key (user uses transition name directly)
  'wind-left': { tag: 'p15:prstTrans', attrs: { prst: 'wind' }, spd: 'slow', ns: ['p14', 'p15'] },
  'wind-right': {
    tag: 'p15:prstTrans',
    attrs: { prst: 'wind', invX: '1' },
    spd: 'slow',
    ns: ['p14', 'p15'],
  },
  'airplane-left': {
    tag: 'p15:prstTrans',
    attrs: { prst: 'airplane' },
    spd: 'slow',
    ns: ['p14', 'p15'],
  },
  'airplane-right': {
    tag: 'p15:prstTrans',
    attrs: { prst: 'airplane', invX: '1' },
    spd: 'slow',
    ns: ['p14', 'p15'],
  },
  'origami-left': {
    tag: 'p15:prstTrans',
    attrs: { prst: 'origami' },
    spd: 'slow',
    ns: ['p14', 'p15'],
  },
  'origami-right': {
    tag: 'p15:prstTrans',
    attrs: { prst: 'origami', invX: '1' },
    spd: 'slow',
    ns: ['p14', 'p15'],
  },
  'fallover-left': {
    tag: 'p15:prstTrans',
    attrs: { prst: 'fallOver' },
    spd: 'slow',
    ns: ['p14', 'p15'],
  },
  'fallover-right': {
    tag: 'p15:prstTrans',
    attrs: { prst: 'fallOver', invX: '1' },
    spd: 'slow',
    ns: ['p14', 'p15'],
  },
  'drape-left': { tag: 'p15:prstTrans', attrs: { prst: 'drape' }, spd: 'slow', ns: ['p14', 'p15'] },
  'drape-right': {
    tag: 'p15:prstTrans',
    attrs: { prst: 'drape', invX: '1' },
    spd: 'slow',
    ns: ['p14', 'p15'],
  },
  prestige: { tag: 'p15:prstTrans', attrs: { prst: 'prestige' }, spd: 'slow', ns: ['p14', 'p15'] },
  fracture: { tag: 'p15:prstTrans', attrs: { prst: 'fracture' }, spd: 'slow', ns: ['p14', 'p15'] },
  crush: { tag: 'p15:prstTrans', attrs: { prst: 'crush' }, spd: 'slow', ns: ['p14', 'p15'] },
  pagecurldouble: {
    tag: 'p15:prstTrans',
    attrs: { prst: 'pageCurlDouble' },
    spd: 'slow',
    ns: ['p14', 'p15'],
  },
  'pagecurldouble-r': {
    tag: 'p15:prstTrans',
    attrs: { prst: 'pageCurlDouble', invX: '1' },
    spd: 'slow',
    ns: ['p14', 'p15'],
  },
  pagecurlsingle: {
    tag: 'p15:prstTrans',
    attrs: { prst: 'pageCurlSingle' },
    spd: 'slow',
    ns: ['p14', 'p15'],
  },
  'pagecurlsingle-r': {
    tag: 'p15:prstTrans',
    attrs: { prst: 'pageCurlSingle', invX: '1' },
    spd: 'slow',
    ns: ['p14', 'p15'],
  },
  curtains: { tag: 'p15:prstTrans', attrs: { prst: 'curtains' }, spd: 'slow', ns: ['p14', 'p15'] },
  peelOff: { tag: 'p15:prstTrans', attrs: { prst: 'peelOff' }, spd: 'slow', ns: ['p14', 'p15'] },
};

/**
 * Parses slide transition from CSS classes on a slide container element.
 *
 * CSS class prefixes:
 *  slide-transition-{name}
 *  transition-dir-{value}
 *  transition-orient-{value}
 *  transition-pattern-{value}
 *  transition-spokes-{value}
 *  transition-dur-{ms}
 */
export function extractTransitionFromElement(el) {
  let transitionName = null;
  const options = { dir: null, orient: null, pattern: null, spokes: null, dur: null };

  for (const className of el.classList) {
    if (className.startsWith('slide-transition-')) {
      const name = className.replace('slide-transition-', '');
      if (TRANSITION_DEF[name]) {
        transitionName = name;
      }
    } else if (className.startsWith('transition-dir-')) {
      options.dir = className.replace('transition-dir-', '');
    } else if (className.startsWith('transition-orient-')) {
      options.orient = className.replace('transition-orient-', '');
    } else if (className.startsWith('transition-pattern-')) {
      options.pattern = className.replace('transition-pattern-', '');
    } else if (className.startsWith('transition-spokes-')) {
      const m = className.match(/^transition-spokes-(\d+)$/);
      if (m) options.spokes = m[1];
    } else if (className.startsWith('transition-dur-')) {
      const m = className.match(/^transition-dur-(\d+)$/);
      if (m) options.dur = parseInt(m[1], 10);
    }
  }

  return transitionName ? { name: transitionName, ...options } : null;
}

function getAttributeDefault(attrName, tag) {
  if (attrName === 'dir') {
    if (tag === 'p:split') return 'out';
    if (tag === 'p:strips') return 'ld';
    if (['p:zoom', 'p14:warp', 'p14:flythrough'].includes(tag)) return 'in';
    if (['p:blinds', 'p:checker', 'p:comb', 'p:randomBar', 'p14:doors', 'p14:window'].includes(tag)) return 'horz';
    return 'l';
  }
  if (attrName === 'orient') return 'horz';
  if (attrName === 'pattern') {
    if (tag === 'p14:shred') return 'strip';
    return 'hexagon';
  }
  if (attrName === 'spokes') return '4';
  return null;
}

/**
 * Generates the <p:transition> XML string for a given transition data object.
 */
export function getTransitionXml(transitionData) {
  if (!transitionData) return '';

  const { name, dur } = transitionData;
  const def = TRANSITION_DEF[name];
  if (!def) return '';

  const { tag, attrs: bakedAttrs = {}, ns: requiredNs = [], dynamic = [], spd = 'med' } = def;

  // Build inner element attributes
  const innerAttrs = { ...bakedAttrs };

  for (const attrName of dynamic) {
    const val =
      transitionData[attrName] !== undefined && transitionData[attrName] !== null
        ? transitionData[attrName]
        : getAttributeDefault(attrName, tag);
    if (val !== null && val !== undefined) {
      innerAttrs[attrName] = val;
    }
  }

  // Serialize inner attributes as XML
  const innerAttrStr = Object.entries(innerAttrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');

  const innerXml = `<${tag}${innerAttrStr ? ' ' + innerAttrStr : ''}/>`;

  // Build <p:transition> opening tag with required namespace declarations
  const nsDecls = requiredNs.map((prefix) => `xmlns:${prefix}="${NS[prefix]}"`).join(' ');

  let transitionOpenTag = `<p:transition spd="${spd}"`;
  if (nsDecls) transitionOpenTag += ` ${nsDecls}`;
  if (dur && (requiredNs.includes('p14') || tag.startsWith('p14'))) {
    // p14:dur requires p14 ns on the transition element
    const needsP14Ns = !requiredNs.includes('p14');
    if (needsP14Ns) transitionOpenTag += ` xmlns:p14="${NS.p14}"`;
    transitionOpenTag += ` p14:dur="${dur}"`;
  }
  transitionOpenTag += '>';

  return `${transitionOpenTag}${innerXml}</p:transition>`;
}
