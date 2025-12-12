# Changelog

All notable changes to this project will be documented in this file.

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
