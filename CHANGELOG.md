# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **Text Stroke as Text Outline**: `getTextStyle` in `src/utils.js` maps CSS `-webkit-text-stroke` to the PptxGenJS `outline` text option, so stroked text exports with a native PowerPoint text outline (`<a:ln>`) instead of losing it. Width converts like `font-size` (px × 0.75 × scale); fully transparent strokes are skipped, and translucent stroke colors export opaque because PptxGenJS writes the outline color without alpha (#74).

## [2.1.2] - 2026-09-14

### Added

- **Dedicated Margin Normalization Constructors**: Added `createShapeMargin(top, right, bottom, left)` and `createTableCellMargin(top, right, bottom, left)` in `src/utils.js`. Callers consistently provide standard CSS box-model `(top, right, bottom, left)` parameters; the helpers normalize to PptxGenJS's internal requirements (`[left, right, bottom, top]` for shapes and text boxes; `[top, right, bottom, left]` for table cells).
- **Cross-Origin `@import` Stylesheet Font Detection**: Added `parseImportUrlsFromCssText` in `src/utils.js` and updated `getAutoDetectedFonts` fallback scanning to recursively discover and fetch `@import` stylesheet chains with cycle prevention, extracting `@font-face` definitions declared within nested cross-origin CSS files.
- **Exported Text-Container Cache Memoizer**: Exported `isTextContainerCached(node, cache)` from `src/utils.js` alongside comprehensive unit tests in `src/__tests__/text-container-cache.test.js`, verifying $O(N)$ text-container classifications and cache isolation across export lifecycles.

### Fixed

- **Relative Font Resolution in Headless & jsdom Environments**: Resolved relative font URL failures when stylesheet paths are relative (e.g. `assets/deck.css`) by anchoring `rawBase` against `document.baseURI` or `window.location.href` via `resolveCssUrl`, preventing WHATWG `TypeError: Invalid base URL` exceptions during font embedding.
- **Styled Badge & Pill Shape Preservation**: Fixed DOM text container classifier (`isSafeInline`) in `src/utils.js` to treat elements with visible borders or `border-radius` as independent shapes rather than swallowing them into parent text containers as flat text runs, ensuring rounded badge/pill elements retain their native PowerPoint `roundRect` geometry, borders, insets, and fill styling.
- **Hierarchical Sub-Bullet Indentation in Lists**: Fixed sub-bullet list formatting where sub-items (e.g. `<li class="sub">` or indented nested items) had their text indented but the bullet glyph remained anchored at the left margin. Mapped visual indent offsets to native OpenXML paragraph `indentLevel` (`<a:pPr lvl="X">`) while maintaining standard bullet spacing (`bullet.indent`), shifting both bullet glyph and text content rightward in unison as expected in PowerPoint.

## [2.1.1] - 2026-07-21

### Fixed

- **Default Font Auto-Embedding**: Fixed `autoEmbedFonts` option in `src/index.js` to evaluate `options.autoEmbedFonts !== false`, ensuring automatic font scanning and embedding runs by default as documented without needing manual configuration.
- **Cross-Origin Stylesheet Font Scanning Fallback**: Fixed font auto-detection when Google Fonts or external stylesheets are included via HTML `<link rel="stylesheet">` tags missing `crossorigin="anonymous"`. Added asynchronous `fetch()` fallback scanning in `getAutoDetectedFonts` and `@font-face` CSS string parser in `src/utils.js` so custom web fonts embed into PPTX presentations reliably regardless of CORS markup restrictions.

## [2.1.0] - 2026-07-21

### Added

- **Presentation Speaker Notes (`data-pptx-notes`)**: Added automatic extraction of presentation speaker notes from HTML elements carrying the `data-pptx-notes` attribute (or root slide containers). Speaker notes populate directly into generated PowerPoint slide notes (#58).
- **Hybrid Pseudo-Element Engine (`::before` / `::after`)**: Implemented a hybrid pseudo-element engine in `src/index.js` that renders standard text/shapes/gradients as native PPTX items/SVG vectors, while capturing complex CSS shapes (`width: 0` border triangles, parallelograms, hexagons, clip-paths, speech bubbles, ribbons) using `html2canvas` for 100% pixel-perfect rendering (#60).
- **Disable Pseudo-Element CLI Flag (`--no-pseudo`)**: Added a `--no-pseudo` CLI flag and `includePseudoElements` option (`default: true`) allowing users and AI coding assistants to disable pseudo-element processing to prevent hover state conflicts or icon collisions (#60).
- **Custom Viewport Dimensions**: Added `--browser-width` (`--bw`) and `--browser-height` (`--bh`) CLI flags to customize headless Puppeteer viewport resolution during export.

### Fixed

- **Custom Slide Dimensions in Exporter CLI**: Resolved an issue where custom `--width` and `--height` CLI parameters were ignored by the PPTX engine. Added automated XML package verification (`ppt/presentation.xml`) and logged effective slide size in CLI completion output (#61).
- **Font Embed Hardening**: Hardened automatic font embedding (`autoEmbedFonts`) against `@import` directives, CORS restrictions, silent network failures, and font variant slot collisions (#57).
- **Headless Exporter File Access**: Enabled `--allow-file-access-from-files` by default in the Puppeteer launcher to allow seamless local `.ttf` and `.woff2` font embedding without CORS errors (#55).
- **Inline SVG Preservation**: Fixed inline SVG element rendering inside text containers and resolved an `SVGAnimatedString` `className` crash (#59).
- **Inline Badge Highlights & Animation Timing**: Resolved highlight loss on inline badge elements and fixed missing build list entries for non-textbox shapes in animation timing blocks (#59).

## [2.0.3] - 2026-07-05

### Fixed

- **Bullet formatting**: Assigned bullet formatting directly to the first text run, restoring correct bullet rendering while preserving per-bullet font face, size, and color styling.
- **Bullet indentation**: Filtered subpixel layout noise, restored `bullet.indent` compatibility with modern PptxGenJS, and added a standard fallback indent when no explicit offset is detected.
- **Translucent backgrounds and borders**: Fixed rendering of semi-transparent table cell backgrounds and borders by flattening colors against their DOM backdrop. Standard shapes now preserve border transparency during PowerPoint export.
- **Embedded font variants**: Fixed automatic font embedding to preserve `@font-face` weight and style variants. PowerPoint now embeds and maps Regular, Bold, Italic, and Bold Italic fonts correctly, preventing synthetic bold rendering for multi-weight font families.
- **SVG animation parsing**: Fixed animation parsing for inline SVG elements by using `classList` instead of `className`, preventing export failures caused by `SVGAnimatedString` and ensuring SVG icons and illustrations export correctly.

## [2.0.2] - 2026-06-30

### Fixed

* **Incorrect CLI command in documentation**: The documented command `npx dom-to-pptx-export` does not exist. The root `package.json` only defines the following binaries:

  * `dom-to-pptx`
  * `dom-to-pptx-exporter`
  * `dom-to-pptx-skills`

  Updated the following files:

  * `skills/dom-to-pptx-skill/SKILL.md` (lines 75, 79)
  * `skills/dom-to-pptx-skill/reference/TEMPLATE.md` (lines 394, 397)
  * `skills/dom-to-pptx-skill/reference/SAFE_HTML_TEMPLATE.md` (lines 219, 222)

  Replaced `npx dom-to-pptx-export` with:

  * `npx dom-to-pptx-exporter` (package binary)

  aligning the documentation with the usage shown in `README.md`, `USAGE.md`, and `packages/dom-to-pptx-exporter/README.md`.

## [2.0.1] - 2026-06-21

### Added

* **Workspace monorepo layout**: Reorganized the repository as a `pnpm` workspace.
* **Standalone npm packages**: Added the `dom-to-pptx-skills` and `dom-to-pptx-exporter` packages, enabling direct execution from the npm registry via:

  * `npx dom-to-pptx-skills`
  * `npx dom-to-pptx-exporter`

### Fixed

- **Wipe Exit Preview Directions**: Resolved swapped `@keyframes` for exit directions (`wipe-out-to-left`, `wipe-out-to-right`, `wipe-out-to-up`, and `wipe-out-to-down`) in `animations.css` to accurately preview exit animations in-browser.
- **Animation Timing Fallbacks**: Standardized default fallback animation durations in `css-parser.js` to `1000ms` (1.0s) and `animations.css` to `500ms` (0.5s) to match native PowerPoint default timings.

## [2.0.0] - 2026-06-20

### Added

- **Native Animations & Transitions**: Natively translates CSS animation/transition classes directly into PowerPoint presentation motion assets:
  - **20+ Element Animations**: Supports entrance and exit animations including `fade-in`, `zoom-in`, `fly-in`, and `wipe-in` with directional modifiers (`to-up`, `to-down`, `to-left`, `to-right`).
  - **70+ Slide Transitions**: Seamless slide-to-slide transition support (fade, push, wipe, gallery, doors, zoom, bounce, and more).
  - **Choreography & Triggers**: Control order and timing of animations via `animate-trigger-on-click`, `animate-trigger-with` (simultaneous), or `animate-trigger-after` (sequential chain), plus custom durations/delays.
  - **Creative Builds**: Character-by-character reveals (`letter` mode) and paragraph-by-paragraph reveals (`paragraph` mode) for structured narrative presentation styles.
  - **In-Browser Preview**: Real-time CSS files (`animations.css` and `transitions.css`) with a JS helper `domToPptx.applyBrowserAnimations()` to accurately preview element animations in the browser prior to export (note: slide-to-slide transitions are not previewed in-browser).
- **Unified & Specific CLI Binaries**: Adds a clean suite of CLI binaries under the main package execution options:
  - `dom-to-pptx`: A unified entrypoint router allowing `dom-to-pptx export` or `dom-to-pptx skills`.
  - `dom-to-pptx-exporter` / `dom-to-pptx export`: Headless CLI tool using a self-managing Puppeteer-based server exporter to convert HTML files or URLs directly to PPTX files from terminal.
  - `dom-to-pptx-skills` / `dom-to-pptx skills`: Interactive installer to instantly configure optimized agent presentation engineering skills for Claude Code, Gemini CLI, Cursor, and Windsurf.
- **Woff2 Font Format Support**: Natively parses and handles `.woff2` font resources:
  - Resolves `NO GLYPH` and duplicate unicode index errors during font merging.
  - Base64-inlines the underlying WASM decoder directly into the code distribution for a zero-dependency setup.
- **Vertical Text & Rotation Support**: Implements support for vertical layout writing modes (`vertical-rl` / `vertical-lr`) and text rotation in cells, paragraphs, and list containers.
- **Formatting, Linting & Style Audit**: Added `.editorconfig`, `.vscode/settings.json`, and `.markdownlint.json`. Enhanced ESLint config to use `@eslint/markdown` for linting code blocks inside `.md` documentation.

### Fixed
- **`white-space: pre` / `pre-wrap` / `pre-line` newline preservation**: Fixed a bug where newlines/tabs inside `<pre>` or custom preformatted containers collapsed into a space. Indentation, tabs, and line breaks are now accurately preserved.
- **PowerPoint XML Corruption & Warnings**: Resolved slide repair errors in PowerPoint by wrapping modern transitions in `AlternateContent` compatibility fallbacks, registering namespaces correctly, and enforcing bullet property exclusivity.

## [1.1.10] - 2026-06-01

### Added

- **CSS Pseudo-Element Text Content Support**: Extended the pseudo-element parser (`::before` / `::after`) to extract, clean, style, and render custom text content (e.g., `content: "★"`). This text is embedded as a native PowerPoint text container with full support for font sizes, colors, and borders/backgrounds.
- **Handled Known Limitations**: Resolved advanced scenarios:
  - **OOXML Schema Corrections**: Merges duplicate paragraph properties (`<a:pPr>`) and maintains strict DrawingML child ordering.
  - **Missing OOXML Features**: Resolves letter spacing (`spc`) and stacking order (`z-index`) via custom font/name transport suffixes (`__spc_` and `__z_`) and normalizes XML files post-serialization.
  - **CSS-Only Visuals**: Handles micro-decorations (dots) down to `0.5px`, maps absolute/matrix transformations for pseudo-elements, and routes CSS shapes (e.g. `--shape-type: triangle`) to native PPTX ShapeType elements.
  - **Slide-Aspect Matching**: Defines custom layouts (`AUTO_DESIGN`) dynamically matching design aspect ratios.
  - **Layout Primitives**: Integrates layout measurements directly via computed coordinates (`getBoundingClientRect()`) to elegantly support flex, grid, and inline-block boxes.

### Fixed

- **Clipped Div Canvas Rendering Bug**: Resolved a silent bug where clipped divs with partial border-radius were not being captured via canvas because the promise-returning job was not correctly assigned to `bgJob` during DOM traversal.
- **ESLint Integration**: Resolved configuration and package resolution issues with ESLint 9 by adding missing `globals` and `@eslint/js` devDependencies. Cleaned up multiple redundant code paths and unused variables across the codebase.

## [1.1.9] - 2026-05-16

### Added

- **Native Hyperlink Support**: Implemented recursive hyperlink extraction for `<a>` tags. Maps `href` to PowerPoint URLs and `title` attributes to native tooltips.
- **Flexbox Axis-Swap Intelligence**: Added `flex-direction` aware alignment. Centering now works correctly for both `row` and `column` flex containers by dynamically swapping `align`/`valign` axes based on the main-axis orientation.
- **Expanded Text Tag Support**: Added `CENTER`, `P`, and `H1-H6` to the "safe text" whitelist, allowing these elements to render as single unified PowerPoint shapes rather than fragmented items.
- **Enhanced Agentic Skills (v2.0)**: Re-architected the `dom-to-pptx-skill` into an autonomous presentation engineering framework.
  - **Atmospheric UI Engine**: Codified premium design philosophies (Luminous Bias, Spatial Tension, Materiality) into the skill directives.
  - **Multi-Phase Workflow**: Added mandatory phases for Content Intelligence, Theme Engineering, and Pre-Export Validation.
  - **Local Image Strategy**: Implemented automated local image generation and management using the `images/` directory workflow.

### Fixed

- **Hyperlink Text Styling**: Fixed a bug where text inheriting a hyperlink (from a parent `<a>` tag) was not inheriting the parent's text styling (e.g., font, size, color).
- **Microsoft PowerPoint Compatibility**: Resolved a critical issue where dangling `[Content_Types].xml` overrides and `STORED` zip formats caused PowerPoint to reject files. All exports are now normalized and re-zipped with `DEFLATE`.
- **Vertical Text Optimization**: Resolved character spacing gaps in vertical writing modes (`writing-mode: vertical-rl/lr`) and corrected alignment axis mapping for vertical text blocks.
- **Text Wrap & Width Buffer**: Implemented sub-pixel rect sizing for unrotated elements, preserve offset sizing for rotated elements, floor font sizes to 0.1pt, and add a 1.5% text width buffer to prevent cross-platform wrapping differences.
- **Redundant Spacing Fix**: Fixed a bug where root element margins were double-applied as internal paragraph spacing. standalone text boxes now align perfectly with their DOM counterparts.
- **Options**: A new `options.skipNormalize` (default `false`) escape hatch is available for debugging the raw PptxGenJS output.
- **Full Opacity Inheritance**: Implemented accumulated opacity tracking during DOM traversal, ensuring nested elements and text runs correctly reflect the transparency of parent containers.

## [1.1.8] - 2026-05-03

### Added

- **AI Skills Installer (CLI)**: Added `npx dom-to-pptx-skills` interactive installer to automatically distribute professional PPT creation skills to Claude Code, Gemini CLI, Windsurf, and Cursor.
- **Smart Agent Auto-Detection**: CLI now scans the home directory to detect installed AI agents and suggests appropriate installation paths.
- **Premium Design Themes**: Integrated 6 new high-fidelity visual presets (Neo-Brutalism, Soft Pastel, Swiss Minimalism, Nature Eco, Luxury Noir, Cyberpunk Neon) into the skill library.
- **Structured Prompt Architecture**: Re-architected `SKILL.md` with a "Principal Visual Engineering Director" persona and XML-like `<SLIDE_CONFIG>` templates to improve performance on low-end AI models.
- **Vertical-Align CSS Support**: Implemented support for the `vertical-align` property. Text can now be explicitly aligned to the `middle` or `bottom` of its container, matching browser rendering.

### Fixed

- **XML Namespace Corruption**: Resolved a critical issue where font embedding generated invalid OpenXML tags in the null namespace. Switched to explicit `createElementNS` and `setAttributeNS` with standard OOXML namespaces to ensure PPTX file integrity.
- **Vertical Alignment Regression**: Fixed an issue where text in tall block elements (like `<p>` or `<div>` with fixed heights) was incorrectly middle-aligned by default. Standard block elements now correctly default to top-alignment unless flex centering or explicit `vertical-align` is used.
- **Centered Padding Logic**: Removed aggressive logic that zeroed out padding when text was centered; padding (insets) is now correctly preserved and combined with alignment.

## [1.1.7] - 2026-04-21

### Added

- **Native URL Background-Image**: Extended CSS extraction to organically parse `background-image: url('...')` blocks, leveraging CSS properties like `background-size` directly into the PPTX image crops.

### Fixed

- **Fractional Font Precision**: Abandoned destructive rounding when resolving HTML pixel layouts into PPTX typographical points (`pt`), enabling accurate 1/10th decimal scaling for accurate small font conversions.
- **AutoFit CJK Word Wraps**: Swapped out hard bounding boxes on textual spans to inject `<a:spAutoFit/>`, letting PowerPoint actively grow the block bounds when fluid lines or CJK formats forcefully wrap beyond the original Chrome layout metric.
- **Table Nested Text Line Breaks**: Remapped logic blocking structural line wrapping (e.g. `<br>`, `<div>`) within nested `<td/th>` wrappers preventing paragraph-mushing over complex table schemas.
- **Vertical Flow Orientation**: Fixed CSS `writing-mode` matching. Dynamically routes explicit `vertical-lr` and `vertical-rl` coupled with CSS `text-orientation: upright` specifically into their exact PowerPoint vertical equivalents.
- **Corrupt PPTX Fix (rectRadius)**: Resolved a critical "corrupt presentation" error caused by passing raw ratios for `rectRadius` to PptxGenJS. The library now calculates and passes absolute inch values capped at 50% for maximum stability.

### Changed

- **Documentation Standards**: Extensively published guidelines establishing CSS `grid`/`flex` layout priority over restrictive legacy `table` parameters in SUPPORTED.md.

## [1.1.6] - 2026-04-05

### Added

- **Portrait & Custom Layouts**: Implemented support for portrait view and custom slide dimensions via `width`, `height`, and `layout` options in `exportToPptx`.
- **Advanced Table Typography**: Added support for `text-transform` (uppercase, lowercase, capitalize) and `letter-spacing` (charSpacing) in table cells and nested text.
- **Table Cell Gradient Fallback**: Table cells with background gradients now automatically extract and use a fallback color.

### Fixed

- **Table Rendering Precision**: Resolved rendering issues by aligning cell border formats with the PptxGenJS positional array API `[top, right, bottom, left]`.
- **Border Naming**: Fixed border property naming from `style` to `type` as required by PptxGenJS v3.
- **Table Layout**: Improved `colWidths` calculation to correctly handle `colspan` during layout extraction.
- **Rich Text in Cells**: Refactored cell text extraction to recurse into child nodes, preserving nested formatting (bold, color, etc.) as native rich text runs.

### Changed

- **Refactored Text Extraction**: Moved `collectListParts` to `utils.js` as `collectTextParts` to be shared between list and table processing.

## [1.1.5] - 2026-02-07

### Added

- **SVG Vector Export**: New `svgAsVector` option keeps SVG elements as vectors instead of rasterizing them to PNG. This enables "Convert to Shape" in PowerPoint for fully editable charts and graphics.

### Fixed

- **Recursion Logic** Resolved recursion issues where containers with partial border-radius (like `.glass-box`) were incorrectly rasterized as images, making children uneditable.
- **Fontawesome Icon partially rendering:** Solved icon clipping issues by injecting a global style tag to enforce FontAwesome font family and correct image display properties during potential rasterization.

### Changed

- **Code Refactoring**: Extracted `inlineSvgStyles` for better style consistency between raster and vector exports.

## [1.1.4] - 2026-01-19

### Added

- **Tailwind CSS v4 Support**: Added robust color parsing for modern CSS color formats (e.g., `oklch`, `lab`, `display-p3`) used by Tailwind v4. The library now uses canvas-based normalization to support any valid CSS color.
- **Text Gradient Fallback**: Text with CSS gradients (e.g., `background-clip: text`) now gracefully falls back to the _first color_ of the gradient string instead of rendering as invisible or black.
- **List Marker Customization**: Support for `::marker` pseudo-element styles. Custom bullet colors and font sizes are now preserved in the generated PowerPoint.

### Fixed

- **AutoFit CJK Word Wraps**: Swapped out hard bounding boxes on textual spans to inject `<a:spAutoFit/>`, letting PowerPoint actively grow the block bounds when fluid lines or CJK formats forcefully wrap beyond the original Chrome layout metric.
- **Text Alignment**: Fixed an issue where text containers were slightly shorter than browser rendering, causing overlap with subsequent elements. Added a precision buffer to account for font metric differences.
- **Line Breaks**: Fixed an issue where `<br>` tags with surrounding whitespace caused double line breaks in the output.
- **Missing Elements (Cone Fix)**: Fixed a bug where empty elements with solid backgrounds and partial border radii (e.g., decorative shapes) were skipped during rasterization. We now generate a high-fidelity Vector SVG for these shapes.
- **Inline Badges**: Improved flow for inline elements with backgrounds (badges), ensuring they align correctly with surrounding text.

## [1.1.3] - 2026-01-12

### Added

- **Table Supprt**: Added support for table elements like `<table>`, `<th>` `<td>`, `<tr>` with basic css formatting.

## [1.1.2] - 2026-01-08

### Added

- **Canvas Support**: Added support for `<canvas>` elements. Libraries like **ECharts** and **Chart.js** now render correctly as images instead of blank spaces.
- **Backend Upload Support**: Added `skipDownload` option to `exportToPptx`. The function now returns a `Promise<Blob>`, allowing developers to upload the generated file to a server instead of triggering a browser download.
- **List Configuration**: Added `listConfig` option to manually override bullet colors and spacing (before/after) globally.
- **Icon Support in Lists**: Added logic to capture pseudo-element content (`::before`), ensuring icons (e.g., FontAwesome) inside list items are rendered correctly.

### Fixed

- **Native Lists**: HTML `<ul>` and `<ol>` lists are now rendered as a single native PowerPoint text box with real bullets, rather than disconnected text shapes.
- **Line Height Calculation**: Fixed an issue where pixel-based CSS `line-height` was interpreted as a multiplier in PowerPoint, causing text to overlap or crush.
- **Paragraph Spacing**: CSS `margin-top` and `margin-bottom` are now correctly converted to PowerPoint points (`paraSpaceBefore` / `paraSpaceAfter`).
- **List Item Spacing**: Fixed a bug where list items had double line breaks, causing excessive spacing between bullets.

## [1.1.1] - 2026-01-02

### Fixed

- Resolved an issue where ordered (`<ol>`) and unordered (`<ul>`) lists were not rendered correctly in exported PPTX files. (Fixes #8)
- Corrected geometric shape rendering issues related to absolute positioning and percentage-based sizing to ensure accurate layout in PPTX exports. (Fixes #6)
- Fixed text box width calculation discrepancies that caused incorrect line breaks and text wrapping in PPTX output. (Fixes #5)

## [1.1.0] - 2025-12-29

### Added

- **Automatic Font Discovery:** The library now automatically scans the DOM for used font families, extracts their `@font-face` URLs from the document stylesheets, and embeds them into the PPTX file; Addresses Feature Request [#4].
- **Custom Font Embedding:** Added support for manually embedding web fonts (TTF, WOFF, OTF).
- **Font Configuration:** Added `fonts` option for manual font URLs and `autoEmbedFonts` (default: `true`) to toggle automatic detection.

### Changed

- **Build Configuration:** Updated Rollup build to include necessary Node.js polyfills (Buffer, Stream) for the browser bundle to support binary font manipulation.
- **Text Detection:** Improved `isTextContainer` logic to better distinguish between pure text nodes and structural inline elements (like icons or styled spans).

## [1.0.9] - 2025-12-28

### Fixed

- **Complex Gradients:** Fixed `linear-gradient` parsing to correctly support degree-based angles (e.g., `45deg`) and complex directional keywords (e.g., `to top right`), ensuring background gradients match the CSS exactly.
- **Icon Visibility:** Fixed an issue where icons (Font Awesome, Material Icons, etc.) nested within list items or text containers were being treated as empty text and failing to render, fixes [#3].

## [1.0.8] - 2025-12-12 (Hot-Patch)

### Fixed

- **Fixed SVGs not getting converted**: Seperated the logic to handle SVGs and Web Components/Icons.

## [1.0.7] - 2025-12-12

### Fixed

- **Fix Stacking Context/Z-Index**: Implemented logic to traverse and inherit Z-index from parents. Render queue is now sorted by Z-index then DOM order, preventing text from being hidden behind background cards.
- **Support Web Components/Icons**: Updated `createRenderItem` and `isTextContainer` to recognize `ion-icon` and custom tags. These are now rasterized via canvas rather than ignored.
- **Fix Mixed Content (Icons + Text)**: Switched main traversal loop to use `childNodes` instead of `children`. Added specific handler for `nodeType === 3` (Text Nodes) to render orphan text residing next to icons/shapes.
- **Fix Styled Inline Spans (Badges)**: Updated `isTextContainer` to return `false` if children have visible backgrounds or borders. This ensures elements like "Pune/Vashi" badges render as individual styled shapes instead of flattening into unstyled text runs.

## [1.0.6] - 2025-12-06

### Added

- Standalone UMD bundle `dist/dom-to-pptx.bundle.js` which includes runtime dependencies for single-script usage.
- `SUPPORTED.md` listing common supported HTML elements and CSS features.

### Fixed

- Rounded corner math: decreased false-positive circle detection and capped `rectRadius` to avoid pill-shaped elements becoming full circles.
- Partial border-radius clipping: elements inside `overflow:hidden` are now correctly rendered with clipping preserved.
- Very small elements (sub-pixel) rendering: lowered threshold to include tiny decorative elements (e.g., 2x2 dots).
- Backdrop blur support: simulated `backdrop-filter: blur()` using html2canvas snapshotting.
- CORS canvas errors: replaced fragile foreignObject rendering with safer SVG + canvas or html2canvas-based capture where appropriate.

## [1.0.3] - Previous

- Minor fixes and optimizations.
