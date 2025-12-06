# Changelog

All notable changes to this project will be documented in this file.

## [1.0.4] - 2025-12-06
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
