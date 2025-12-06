# Supported CSS & HTML

This document lists the common CSS features, Tailwind-like utility classes, and HTML elements that dom-to-pptx understands and maps to PowerPoint shapes/text.

Note: The library measures computed layout from the browser (getBoundingClientRect) and maps positions/sizes precisely to PPTX inches. If a CSS feature is not listed below it may still work because the browser computes layout and visual styles — the mapping focuses on visual fidelity.

## Supported HTML elements

- div, span, p, h1-h6
- img, svg
- ul, ol, li
- a
- button
- section, article, header, footer
- input (text), textarea (simple text extraction)
- figure, figcaption

## Supported CSS properties (rendered visually)

- background-color, background-image (linear-gradient)
- background-position, background-size (basic handling in gradients)
- color, opacity
- border, border-*-color, border-*-width, border-radius (per-corner)
- box-shadow (outer shadows mapped to PPTX outer shadows)
- filter: blur() (soft-edge rendering via SVG)
- backdrop-filter: blur() (simulated via html2canvas snapshot)
- transform: rotate() (extraction of rotation angle)
- display, position, width, height, padding, margin
- text-align, vertical-align, white-space, text-transform
- font-family, font-size, font-weight, font-style, line-height

## Common utility/Tailwind-like classes (recognized by visual result)

These classes are examples; dom-to-pptx reads computed styles, so any combination that results in the same computed value will be supported.

- `rounded`, `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-full`, `rounded-tr-*`, `rounded-bl-full`, etc.
- `bg-white`, `bg-slate-50`, `bg-indigo-50`, `bg-gradient-to-r`, `from-indigo-400`, `to-cyan-400`, etc. (linear-gradients are parsed)
- `shadow`, `shadow-md`, `shadow-lg`, `shadow-2xl` (box-shadow)
- `flex`, `grid`, `items-center`, `justify-center`, `gap-*`
- `p-4`, `px-6`, `py-2`, `m-4`
- `w-*`, `h-*` (fixed pixel/percentage/wrappers — computed width/height are used)
- `text-xs`, `text-sm`, `text-lg`, `font-bold`, `uppercase`, `italic`, `tracking-wide`

## Limitations

- Complex CSS animations/transitions are not exported — only the current computed visual state is captured.
- Some advanced CSS features (CSS variables used as colors, filters beyond blur) may not map 1:1.
- For images to be processed via canvas (rounded images), the source must be CORS-accessible (`Access-Control-Allow-Origin` header) or the image will be skipped or rendered as-is.

If a style or element is critical and you find it not behaving as expected, open an issue with a minimal repro and I'll add support or provide a workaround.
