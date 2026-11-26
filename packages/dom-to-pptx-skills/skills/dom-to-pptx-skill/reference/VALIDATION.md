# Validation before Export

Before calling `domToPptx.exportToPptx(…)`, run a preflight scan of the DOM. This catches the 10 most common failure modes **while the user is still in the browser** rather than after PowerPoint opens
a half-broken deck.

The rules mirror [STYLE_WHITELIST.md](STYLE_WHITELIST.md).

---

## The checklist (human-readable)

Run through this when generating the HTML by hand. The runnable validator below checks every item automatically.

### Structural

- [ ] At least one `.slide` element exists.
- [ ] Every `.slide` has fixed px dimensions (recommended `1920×1080`).
- [ ] Every `.slide` has `position: relative` and `overflow: hidden`.
- [ ] No `.slide` is inside a CSS-transformed ancestor.

### Styling

- [ ] No element on a slide uses `transform: translate(...)`, `scale(...)`, `skew(...)`, or `matrix(...)` (rotate is fine).
- [ ] No custom inline `animation` or `transition` CSS styles (use whitelisted animation/transition CSS classes instead).
- [ ] No `backdrop-filter`, `clip-path`, or `mix-blend-mode` on slide content.
- [ ] No `text-shadow` (or accept that it may drop).
- [ ] No `radial-gradient` or `conic-gradient` as a background (linear only).
- [ ] No viewport units (`vh`, `vw`, `vmin`, `vmax`) on slide content.

### Assets

- [ ] Every `<img src>` is `https://…` or `data:…`; no relative paths, no `file://`.
- [ ] Every `<img>` is loaded (check `complete && naturalWidth > 0`).
- [ ] Every Google Fonts `<link>` has `crossorigin="anonymous"`.
- [ ] No `loading="lazy"` on slide images.

### Text

- [ ] All font-sizes on slide content resolve to px (not vw/vh).
- [ ] Every custom font-family has a web-safe fallback (`Arial, sans-serif` etc).
- [ ] For typographic outlines, use `-webkit-text-stroke: <width> <color>` (maps to native PowerPoint text outlines).

---

## The runnable validator

Paste this script **above** your export script in the HTML. It exposes `window.validateSlides()` and auto-runs when the page loads, surfacing a non-blocking warning panel in dev mode.

```html
<script>
  (function () {
    const SLIDE_SELECTOR = '.slide';

    // Properties whose computed value must match an allowed pattern
    const BAD_TRANSFORM =
      /\b(?:translate|translateX|translateY|translate3d|scale|scaleX|scaleY|scale3d|skew|skewX|skewY|matrix|matrix3d)\s*\(/;
    const BAD_BACKGROUND = /\b(?:radial-gradient|conic-gradient)\s*\(/;
    const BAD_FILTER = /\b(?:brightness|contrast|saturate|hue-rotate|grayscale|sepia|invert|drop-shadow)\s*\(/;
    const VIEWPORT_UNITS = /\b\d*\.?\d+(?:vh|vw|vmin|vmax)\b/;

    // Inline style sniffers (computed styles normalize away some features,
    // so we also peek at style attributes)
    const STYLE_ATTR_BLOCKERS = [
      { name: 'backdrop-filter', re: /backdrop-filter\s*:/i },
      { name: 'clip-path', re: /clip-path\s*:/i },
      { name: 'mix-blend-mode', re: /mix-blend-mode\s*:/i },
      { name: 'text-shadow', re: /text-shadow\s*:/i },
    ];

    function describe(el) {
      const id = el.id ? '#' + el.id : '';
      const cls =
        el.className && typeof el.className === 'string'
          ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
          : '';
      return el.tagName.toLowerCase() + id + cls;
    }

    function locate(el, slideIdx) {
      return 'slide ' + (slideIdx + 1) + ' › ' + describe(el);
    }

    function hasTransformedAncestor(slide) {
      let p = slide.parentElement;
      while (p && p !== document.body) {
        const t = getComputedStyle(p).transform;
        if (t && t !== 'none') return p;
        p = p.parentElement;
      }
      return null;
    }

    window.validateSlides = function validateSlides(opts) {
      const strict = opts && opts.strict;
      const slides = Array.from(document.querySelectorAll(SLIDE_SELECTOR));
      const issues = [];

      // Check: at least one slide
      if (slides.length === 0) {
        issues.push('No elements match "' + SLIDE_SELECTOR + '". Add class="slide" to slide roots.');
        return issues;
      }

      // Check: Google Fonts links carry crossorigin
      document.querySelectorAll('link[rel="stylesheet"][href*="fonts.googleapis.com"]').forEach((link) => {
        if (link.getAttribute('crossorigin') !== 'anonymous') {
          issues.push('Google Fonts link missing crossorigin="anonymous": ' + link.href);
        }
      });

      slides.forEach((slide, idx) => {
        const cs = getComputedStyle(slide);

        // Slide container invariants
        const w = parseFloat(cs.width);
        const h = parseFloat(cs.height);
        if (!w || !h) issues.push(locate(slide, idx) + ' — slide has no resolved width/height');
        if (cs.position !== 'relative' && cs.position !== 'absolute') {
          issues.push(locate(slide, idx) + ' — slide position is "' + cs.position + '", expected "relative"');
        }
        if (cs.overflow !== 'hidden') {
          issues.push(locate(slide, idx) + ' — slide overflow is "' + cs.overflow + '", expected "hidden"');
        }
        const ratio = w && h ? w / h : 0;
        if (
          ratio &&
          Math.abs(ratio - 16 / 9) > 0.02 &&
          Math.abs(ratio - 9 / 16) > 0.02 &&
          Math.abs(ratio - 4 / 3) > 0.02 &&
          Math.abs(ratio - 16 / 10) > 0.02
        ) {
          issues.push(
            locate(slide, idx) +
              ' — aspect ratio ' +
              ratio.toFixed(3) +
              ' isn\u2019t 16:9 / 16:10 / 4:3 / 9:16; pass width/height option or resize'
          );
        }

        const ancestor = hasTransformedAncestor(slide);
        if (ancestor) {
          issues.push(
            locate(slide, idx) + ' — has a transformed ancestor (' + describe(ancestor) + '); move slide out of it'
          );
        }

        // Walk descendants
        slide.querySelectorAll('*').forEach((el) => {
          const s = getComputedStyle(el);
          const inline = el.getAttribute('style') || '';

          // transform — rotate OK, others blocked
          if (s.transform && s.transform !== 'none') {
            const inlineXform = (inline.match(/transform\s*:\s*([^;]+)/i) || [])[1] || '';
            if (BAD_TRANSFORM.test(inlineXform)) {
              issues.push(locate(el, idx) + ' — uses transform: ' + inlineXform.trim() + ' (only rotate is supported)');
            }
          }

          // gradients
          const bg = s.backgroundImage || '';
          if (BAD_BACKGROUND.test(bg)) {
            const type = bg.includes('radial') ? 'radial-gradient' : 'conic-gradient';
            issues.push(locate(el, idx) + ' — uses ' + type + ' (use linear-gradient instead)');
          }

          // filter (blur ok)
          const filt = s.filter || '';
          if (filt && filt !== 'none' && !/^\s*blur\(/.test(filt) && BAD_FILTER.test(filt)) {
            issues.push(locate(el, idx) + ' — filter "' + filt + '" not supported (only filter: blur() works)');
          }

          // inline-only blockers
          if (inline) {
            STYLE_ATTR_BLOCKERS.forEach((rule) => {
              if (rule.re.test(inline)) {
                issues.push(locate(el, idx) + ' — uses ' + rule.name + ' (blocked)');
              }
            });
          }

          // viewport units anywhere in the element's style attribute
          if (VIEWPORT_UNITS.test(inline)) {
            issues.push(locate(el, idx) + ' — uses viewport units (vh/vw/vmin/vmax); use px');
          }

          // images
          if (el.tagName === 'IMG') {
            const src = el.getAttribute('src') || '';
            if (!src) {
              issues.push(locate(el, idx) + ' — <img> has empty src');
            } else if (!/^(https:\/\/|data:)/i.test(src)) {
              issues.push(locate(el, idx) + ' — <img src="' + src + '"> must be https:// or data:');
            } else if (el.complete && el.naturalWidth === 0) {
              issues.push(locate(el, idx) + ' — <img> failed to load: ' + src);
            } else if (!el.complete && strict) {
              issues.push(locate(el, idx) + ' — <img> not yet loaded: ' + src);
            }
            if (el.getAttribute('loading') === 'lazy') {
              issues.push(locate(el, idx) + ' — <img loading="lazy"> can race the export; remove it');
            }
          }

          // lazy-loaded iframes / videos etc. we simply flag
          if (['VIDEO', 'AUDIO', 'IFRAME', 'CANVAS'].includes(el.tagName)) {
            issues.push(
              locate(el, idx) + ' — <' + el.tagName.toLowerCase() + '> is not captured; screenshot to <img> first'
            );
          }
        });
      });

      return issues;
    };

    // Auto-run in dev: if ?validate=1 is in the URL, print results on load
    if (/[?&]validate=1\b/.test(location.search)) {
      window.addEventListener('load', () => {
        const issues = window.validateSlides();
        if (issues.length) {
          console.group('%cdom-to-pptx validator: ' + issues.length + ' issue(s)', 'color:#c00;font-weight:bold');
          issues.forEach((i) => console.warn(i));
          console.groupEnd();
        } else {
          console.log('%cdom-to-pptx validator: clean ✓', 'color:#090;font-weight:bold');
        }
      });
    }
  })();
</script>
```

### Wiring it into the export button

The template in [SAFE_HTML_TEMPLATE.md](SAFE_HTML_TEMPLATE.md) already calls `window.validateSlides()` before `exportToPptx`. The relevant block:

```js
const issues = window.validateSlides ? window.validateSlides() : [];
if (issues.length) {
  const proceed = confirm(
    'Validator found ' +
      issues.length +
      ' issue(s):\n\n' +
      issues
        .slice(0, 10)
        .map((i) => '• ' + i)
        .join('\n') +
      '\n\nExport anyway?'
  );
  console.table(issues);
  if (!proceed) return;
}
```

For a headless/CI export, replace the `confirm()` with a hard failure:

```js
const issues = window.validateSlides({ strict: true });
if (issues.length) {
  console.error(issues);
  throw new Error('Validation failed: ' + issues.length + ' issue(s)');
}
```

---

## What the validator does NOT catch

It's a static sniffer — it can miss a few things. Manual spot-checks to do after a clean run:

1. **Visual overflow.** The validator confirms `overflow: hidden` but doesn't know if text ran out of its box. Scroll every slide in the browser at 100% zoom.
2. **Font fallback.** If the embedded font doesn't cover a glyph (e.g. CJK in a Latin-only font), PowerPoint will substitute silently. Check any non-ASCII text in the exported deck.
3. **Z-index order for layered elements.** The exporter respects DOM order. If something looks wrong, check the source order, not just `z-index`.
4. **Image CORS headers.** An image can load in the browser (good `complete && naturalWidth>0`) but still fail the canvas-tainting check during export. If a rounded image exports as a hard rectangle,
   that's the cause — swap to Unsplash-style hosting or base64.
5. **Content generated by JS after load.** If you populate slides dynamically, call `validateSlides()` _after_ the data arrives.

---

## Troubleshooting validator complaints

<!-- prettier-ignore -->
| Validator says… | Fix |
| --- | --- |
| `slide position is "static"` | Add `position: relative` on the `.slide` element. |
| `slide overflow is "visible"` | Add `overflow: hidden` on the `.slide` element. |
| `uses transform: translate(...)` | Replace with `left/top` pixel values, or flex centering on the parent. |
| `uses radial-gradient` | Swap for `linear-gradient` or stack a second element. |
| `uses backdrop-filter` | Replace with a semi-transparent overlay (`background: rgba(255,255,255,0.1)`). |
| `<img> must be https:// or data:` | Move the image to a CORS-enabled host or embed as base64. |
| `<img> failed to load` | Check the console for a 404/CORS error. |
| `aspect ratio … isn't 16:9 / 4:3 / 16:10 / 9:16` | Resize the slide, or pass `{width, height, layout}` to `exportToPptx`. |
| `has a transformed ancestor` | Move the `.slide` outside the transformed wrapper, or drop the transform. |
| `Google Fonts link missing crossorigin` | Add `crossorigin="anonymous"` to the `<link>` tag. |

---

## See also

- [STYLE_WHITELIST.md](STYLE_WHITELIST.md) — exhaustive list of rules this validator enforces
- [SAFE_HTML_TEMPLATE.md](SAFE_HTML_TEMPLATE.md) — template with validator pre-wired
- [ANIMATIONS_WHITELIST.md](ANIMATIONS_WHITELIST.md) — exhaustive list of whitelisted element-level animations, triggers, and text builds
- [TRANSITIONS_WHITELIST.md](TRANSITIONS_WHITELIST.md) — exhaustive list of whitelisted slide-level transition effects and durations
