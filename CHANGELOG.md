# Changelog

All notable changes to this project will be documented in this file.

## [1.1.4] - 2026-01-19

### Added

- **Tailwind CSS v4 Support**: Added robust color parsing for modern CSS color formats (e.g., `oklch`, `lab`, `display-p3`) used by Tailwind v4. The library now uses canvas-based normalization to support any valid CSS color.
- **Text Gradient Fallback**: Text with CSS gradients (e.g., `background-clip: text`) now gracefully falls back to the _first color_ of the gradient string instead of rendering as invisible or black.
- **List Marker Customization**: Support for `::marker` pseudo-element styles. Custom bullet colors and font sizes are now preserved in the generated PowerPoint.

### Fixed

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
