# Style Whitelist for dom-to-pptx

**Source of truth** for which CSS/HTML features convert reliably to PPTX. Distilled from `dom-to-pptx@latest` source (`src/utils.js`, `src/index.js`), `SUPPORTED.md`, and `USAGE.md`.

Categories:

- ✅ **Safe** — use freely
- ⚠️ **Caveat** — works but with conditions; read the note
- ❌ **Blocked** — will break or silently drop; use the listed alternative

The validator in [VALIDATION.md](VALIDATION.md) enforces this list.

---

## 1. Layout & positioning

<!-- prettier-ignore -->
| Feature | Status | Notes |
| --- | :---: | --- |
| `position: relative` on slide root | ✅ | Required — anchor for absolute children. |
| `position: absolute` with `left/top/width/height` in px | ✅ | Most predictable way to place elements. |
| `display: flex` + `justify-content` / `align-items` / `gap` | ✅ | Final computed rects are measured; layout method is invisible to the converter. |
| `display: grid` + `grid-template-columns` / `gap` | ✅ | Same mechanism as flex. |
| `display: inline-flex`, `inline-grid` | ✅ | Fine. |
| `float` | ⚠️ | Works because only the final rect is measured, but brittle. Prefer flex/grid. |
| `transform: rotate(Ndeg)` | ✅ | Rotation angle is extracted and applied to the PPTX shape. |
| `transform: translate()` / `translateX` / `translateY` | ❌ | **Ignored.** Use `left` / `top` instead, or flex centering. |
| `transform: scale()` | ❌ | **Ignored.** Set the final width/height directly. |
| `transform: skew()` / `matrix()` | ❌ | **Ignored.** |
| `transform-origin` | ❌ | No effect. |
| `vh`, `vw`, `vmin`, `vmax` | ❌ | Use fixed px. |
| `clamp()`, `min()`, `max()` | ⚠️ | The computed value is used, so it "works" — but the result can vary by viewport. Fix the window or use px. |
| `%` widths/heights | ⚠️ | Resolved against the parent at measure time; fine if the parent has a fixed px size. |

---

## 2. Colors & backgrounds

<!-- prettier-ignore -->
| Feature | Status | Notes |
| --- | :---: | --- |
| `background-color: #hex` / `rgb()` / `rgba()` / named | ✅ | All color formats supported. |
| Solid background on `<img>` wrapper | ✅ | Preserved behind full-size images so transparent/alpha PNGs retain expected background tint. |
| `background: linear-gradient(<angle>, stop, stop, …)` | ✅ | Any angle (`45deg`, `to right`, `135deg`), multiple stops with transparency. |
| `background: radial-gradient(...)` | ⚠️ | Partial — simple cases render, complex shapes fall back. Prefer linear. |
| `background: conic-gradient(...)` | ❌ | Unsupported. |
| `background-image: url('https://…')` | ✅ | Must be HTTPS + CORS. `url('./…')` is blocked. |
| Multiple backgrounds (`background: linear-gradient(...), url(...)`) | ⚠️ | Only the first layer is reliable. Layer via stacked divs instead. |
| `background-blend-mode` / `mix-blend-mode` | ❌ | Ignored. |
| `opacity` | ✅ | Applied to the resulting shape. |
| CSS custom properties (`var(--brand)`) | ⚠️ | Resolved values are read, so it generally works — but avoid for colors if you're debugging. |

---

## 3. Borders, radius, shadow

<!-- prettier-ignore -->
| Feature | Status | Notes |
| --- | :---: | --- |
| `border: Npx solid <color>` | ✅ |  |
| Per-side (`border-top`, `border-left-width`, …) | ✅ |  |
| `border-style: dashed / dotted` | ⚠️ | Solid is the safe default; dashed often approximates to solid. |
| `border-radius: Npx` / `%` / per-corner | ✅ | Per-corner radii (`border-top-right-radius: 24px;`) are supported. |
| `outline` | ❌ | Not mapped. Use `border`. |
| `box-shadow: x y blur <color>` (outer) | ✅ | Converted to PPTX outer shadow (angle + distance). |
| `box-shadow: inset …` | ❌ | Inset shadows are ignored. |
| Multiple `box-shadow` values | ⚠️ | Only the first shadow is rendered. |
| `text-shadow` | ⚠️ | Limited / often dropped. Use color + weight contrast instead. |

---

## 4. Typography

<!-- prettier-ignore -->
| Feature | Status | Notes |
| --- | :---: | --- |
| `font-family` with web-safe fallback | ✅ | Always include `Arial, sans-serif` or `Georgia, serif` as a fallback. |
| `font-size` in px | ✅ | Fractional sizes preserved to 1/10th pt (v1.1.7). |
| `font-size` in rem/em | ⚠️ | Computed px is used, so it works, but px is clearer. |
| `font-weight: 100–900` | ✅ |  |
| `font-style: italic` | ✅ |  |
| `line-height` (unitless or px) | ✅ |  |
| `letter-spacing` | ✅ | Maps to PPTX `charSpacing` (v1.1.6+). |
| `-webkit-text-stroke: <width> <color>` | ✅ | Maps to native PowerPoint text outline (`<a:ln>`). Translucent colors export opaque. |
| `text-transform: uppercase / lowercase / capitalize` | ✅ | Supported in v1.1.6+. |
| `text-align: left / right / center / justify` | ✅ |  |
| `white-space: nowrap / pre / pre-wrap` | ✅ |  |
| `text-decoration: underline / line-through` | ✅ |  |
| `writing-mode: vertical-rl / vertical-lr` | ✅ | v1.1.7 — routes to PPTX vertical text. Combine with `text-orientation: upright` for stacked (not rotated) glyphs. |
| `word-break` / `overflow-wrap` | ⚠️ | Respected at measure time. CJK lines now auto-grow the PPTX text box instead of clipping (v1.1.7 `autoFit`). |
| Mixed inline styling (`<strong>`, `<em>`, `<span style="color:…">`) | ✅ | Rich text runs are preserved — including inside table cells (v1.1.6+). |
| `@font-face` with CORS woff2 | ✅ | Auto-embedded. Manually specify via `fonts:` option if auto-detection fails. |
| Google Fonts `<link>` without `crossorigin="anonymous"` | ❌ | Fails to embed — PPTX falls back to Arial. Always add the attribute. |
| Icon fonts (FontAwesome, Material) | ✅ | v1.1.0+ handles these including gradient icon text. |

---

## 5. Images

<!-- prettier-ignore -->
| Feature | Status | Notes |
| --- | :---: | --- |
| `<img src="https://…">` with CORS | ✅ | Unsplash, Cloudinary, picsum, your own `Access-Control-Allow-Origin: *` CDN. |
| `<img src="data:image/…;base64,…">` | ✅ | Inline base64 always works (watch file size). |
| `<img src="./local.jpg">` or `file://…` | ❌ | Blocked — rel/file paths don't resolve in the export context. |
| CORS-less image URL | ❌ | Rounding/masking engine will skip or fail. Host on a CORS CDN. |
| `object-fit: cover / contain / fill` | ✅ |  |
| `border-radius` on `<img>` | ✅ | v1.1.0+ uses off-screen canvas masking — no white halo. |
| `loading="lazy"` | ⚠️ | Risky: image may not be loaded when export runs. Omit it. |
| `srcset` / responsive images | ⚠️ | Whatever the browser picked at measure time is what ships. Pin to a single URL. |
| `<picture>` / `<source>` | ⚠️ | Same caveat. |

---

## 6. SVG & vector

<!-- prettier-ignore -->
| Feature | Status | Notes |
| --- | :---: | --- |
| Inline `<svg>` | ✅ | Rasterized by default. |
| `svgAsVector: true` option | ✅ | Keeps SVG as vector — user can **Convert to Shape** in PowerPoint. Great for charts/icons. |
| SVG `<image href="https://…">` inside | ⚠️ | Needs CORS like any other image. |
| Complex SVG filters / masks inside vector mode | ⚠️ | May not round-trip to PPTX shapes perfectly. |
| External `<img src="x.svg">` | ✅ | Treated as an image. |

---

## 7. Animation, interactivity, effects

<!-- prettier-ignore -->
| Feature | Status | Notes |
| --- | :---: | --- |
| `@keyframes` / `animation` | ✅ | Supported natively via whitelisted CSS classes (e.g. `fade-in`, `zoom-in`, `fly-in`, etc.) defined in `animations.css`. Customize trigger flow, delay (`animate-delay-[MS]`), duration (`animate-duration-[MS]`), paragraph/letter builds (`paragraph`/`letter`), direction (`to-up`, `to-down`, etc.) or orientation (`vertical`/`horizontal`) via utility classes. Custom `@keyframes` or raw properties are ignored. |
| `transition` | ✅ | Supported on `.slide` elements via whitelisted slide transition classes (e.g., `slide-transition-fade`, `slide-transition-push`, `slide-transition-wipe`, `slide-transition-split`, etc.). Configurable via direction classes (e.g., `transition-dir-l`) and duration classes (e.g. `transition-dur-1000`). Custom transitions on child elements are ignored. |
| `:hover`, `:focus`, `:active` | ❌ | Only the default state fires during export. |
| `filter: blur(Npx)` | ✅ | Maps to PPTX soft-edge. |
| `filter: brightness / contrast / saturate / hue-rotate / grayscale` | ❌ | Ignored. Bake into the image instead. |
| `backdrop-filter` | ❌ | Ignored. Simulate with a semi-transparent overlay div. |
| `clip-path` | ❌ | Ignored. Use `border-radius` or an SVG mask. |
| `mask-image` | ❌ | Ignored. |
| `cursor`, `pointer-events`, `user-select` | — | N/A — purely interactive, irrelevant at export. |

---

## 8. HTML elements

<!-- prettier-ignore -->
| Element | Status | Notes |
| --- | :---: | --- |
| `div`, `span`, `section`, `article`, `header`, `footer`, `figure`, `figcaption` | ✅ |  |
| `p`, `h1`–`h6` | ✅ |  |
| `ul`, `ol`, `li` | ✅ | `listConfig` option tweaks bullet color/spacing globally. |
| `img`, `svg` | ✅ | See §5, §6. |
| `a` | ✅ | Rendered as styled text; hyperlink behavior depends on PPTX consumer. |
| `button` | ✅ | Treated as a styled box. |
| `input[type=text]`, `textarea` | ⚠️ | Current value is extracted as plain text; styling is simple. |
| `table`, `tr`, `td`, `th` | ✅ | Native PPTX table output in v1.1.6+ (borders, cell margins for `border-spacing`, rich text in cells). |
| `video`, `audio`, `canvas`, `iframe` | ❌ | Not captured. Screenshot to an `<img>` first if you need the visual. |
| `form`, `select`, `option` | ⚠️ | Rendered as styled boxes; native form semantics are lost. |

---

## 9. Units cheat-sheet

<!-- prettier-ignore -->
| Unit | Recommendation |
| --- | --- |
| `px` | ✅ **Default.** Use everywhere on slide content. |
| `%` | ⚠️ OK inside fixed-px containers. |
| `rem`, `em` | ⚠️ Works (computed px is read) but less predictable. |
| `vh`, `vw`, `vmin`, `vmax` | ❌ Don't use on slide content. |
| `pt`, `cm`, `in` | ⚠️ Works but mixes metaphors — stick to px. |
| `fr` (grid) | ✅ Fine — grid tracks resolve before measurement. |

---

## 10. Slide container invariants

Every `.slide` root MUST:

- Use fixed px dimensions. **Recommended:** `1920 × 1080`. Also valid: `960 × 540`, `1280 × 720`, `2560 × 1440` (any 16:9). For portrait/custom, pass `width`/`height` to `exportToPptx` in inches.
- Set `position: relative` so absolute children anchor correctly.
- Set `overflow: hidden` to avoid child content leaking outside the slide bounds.
- NOT be inside a `transform`ed parent — transforms on an ancestor can break the bounding-rect math. Keep `.slide` elements as direct children of `<body>` or a plain, non-transformed wrapper.

---

## 11. Quick "convert or not" decision table

<!-- prettier-ignore -->
| You want to… | Do this, not that |
| --- | --- |
| Center something | `display: flex; justify-content: center; align-items: center;` on the parent — NOT `transform: translate(-50%, -50%)`. |
| Make something half-transparent | `background: rgba(…, 0.5)` or `opacity: 0.5` — NOT `backdrop-filter: blur`. |
| Add a glassmorphism panel | Stack a semi-transparent div over a solid background — NOT `backdrop-filter`. |
| Animate a reveal | Apply whitelisted animation classes (e.g. `fade-in`, `fly-in`) and slide transitions — NOT custom CSS `@keyframes` or custom transition properties. |
| Use a custom font | Google Font `<link crossorigin="anonymous">` or `fonts: [{name,url}]` option — NOT a relative `@font-face`. |
| Clip an image to a shape | `border-radius` (including `50%` for circles) — NOT `clip-path`. |
| Tint/darken an image | Overlay a colored div at the same position — NOT `filter: brightness()`. |
| Place an image behind text | Stack layers with `z-index`; DOM order decides layering — confirm the text element is _after_ the image in the DOM. |
| Use `transform: rotate(5deg)` for a slanted badge | Go ahead — rotation IS supported. |

---

## 12. Reading the source for edge cases

If a particular CSS feature isn't listed here, the fastest way to check is to search `dom-to-pptx/src/utils.js` for the property name. Properties that appear in the style-reading code are handled;
properties that don't aren't.

```bash
# From the dom-to-pptx checkout:
rg -n "getPropertyValue\('([a-z-]+)'\)" src/utils.js
```

---

## See also

- [SAFE_HTML_TEMPLATE.md](SAFE_HTML_TEMPLATE.md) — a template that only uses ✅ items
- [VALIDATION.md](VALIDATION.md) — a scanner that flags ❌/⚠️ items in your DOM
- [ANIMATIONS_WHITELIST.md](ANIMATIONS_WHITELIST.md) — exhaustive list of whitelisted element-level animations, triggers, and text builds
- [TRANSITIONS_WHITELIST.md](TRANSITIONS_WHITELIST.md) — exhaustive list of whitelisted slide-level transition effects and durations
- [TEMPLATE.md](TEMPLATE.md) — layout patterns using whitelisted features
