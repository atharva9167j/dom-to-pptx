# Template Support (base an export on an existing .pptx)

## Problem

`dom-to-pptx` normally generates a brand-new, blank PowerPoint package for every export. Some applications need exported slides to sit on top of a **real corporate PowerPoint template**: a `.pptx` that already defines a theme, a slide master, and a small set of slide layouts (backgrounds, logos, footers, accent bars, ...) chosen by the corporate design team.

The goal of this feature is narrow: let a caller pick one of those existing layouts per slide, so the exported slide's background comes from PowerPoint's real master/layout inheritance — not a screenshot, not a rasterized image — while the slide's own content is still rendered by dom-to-pptx's normal DOM-to-shapes pipeline exactly as before.

This is **not** a general PowerPoint template engine. It does not do placeholder filling, layout auto-selection, template management, or any rendering/preview of the master. Deciding _which_ layout a given piece of content should use is left entirely to the calling application.

## Architecture

PptxGenJS (the library dom-to-pptx renders through) cannot open or extend an existing `.pptx` — it can only create a brand-new package from scratch. So this feature does **not** change the DOM→shapes renderer (`processSlide()`) at all. Instead it adds a step before and after it:

```
template given?
  no  → pptx = new PptxGenJS()  →  addSlide() → processSlide()  → (unchanged output, as before)

  yes → read template's slide size + layout names (src/template.js: readTemplate)
      → pptx = new PptxGenJS(), sized to match the template's own slide size
      → addSlide() → processSlide()   (same renderer, same code path)
      → merge the generated slides into the template package (src/template.js: mergeTemplate)
```

`mergeTemplate` is a small, generic OOXML adapter built directly on `jszip` (already a dependency). It:

- Loads the template `.pptx` and treats it as the base package: `ppt/theme/`, `ppt/slideMasters/`, `ppt/slideLayouts/`, `ppt/media/`, `ppt/presentation.xml`, `ppt/_rels/presentation.xml.rels`, `[Content_Types].xml`, and any existing slides are preserved byte-for-byte except where noted below.
- Copies each newly generated `ppt/slides/slideN.xml`, its `ppt/notesSlides/notesSlideN.xml` (dom-to-pptx/PptxGenJS always creates one per slide), and any images it references, into the template package under fresh, non-colliding numbers.
- Rewrites exactly **one** relationship per copied slide: its `slideLayout` relationship, from PptxGenJS's own generated blank layout to the real layout resolved from the template (by name — see below). Everything else in the slide (shapes, text, colors, images) is untouched, because dom-to-pptx always writes explicit RGB values rather than theme-scheme colors, so swapping the parent layout never changes how existing shapes render.
- Appends the new slides to `ppt/presentation.xml`'s `<p:sldIdLst>` and to `ppt/_rels/presentation.xml.rels`, and adds the corresponding `[Content_Types].xml` `<Override>` entries.
- If fonts were requested, merges them into the template's own `<p:embeddedFontLst>` (see **Font embedding** below).

No existing part of the template is rewritten wholesale; only the specific nodes above are added or edited via DOM manipulation (`DOMParser`/`XMLSerializer`, the same approach `pptx-normalizer.js` already uses elsewhere in this codebase).

## Font embedding

`template` and embedded fonts (`options.fonts`, and dom-to-pptx's normal automatic `@font-face` detection) work together — the exported deck never has to fall back to a system font just because a template was used.

The existing font pipeline is reused unchanged: dom-to-pptx still detects/fetches font files and converts them to PowerPoint's `.fntdata` format via `PPTXEmbedFonts.addFont()` exactly as it always has. The only thing that's template-aware is the _last_ step — instead of writing that converted font data into the throwaway generated package (which gets discarded once a template is in play), it's handed to `mergeTemplate()`, which folds it into the **template's own** `presentation.xml`:

- `<p:embeddedFontLst>` is found if the template already has one (real corporate templates that were themselves saved with embedded fonts do), or created at the schema-correct position in `<p:presentation>`'s child list (per ECMA-376 §19.2.1.26 — right after `sldSz`/`notesSz`, before `custShowLst`/`defaultTextStyle`/etc. if present) — never just appended at the end regardless of what else is there.
- Deduplicated by **(typeface, variant)**: a font the template already has embedded for a given style slot (regular/bold/italic/boldItalic) is never re-embedded, overwritten, or duplicated. A _new_ variant for an _already-declared_ typeface is added into that same `<p:embeddedFont>` block (schema-ordered: `font, regular, bold, italic, boldItalic`) rather than creating a second, conflicting block for that family.
- New font files are written as `ppt/fonts/fontN.fntdata`, numbered past whatever `fontN.fntdata` files the template already contains (matching the naming convention real PowerPoint itself uses when saving embedded fonts).
- New relationship IDs are allocated from the same collision-free counter used for the new slides — i.e. one past the template's actual highest existing `rId`, whatever that already is. Relationship IDs are never assumed to start from a fixed number.

## Public API

```js
import { exportToPptx, getTemplateLayouts } from 'dom-to-pptx';

await exportToPptx(
  [
    { element: slide1, baseLayout: 'Content Light' },
    { element: slide2, baseLayout: 'Section Dark' },
  ],
  {
    template: './corporate-template.pptx',
    // Optional: layout used for any slide that doesn't specify baseLayout.
    // Falls back to the template's first declared layout if omitted.
    defaultBaseLayout: 'Content Light',
    // Embedded fonts work together with `template` — either explicitly:
    fonts: [{ name: 'Corporate Font', url: 'https://.../corporate-font.woff2' }],
    // ...or via dom-to-pptx's normal automatic @font-face detection
    // (autoEmbedFonts, on by default) — no extra configuration needed.
  }
);
```

- `target` array entries can still be plain elements or CSS selector strings exactly as before (fully backward compatible) — or a `{ element, baseLayout }` descriptor when you need to pick a layout for that specific slide.
- `options.template` — a URL string (fetched with `fetch`), or raw bytes (`ArrayBuffer` / `Uint8Array` / `Blob`). `exportToPptx` always runs inside a browser/jsdom/puppeteer-page context, so it has no filesystem access; see **Node / CLI usage** below for local file paths.
- `options.defaultBaseLayout` — layout name applied to any slide that didn't specify `baseLayout`.

Optional introspection helper (only implemented because it was nearly free once `readTemplate` existed):

```js
const layouts = await getTemplateLayouts('./corporate-template.pptx');
// [{ id: 'ppt/slideLayouts/slideLayout1.xml', name: 'Content Light' },
//  { id: 'ppt/slideLayouts/slideLayout2.xml', name: 'Section Dark' }]
```

## Layout reference: name vs. `rId` vs. part path

Three options were considered for how a caller identifies "which layout":

- **`rId`** (e.g. `rId23`) — rejected. A relationship ID is local to one specific `.rels` file and has no meaning outside it; it isn't even stable across two different exports of the _same_ template if PowerPoint re-saves it.
- **OOXML part path** (e.g. `ppt/slideLayouts/slideLayout3.xml`) — technically stable and unambiguous, but meaningless to anyone not looking at the raw zip contents, and layout numbering can change if the template file is re-saved by PowerPoint.
- **Layout name** (e.g. `"Content Light"`, from `<p:cSld name="...">`, the same name PowerPoint shows in its own layout picker UI) — chosen as the **public** API, because it's what a human (or a calling application's own config) actually references.

Internally, `readTemplate()` resolves each layout's name to its **part path** once per export and uses the part path as the technically robust reference for the rest of the merge — the name is purely a lookup key, never propagated further into the OOXML surgery. This is why `getTemplateLayouts()` returns both `id` (part path) and `name`.

## Slide size

When `template` is set and the caller didn't pass an explicit `width`/`height` (or `layout`), the export automatically adopts the template's own declared `<p:sldSz>` for all coordinate math. This isn't cosmetic: the template's `presentation.xml` — including its real `sldSz` — is preserved as-is by the merge, so if dom-to-pptx computed shape positions against a _different_ canvas size, shapes would land at the wrong scale relative to the real background. An explicit `options.width`/`options.height` still takes priority if you deliberately want a mismatch.

## Default layout (no `baseLayout` given)

1. `options.defaultBaseLayout`, if set.
2. Otherwise, the template's **first declared layout** (the first `<p:sldLayoutId>` in `slideMaster1.xml`'s `sldLayoutIdLst` — i.e. the first `slideLayoutN.xml` file, in numeric order). Deterministic and documented, not a content-based heuristic.

## Error handling

An unknown `baseLayout` name throws immediately (validated per-slide, before rendering starts, not only at the final merge step):

```
Error: dom-to-pptx: PowerPoint layout "does-not-exist" was not found in template. Available layouts: "Content Light", "Section Dark"
```

## Node / CLI usage

`exportToPptx` itself never touches the filesystem. For Node usage (`node-exporter.js`, and the `dom-to-pptx-exporter` / `dom-to-pptx export` CLIs), a local file path given as `template` is read from disk on the Node side and forwarded into the headless page as raw bytes — this is symmetric with how the CLI already injects its own browser bundle from disk.

```bash
dom-to-pptx-exporter slides.html --template ./corporate-template.pptx --base-layout "Section Dark"
```

The CLI selects slides purely by CSS selector, so it has no way to assign a _different_ layout to each individual slide — `--base-layout` (mapped to `defaultBaseLayout`) applies uniformly to every slide the CLI exports. Per-slide layout selection (`{ element, baseLayout }`) is a programmatic-API-only feature.

## Known limitations

- The template's existing slides (if it has any) are left in place; new slides are always appended after them. If you hand in a template that already contains real content slides, they'll still be there in the output.
- Layout names must match exactly (case-sensitive) and should be unique within the template; if two layouts share a name, the first one (in file order) wins.
- Embedded-font deduplication is keyed on the exact `(typeface name, variant)` pair. If the template already embeds "Corporate Font" Regular under that exact family name, a newly requested "Corporate Font" Regular is recognized as the same font and not re-embedded; a font declared under a different CSS family name (even if visually identical) is treated as distinct, same as PowerPoint itself would.
- This feature does not validate the template against the full OOXML schema — a template produced by PowerPoint itself (the overwhelmingly common case) works; a hand-crafted or otherwise unusual package might not.
