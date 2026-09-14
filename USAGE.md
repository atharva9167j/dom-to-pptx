# dom-to-pptx Usage Guide

This document summarizes the best practices and considerations for exporting HTML to PowerPoint using `dom-to-pptx`.

## Quick Start

### Installation

```bash
npm install dom-to-pptx
```

### Basic Usage

```javascript
import { exportToPptx } from 'dom-to-pptx';

// Single Slide
await exportToPptx('#slide-container', {
  fileName: 'presentation.pptx',
});

// Multiple Slides
const slides = document.querySelectorAll('.slide');
await exportToPptx(Array.from(slides), {
  fileName: 'multi-slides.pptx',
});
```

### Browser Direct Usage (CDN)

```html
<script src="https://cdn.jsdelivr.net/npm/dom-to-pptx@latest/dist/dom-to-pptx.bundle.js"></script>
<script>
  await domToPptx.exportToPptx('#slide', { fileName: 'slide.pptx' });
</script>
```

## Command Line Interface (CLI)

`dom-to-pptx` ships with a command-line interface suite offering both a unified entry point and specific commands for headless rendering and agent integration. The unified router `dom-to-pptx` command is **preferred and recommended** over standalone commands.

### 1. Unified Router (`dom-to-pptx`) [RECOMMENDED]

`dom-to-pptx` is the generic, unified command that delegates work to specific CLI subcommands.

```bash
# General help
npx dom-to-pptx --help

# Install skills (routes to dom-to-pptx-skills)
npx dom-to-pptx skills

# Export slide headlessly (routes to dom-to-pptx-exporter)
npx dom-to-pptx export slides.html [options]
```

### 2. Standalone Headless Exporter CLI (`dom-to-pptx-exporter`)

`dom-to-pptx-exporter` is the standalone command to headlessly render local HTML files or remote URLs into PowerPoint presentations. It uses Puppeteer to spin up a headless browser, injects the browser bundle if needed, traverses the DOM, and outputs the final `.pptx` file.

```bash
# Specific CLI usage:
npx dom-to-pptx-exporter <htmlFileOrUrl> [options]

# Example:
npx dom-to-pptx-exporter slides.html --output output.pptx -s ".slide"
```

**Options (applicable for both `dom-to-pptx export` and `dom-to-pptx-exporter`):**

- `--output, -o <path>`: Set custom output path (defaults to same folder as input).
- `--selector, -s <css>`: CSS selector for slide container elements (defaults to `.slide`).
- `--inject`: Force-inject the local browser bundle into the page context (needed if the source HTML doesn't bundle `dom-to-pptx` itself).
- `--title <text>`: Add slide presentation title metadata.
- `--author <text>`: Add slide presentation author metadata.
- `--width <number>`: Set slide width in inches (default: `10`).
- `--height <number>`: Set slide height in inches (default: `5.625`).
- `--no-pseudo`: Disable exporting CSS pseudo-elements (::before/::after).
- `--template <path>`: Base the export on an existing `.pptx` so slides inherit its real slideLayout/master background. See [`docs/template-support.md`](docs/template-support.md).
- `--base-layout <name>`: Layout name from `--template` applied to every exported slide (the CLI has no way to assign a different layout per slide — that's a programmatic-API-only feature).

### 3. Standalone AI Skills Installer CLI (`dom-to-pptx-skills`)

`dom-to-pptx-skills` is the specific standalone interactive installer that sets up AI presentation engineering skills in your environment. It auto-detects installed coding agents like Claude Code, Gemini CLI, Cursor, and Windsurf, and configures the latest optimized templates and directives for them.

```bash
# Specific CLI usage:
npx dom-to-pptx-skills
```

---

## HTML Authoring Standards

### 1. Slide Container

Recommend using a fixed-size container with a **16:9** aspect ratio:

```html
<!-- Recommended size -->
<div class="slide" style="width: 1920px; height: 1080px;">...</div>

<!-- Or smaller proportional dimensions -->
<div class="slide" style="width: 960px; height: 540px;">...</div>
```

### 2. Styling Approach

**Inline styles are recommended** to ensure they are correctly interpreted during export:

```html
<!-- Recommended: Inline styling -->
<div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 60px;">
  <h1 style="color: white; font-size: 48px;">Title</h1>
</div>
```

If using `<style>` tags, ensure styles are applied correctly during export:

```html
<style>
  .slide { ... }
  .title { ... }
</style>
<div class="slide">
  <h1 class="title">Title</h1>
</div>
```

### 3. Positioning Methods

| Positioning              | Support Status     | Notes                                              |
| ------------------------ | ------------------ | -------------------------------------------------- |
| `position: relative`     | ✅ Fully Supported | Recommended for containers                         |
| `position: absolute`     | ✅ Fully Supported | Ensure parent has `position: relative`             |
| `display: flex`          | ✅ Supported       | Library reads calculated positions                 |
| `display: grid`          | ✅ Supported       | Library reads calculated positions                 |
| `transform: translate()` | ⚠️ Partial Support | Only `rotate` supported; `translate/scale` are not |

---

## Supported CSS Properties

### Fully Supported

| Property                 | Example                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Background Color         | `background: #fff` / `background: rgba(0,0,0,0.5)`                                                                          |
| Linear Gradients         | `background: linear-gradient(135deg, #667eea, #764ba2)`                                                                     |
| Border Radius            | `border-radius: 16px` / `border-radius: 50%`                                                                                |
| Borders                  | `border: 1px solid #ccc`                                                                                                    |
| Shadows                  | `box-shadow: 0 4px 20px rgba(0,0,0,0.2)`                                                                                    |
| Font Styles              | `font-size`, `font-weight`, `font-family`, `color`                                                                          |
| Text Transformations     | `text-transform: uppercase`                                                                                                 |
| Letter Spacing           | `letter-spacing: 2px`                                                                                                       |
| Padding                  | `padding: 20px`                                                                                                             |
| Opacity                  | `opacity: 0.8`                                                                                                              |
| Blur effects             | `filter: blur(10px)`                                                                                                        |
| Animations & Transitions | CSS classes (e.g. `fade-in`, `slide-transition-fade`) with delay, duration, sequencing, and typing reveals (`letter` class) |

### Not Supported or Limited Support

| Property                  | Status             | Alternative                          |
| ------------------------- | ------------------ | ------------------------------------ |
| `backdrop-filter: blur()` | ⚠️ Simulated       | Simulated in browser via html2canvas |
| `transform: scale()`      | ❌ Not Supported   | Set element dimensions directly      |
| Radial Gradients          | ⚠️ Limited Support | Recommended to use linear gradients  |
| `text-shadow`             | ⚠️ Limited Support | Might not be fully rendered          |

---

## Image Handling

### 1. Using Network Images

Images must use **complete HTTPS URLs** or **data URLs**, and the server must support CORS:

```html
<!-- ✅ Correct -->
<img src="https://images.unsplash.com/photo-xxx?w=400" />

<!-- ✅ Correct -->
<img src="data:image/png;base64,..." />

<!-- ❌ Incorrect: Relative path -->
<img src="./images/photo.jpg" />

<!-- ❌ Incorrect: Local file -->
<img src="file:///Users/xxx/photo.jpg" />
```

### 2. Rounded Images

The library automatically handles rounded images without extra steps:

```html
<img src="https://example.com/avatar.jpg" style="width: 100px; height: 100px; border-radius: 50%;" />
```

### 3. Background Images

Background images also require full URLs:

```html
<!-- ✅ Correct -->
<div style="background: url('https://example.com/bg.jpg') center/cover;"></div>

<!-- ❌ Incorrect -->
<div style="background: url('./bg.jpg') center/cover;"></div>

---

## Speaker Notes (`data-pptx-notes`)

You can add presenter speaker notes to your slides by placing a `data-pptx-notes` attribute on the slide root element or any child element within the slide.

### Usage Example

```html
<div class="slide" data-pptx-notes="Welcome board members. Focus on Q3 revenue growth and operational expansion.">
  <h1>Q3 Executive Review</h1>
  <p>Revenue grew 34% year-over-year.</p>
</div>
```

When exported via API or CLI, `dom-to-pptx` automatically extracts `data-pptx-notes` and populates the PowerPoint presenter notes pane for each slide.
```

---

## SVG Vector Export (New in v1.1.5)

By default, SVG elements (like charts or icons) are rasterized into PNG images during export. While this ensures consistent rendering, the resulting images are not editable in PowerPoint.

The `svgAsVector` option allows you to preserve SVGs as vector data.

### Benefits

- **Fully Editable**: In PowerPoint, right-click the image and select **"Convert to Shape"** (or **Ungroup**) to turn the SVG into native PowerPoint shapes.
- **Infinite Scalability**: No pixelation when resizing.
- **Smaller File Size**: Often results in smaller files compared to high-res PNGs.

### Usage

```javascript
await exportToPptx('#chart-container', {
  fileName: 'editable-charts.pptx',
  svgAsVector: true,
});
```

### Constraints

- Complex SVG filters or masks might not always convert perfectly to PowerPoint shapes.
- External resources inside SVGs (like `image` tags) must still support CORS.

---

## Font Handling

### Automatic Font Embedding

The library automatically detects and embeds used fonts by default (`autoEmbedFonts: true`).

### Using Google Fonts

When using Google Fonts, you need to add the `crossorigin` attribute:

```html
<!-- ✅ Correct -->
<link
  href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap"
  rel="stylesheet"
  crossorigin="anonymous"
/>

<!-- ❌ Might fail to embed -->
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap" rel="stylesheet" />
```

### Manual Font Specification

If auto-detection fails, you can specify fonts manually:

```javascript
await exportToPptx('#slide', {
  fileName: 'slide.pptx',
  fonts: [
    {
      name: 'Roboto',
      url: 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxK.woff2',
    },
  ],
});
```

---

## Troubleshooting Common Issues

### 1. Inconsistent Layout Output

**Reason**: DOM elements are affected by CSS `transform`, `flex` layout, or parent containers during export.

**Solution**:

- Ensure exported elements are not affected by `transform: scale()`.
- Place the HTML to be exported in a clean container (unaffected by flex/grid).
- See the `#export-stage` implementation in `demo.html` for reference.

### 2. Image Export Failure

**Reason**:

- Image URLs are inaccessible.
- Image server does not support CORS.
- Relative paths are used.

**Solution**:

- Use CORS-supported image services (e.g., Unsplash, Cloudinary).
- Convert images to Base64 data URLs.

### 3. Fonts Falling Back to Arial

**Reason**: Font embedding failed, so PowerPoint reverted to default fonts.

**Solution**:

- Ensure font URLs are accessible.
- Check CORS settings.
- Manually configure font specifications.

### 4. Incorrect Gradient Rendering

**Reason**: Complex gradient syntax might not be fully parsed.

**Solution**:

- Use standard `linear-gradient` syntax.
- Avoid using `radial-gradient` or overly complex multi-color stops.
- Adjust color values after testing.

---

## Demo Instructions

A local demo page `demo.html` is provided and can be opened directly in a browser for testing.

### Features

1. **HTML Editor**: Input HTML code (full page or fragment) on the left.
2. **Real-time Preview**: Automatic rendering of the preview on the right.
3. **One-click Export**: Click the button in the top right to export PPTX.

### Supported HTML Formats

**Fragment Mode** (Recommended):

```html
<div class="slide" style="width: 960px; height: 540px; ...">
  <h1>Title</h1>
</div>
```

**Full Page Mode**:

```html
<!DOCTYPE html>
<html>
  <head>
    <style>
      .slide {
        width: 960px;
        height: 540px;
      }
      .title {
        font-size: 48px;
      }
    </style>
  </head>
  <body>
    <div class="slide">
      <h1 class="title">Title</h1>
    </div>
  </body>
</html>
```

---

## Best Practice Summary

1. **Use Fixed Dimensions**: Use `1920x1080` or `960x540` (16:9) for containers.
2. **Prefer Inline Styles**: Ensures styles are correctly captured.
3. **Use Full Image URLs**: Avoid relative paths; ensure CORS access.
4. **Simplify Gradients**: Use standard `linear-gradient` syntax.
5. **Test Fonts**: Add `crossorigin` to Google Fonts links.
6. **Avoid transform**: Don't use `scale()` or `translate()` on exported elements.
7. **Check Console**: Review browser console errors for export failures.

---

## API Reference

```javascript
exportToPptx(elementOrSelector, options);
```

### Parameters

| Parameter                | Type                             | Description                                   |
| ------------------------ | -------------------------------- | --------------------------------------------- |
| `elementOrSelector`      | `string \| HTMLElement \| Array` | DOM element or selector                       |
| `options.fileName`       | `string`                         | Filename, defaults to `"export.pptx"`         |
| `options.autoEmbedFonts` | `boolean`                        | Automatically embed fonts, defaults to `true` |
| `options.fonts`          | `Array<{name, url}>`             | Manually specify fonts                        |
| `options.skipDownload`   | `boolean`                        | Do not auto-download; return Blob             |
| `options.svgAsVector`    | `boolean`                        | Preserve SVGs as vectors (default: `false`)   |
| `options.listConfig`     | `object`                         | List style configuration                      |

### Returns

`Promise<Blob>` - Generated PPTX file Blob object.
