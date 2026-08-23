# dom-to-pptx

**The High-Fidelity HTML to PowerPoint Converter (v2.1.0)**

[![npm version](https://img.shields.io/npm/v/dom-to-pptx.svg?style=flat-square)](https://www.npmjs.com/package/dom-to-pptx)
[![npm downloads](https://img.shields.io/npm/dm/dom-to-pptx.svg?style=flat-square)](https://www.npmjs.com/package/dom-to-pptx)
[![](https://data.jsdelivr.com/v1/package/npm/dom-to-pptx/badge?style=rounded)](https://www.jsdelivr.com/package/npm/dom-to-pptx)
[![license](https://img.shields.io/npm/l/dom-to-pptx.svg?style=flat-square)](https://github.com/atharva9167j/dom-to-pptx/blob/master/LICENSE)

> Trusted by **230,000+ downloads every month** — and now with native motion support.

> [!TIP]
> **Quick Start for AI Agents (Claude Code, Gemini, Windsurf):**
> Run `npx dom-to-pptx-skills` to automatically install professional PPT creation skills into your agent's toolkit.

> [!IMPORTANT]
> **Experience the Power of dom-to-pptx:** Check out **[Preso AI](https://preso-ai.vercel.app)** — an AI-native presentation platform that uses this library to deliver professional, high-fidelity PowerPoint exports from simple text prompts.

---

Most HTML-to-PPTX libraries fail when faced with modern web design. They break on gradients, misalign text, ignore rounded corners, or simply take a screenshot (which isn't editable).

**dom-to-pptx** is different. It is a **Coordinate Scraper & Style Engine** that traverses your DOM, calculates the exact computed styles of every element (Flexbox/Grid positions, complex gradients, shadows), and mathematically maps them to native PowerPoint shapes and text boxes. The result is a fully editable, vector-sharp presentation that looks exactly like your web view and as of v2.0.0, one that moves like a real motion-designed deck too.

## 🎬 What's New in v2.1

- **Presentation Speaker Notes (`data-pptx-notes`)**: Annotate elements or slide roots with `data-pptx-notes="..."` to automatically generate presenter speaker notes in PowerPoint slides.
- **Hybrid Pseudo-Element Engine (`::before` / `::after`)**: Full support for CSS pseudo-element decorations, including `linear-gradient` backgrounds, zero-size border triangles, clip-paths, and complex CSS shapes via `html2canvas` capture, plus `--no-pseudo` CLI opt-out.
- **Custom Viewport & Dimensions**: Full support for `--width` / `--height` custom slide dimensions and `--browser-width` / `--browser-height` headless viewport resolution.
- **Smart Font Embedding & File Access**: Hardened font embedder with `--allow-file-access-from-files` enabled by default for headless CLI exports.

## Features

### 📝 Presentation Speaker Notes (v2.1)

- **Slide Notes Extraction:** Add `data-pptx-notes="Presenter notes go here..."` to any slide root or nested element. `dom-to-pptx` automatically extracts and populates PowerPoint speaker notes for each slide.

### 🎬 Animations & Transitions (New in v2)

- **Native Entrance & Exit Animations:** Apply animation classes directly to HTML elements — no JS config needed — and they're converted into real, editable PowerPoint animation effects.
- **Slide Transitions:** Apply transition classes to your `.slide` containers to control how PowerPoint moves between slides, from subtle fades to expressive creative effects.
- **Sequencing & Triggers:** Coordinate multi-element builds with `animate-trigger-with` (simultaneous) and `animate-trigger-after` (chained), or require a click with `animate-trigger-on-click`.
- **Typing & List-Reveal Builds:** Use the `letter` or `paragraph` class for character-by-character or line-by-line text reveals.

### 🚀 Smart Font Embedding (v1.1)

- **Smart Font Embedding:** The library **automatically detects** the fonts used in your HTML, finds their URLs in your CSS, and embeds them into the PPTX. Your slides will look identical on any computer, even if the user doesn't have the fonts installed.
- **Enhanced Icon Support:** Flawless rendering of FontAwesome, Material Icons, and SVG-based icon libraries (including gradient text icons).

### 🎨 Advanced Visual Fidelity

- **Complex Gradients:** Includes a built-in CSS Gradient Parser that converts `linear-gradient` strings (with multiple stops, specific angles like `45deg`, and transparency) into vector SVGs.
- **Hybrid Pseudo-Element Engine:** Renders `::before` and `::after` pseudo-elements — supporting gradient strips, border shapes, triangles, speech bubbles, and ribbons natively or via canvas snapshots.
- **Mathematically Accurate Shadows:** Converts CSS Cartesian shadows (`x`, `y`, `blur`) into PowerPoint's Polar coordinate system (`angle`, `distance`) for 1:1 depth matching.
- **Anti-Halo Image Processing:** Uses off-screen HTML5 Canvas with `source-in` composite masking to render rounded images without the ugly white "halo" artifacts found in other libraries.
- **Soft Edges/Blurs:** Accurately translates CSS `filter: blur()` into PowerPoint's soft-edge effects, preserving visual depth.

### 📐 Smart Layout & Typography

- **Auto-Scaling Engine:** Build your slide in HTML at **1920x1080** (or any aspect ratio). The library automatically calculates the scaling factor to fit it perfectly into a standard 16:9 PowerPoint slide.
- **Rich Text Blocks:** Handles mixed-style text (e.g., **bold** spans inside a normal paragraph).
- **Text Transformations:** Supports CSS `text-transform: uppercase/lowercase` and `letter-spacing`.

### ⚡ Technical Capabilities

- **Z-Index Handling:** Respects DOM order for correct layering of elements.
- **Border Radius Math:** Calculates perfect corner rounding percentages based on element dimensions.
- **Client-Side:** Runs entirely in the browser. No server required.

### 🏢 Template Support (Optional)

- **Base an export on an existing `.pptx`:** Pass `template: './corporate-template.pptx'` to have exported slides inherit a real PowerPoint slide layout/master background — theme, logo, footer, accent bars — via genuine PowerPoint layout inheritance, not a screenshot. See [`docs/template-support.md`](docs/template-support.md) for the full writeup, API, and limitations.

## ✨ Featured Project: Preso AI

**[Preso AI](https://preso-ai.vercel.app)** is a state-of-the-art AI presentation builder built entirely on top of the `dom-to-pptx` engine. It demonstrates the full potential of this library by transforming AI-generated content into premium, editable PowerPoint decks.

- **AI-to-PPTX Workflow**: Turn a single prompt into a 10+ slide high-fidelity presentation.
- **Atmospheric UI**: Implements the "Atmospheric UI" design system natively.
- **Pixel-Perfect Exports**: Uses `dom-to-pptx` to ensure every gradient, shadow, and layout is preserved in the final `.pptx` file.

> **Try it now:** [preso-ai.vercel.app](https://preso-ai.vercel.app)

## Installation

```bash
npm install dom-to-pptx
```

## 🖥️ Command Line Interface (CLI) & Agent Skills (New!)

`dom-to-pptx` ships with a CLI suite to run headless PPTX exports or configure AI coding assistants.

The unified router command `dom-to-pptx` is the **preferred and recommended** entry point for all operations.

### 1. Unified CLI Router (`dom-to-pptx`) [RECOMMENDED]

Run the unified command directly:

```bash
# General help
npx dom-to-pptx --help

# Run headless exporter (preferred; delegates to dom-to-pptx-exporter)
npx dom-to-pptx export slides.html [options]

# Run interactive skills installer (delegates to dom-to-pptx-skills)
npx dom-to-pptx skills
```

### 2. Standalone Headless Exporter CLI (`dom-to-pptx-exporter`)

A dedicated standalone command to export local HTML files or remote URLs to PPTX files directly from the command line using a headless browser:

```bash
npx dom-to-pptx-exporter slides.html --output presentation.pptx
```

**Options (available for both `dom-to-pptx export` and `dom-to-pptx-exporter`):**

- `--output, -o <path>`: Output `.pptx` file path (defaults to same folder as input).
- `--selector, -s <css>`: CSS selector for slide container elements (defaults to `.slide`).
- `--inject`: Force-inject the local browser bundle (useful if the HTML doesn't bundle `dom-to-pptx`).
- `--title <text>` / `--author <text>`: Add presentation title / author metadata.
- `--width <num>` / `--height <num>`: Set custom slide dimensions in inches.
- `--no-pseudo`: Disable exporting CSS pseudo-elements (useful for preventing hover/icon state conflicts).

### 3. Agent Skills Installer CLI (`dom-to-pptx-skills`)

An interactive installer to configure presentation engineering skills for coding agents (Claude Code, Gemini CLI, Windsurf, Cursor):

```bash
npx dom-to-pptx-skills
```

The installer scans for agent directories, lets you choose targeted locations, and configures the optimized prompt templates automatically.

---

## Usage

This library is intended for use in the browser (React, Vue, Svelte, Vanilla JS, etc.).

### 1. Basic Example (Auto-Font Embedding)

By default, `dom-to-pptx` attempts to automatically find and embed your web fonts.

```javascript
import { exportToPptx } from 'dom-to-pptx';

document.getElementById('export-btn').addEventListener('click', async () => {
  // Pass the CSS selector of the container
  await exportToPptx('#slide-container', {
    fileName: 'slide-presentation.pptx',
  });
});
```

### 2. Manual Font Configuration (Optional)

If you are using external fonts (like Google Fonts) that are hosted on a server without CORS headers, automatic detection might fail. In that case, you can explicitly pass the font URLs:

```javascript
import { exportToPptx } from 'dom-to-pptx';

await exportToPptx('#slide-container', {
  fileName: 'report.pptx',
  // Optional: Only needed if auto-detection fails due to CORS
  fonts: [
    {
      name: 'Roboto',
      url: 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxK.woff2',
    },
  ],
});
```

### 3. Multi-Slide Example

To export multiple HTML elements as separate slides, pass an array of elements or selectors:

```javascript
import { exportToPptx } from 'dom-to-pptx';

document.getElementById('export-btn').addEventListener('click', async () => {
  const slideElements = document.querySelectorAll('.slide');
  await exportToPptx(Array.from(slideElements), {
    fileName: 'multi-slide-presentation.pptx',
  });
});
```

### 4. SVG Vector Export (Editable Charts)

If your HTML contains SVG elements (like charts), you can keep them as vectors for editing in PowerPoint:

```javascript
import { exportToPptx } from 'dom-to-pptx';

await exportToPptx('#slide-with-charts', {
  fileName: 'editable-charts.pptx',
  svgAsVector: true, // SVGs remain as vectors, not rasterized
});
```

In PowerPoint, right-click the SVG image and select **"Convert to Shape"** (or **Group > Ungroup**) to make it fully editable.

### 5. Template Support (Base on an Existing `.pptx`)

Base exported slides on a real PowerPoint template so they inherit its actual slide layout/master background instead of a blank generated one:

```javascript
import { exportToPptx } from 'dom-to-pptx';

await exportToPptx(
  [
    { element: document.querySelector('#slide-1'), baseLayout: 'Content Light' },
    { element: document.querySelector('#slide-2'), baseLayout: 'Section Dark' },
  ],
  {
    fileName: 'branded-deck.pptx',
    template: './corporate-template.pptx',
    defaultBaseLayout: 'Content Light', // used for any slide without its own baseLayout
  }
);
```

See [`docs/template-support.md`](docs/template-support.md) for how layouts are resolved, default behavior, error handling, and known limitations (e.g. font embedding is not currently supported together with `template`).

### 6. Animated Slides & Transitions (New in v2.0.0)

Animations and transitions are applied declaratively via CSS classes — no extra JavaScript options are needed. Just link the animation stylesheet (note: slide-to-slide transitions are not previewed in the browser; only element animations are) so motion previews correctly in the browser, then export as usual.

The `applyBrowserAnimations(parentElement, options)` helper configures the browser-side motion preview timeline. When `enableClick` is `false` (default automatic playback mode), the sequencer automatically schedules the slide's animations step-by-step. It accurately calculates the staggered duration of paragraph and letter builds, ensuring the next click-trigger step does not start until the previous build finishes. When `enableClick` is `true`, it binds a click listener to the `.slide` elements to advance the timeline manually on click.

```html
<head>
  <!-- Required for accurate in-browser preview of animations (note: slide transitions are not previewed in-browser) -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/dom-to-pptx@latest/dist/animations.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/dom-to-pptx@latest/dist/transitions.css" />
</head>

<body>
  <div class="slide-stage">
    <!-- Apply a transition class to the slide itself -->
    <div class="slide slide-transition-fade" id="slide-1" style="width:1920px;height:1080px;">
      <!-- Apply an entrance animation to an element -->
      <h1 class="fade-in animate-duration-[1000]">Dynamic Presentation</h1>

      <!-- Chain a second animation after the first finishes -->
      <p class="fly-in to-up animate-duration-[800] animate-delay-[200] animate-trigger-after">
        Powered by dom-to-pptx native animations
      </p>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/dom-to-pptx@latest/dist/dom-to-pptx.bundle.js"></script>
  <script>
    // Apply browser-side animation behavior before the page is interacted with.
    // Pass { enableClick: true } to require clicking the slide to step through animations,
    // or leave empty/false to play them automatically.
    domToPptx.applyBrowserAnimations(document.body, { enableClick: true });

    document.getElementById('export-btn').onclick = async () => {
      await domToPptx.exportToPptx(Array.from(document.querySelectorAll('.slide')), {
        fileName: 'animated-presentation.pptx',
      });
    };
  </script>
</body>
```

**Key animation/transition utility classes:**

| Class pattern                                                                   | Applies to         | Purpose                                                      |
| :------------------------------------------------------------------------------ | :----------------- | :----------------------------------------------------------- |
| `fade-in`, `zoom-in`, `fly-in`, `wipe-in` (+ exit variants)                     | Element            | Entrance/exit animation style (20+ available)                |
| `to-up`, `to-down`, `to-left`, `to-right`                                       | Element            | Directional modifier for movement-based animations           |
| `animate-duration-[MS]` / `animate-delay-[MS]`                                  | Element            | Custom timing in milliseconds, e.g. `animate-duration-[600]` |
| `animate-trigger-on-click` / `animate-trigger-with` / `animate-trigger-after`   | Element            | Click-triggered, simultaneous, or sequential-chain timing    |
| `letter` / `paragraph`                                                          | Text element       | Character-by-character typing or row-by-row reveal builds    |
| `slide-transition-fade`, `slide-transition-push`, `slide-transition-wipe`, etc. | `.slide` container | Slide-to-slide transition style (70+ available)              |
| `transition-duration-fast` / `transition-dur-[MS]`                              | `.slide` container | Custom transition speed                                      |

> For the complete, exhaustive list of all 20+ animations and 70+ transitions with names and previews, see `ANIMATIONS_WHITELIST.md` and `TRANSITIONS_WHITELIST.md` (installed via `npx dom-to-pptx-skills`, or available in the repo's `reference/` directory).

### 7. Browser Usage (Script Tags)

You can use `dom-to-pptx` directly via CDN. The bundle includes all dependencies.

```html
<script src="https://cdn.jsdelivr.net/npm/dom-to-pptx@latest/dist/dom-to-pptx.bundle.js"></script>

<script>
  document.getElementById('export-btn').addEventListener('click', async () => {
    // The library is available globally as `domToPptx`
    await domToPptx.exportToPptx('#slide-container', {
      fileName: 'slide.pptx',
    });
  });
</script>
```

## Recommended HTML Structure

We recommend building your slide container at **1920x1080px**. The library will handle the downscaling to fit the PowerPoint slide (16:9).

```html
<!-- Container (16:9 Aspect Ratio) -->
<!-- The library will capture this background color/gradient automatically -->
<div
  id="slide-container"
  class="slide w-[1000px] h-[562px] bg-white rounded-xl overflow-hidden relative shadow-2xl shadow-black/50 flex"
>
  <!-- Left Sidebar -->
  <div class="w-1/3 bg-slate-900 relative overflow-hidden flex flex-col p-10 justify-between">
    <!-- Decorative gradients -->
    <div class="absolute top-0 left-0 w-full h-full opacity-30 pointer-events-none">
      <div class="absolute -top-20 -left-20 w-64 h-64 bg-purple-600 rounded-full blur-3xl mix-blend-screen"></div>
      <div class="absolute bottom-0 right-0 w-80 h-80 bg-indigo-600 rounded-full blur-3xl mix-blend-screen"></div>
    </div>
    <div class="relative z-10">
      <div
        class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 backdrop-blur-md mb-6"
      >
        <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
        <span class="text-xs font-medium text-slate-300 tracking-wider">LIVE DATA</span>
      </div>
      <h2 class="text-4xl font-bold text-white leading-tight mb-4">
        Quarterly <br />
        <span class="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">Performance</span>
      </h2>
      <p class="text-slate-400 leading-relaxed">
        Visualizing the impact of high-fidelity DOM conversion on presentation workflows.
      </p>
    </div>
    <!-- Feature List (Flexbox/Grid test) -->
    <div class="relative z-10 space-y-4">
      <div class="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5">
        <div class="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold">
          1
        </div>
        <div class="text-sm text-slate-300">Pixel-perfect Shadows</div>
      </div>
      <div class="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5">
        <div class="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-bold">
          2
        </div>
        <div class="text-sm text-slate-300">Complex Gradients</div>
      </div>
    </div>
  </div>
  <!-- Right Content -->
  <div class="w-2/3 bg-slate-50 p-10 relative">
    <!-- Header -->
    <div class="flex justify-between items-start mb-10">
      <div>
        <h3 class="text-slate-800 font-bold text-xl">Revenue Breakdown</h3>
        <p class="text-slate-500 text-sm">Fiscal Year 2024</p>
      </div>
      <div class="flex -space-x-2">
        <!-- Rounded Images Test (CORS friendly) -->
        <img
          class="w-10 h-10 rounded-full border-2 border-white object-cover shadow-md"
          src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&amp;fit=crop&amp;w=64&amp;h=64"
          alt="User 1"
        />
        <img
          class="w-10 h-10 rounded-full border-2 border-white object-cover shadow-md"
          src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&amp;fit=crop&amp;w=64&amp;h=64"
          alt="User 2"
        />
        <div
          class="w-10 h-10 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 shadow-md"
        >
          +5
        </div>
      </div>
    </div>
    <!-- Grid Layout Test -->
    <div class="grid grid-cols-2 gap-6 mb-8">
      <!-- Card 1: Gradient & Shadow -->
      <div class="bg-white p-5 rounded-xl complex-shadow border border-slate-100 relative overflow-hidden group">
        <div class="relative z-10">
          <p class="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-1">Total Sales</p>
          <h4 class="text-3xl font-bold text-slate-800">$124,500</h4>
          <div class="mt-3 flex items-center text-xs font-semibold text-green-600">
            <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
              ></path>
            </svg>
            <span>+14.5%</span>
          </div>
        </div>
      </div>
      <!-- Card 2: Gradient Border/Background -->
      <div
        class="p-5 rounded-xl shadow-lg text-white relative overflow-hidden"
        style="
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        "
      >
        <p class="text-xs font-bold text-white/80 uppercase tracking-wider mb-1">Active Users</p>
        <h4 class="text-3xl font-bold text-white">45.2k</h4>
        <div class="mt-3 w-full bg-black/20 rounded-full h-1.5">
          <div class="bg-white/90 h-1.5 rounded-full" style="width: 70%"></div>
        </div>
      </div>
    </div>
    <!-- Complex Typography & Layout -->
    <div class="bg-indigo-50/50 rounded-xl p-6 border border-indigo-100">
      <h5 class="font-bold text-indigo-900 mb-3">Analysis Summary</h5>
      <p class="text-indigo-800/80 text-sm leading-relaxed">
        The
        <span class="font-bold text-indigo-600">Q3 projection</span>
        exceeds expectations due to the new
        <span class="italic">optimization algorithm</span>. We observed a
        <strong class="text-indigo-700">240% increase</strong>
        in processing speed across all nodes.
      </p>
    </div>
    <!-- Floating Badge (Absolute positioning test) -->
    <div
      class="absolute bottom-6 right-6 bg-white/90 backdrop-blur px-4 py-2 rounded-lg shadow-lg border border-slate-200 flex items-center gap-2"
    >
      <div class="w-2 h-2 rounded-full bg-red-500"></div>
      <span class="text-xs font-bold text-slate-600 uppercase">Confidential</span>
    </div>
  </div>
</div>
```

## API

### `exportToPptx(elementOrSelector, options)`

Returns: `Promise<Blob>` - Resolves with the generated PPTX file data (Blob).

| Parameter           | Type                                                        | Description                                                                                                        |
| :------------------ | :---------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------- |
| `elementOrSelector` | `string` \| `HTMLElement` \| `Array<string \| HTMLElement \| {element, baseLayout}>` | The DOM node(s) or ID selector(s) to convert. Can be a single element/selector or an array for multi-slide export. An array entry may be a `{element, baseLayout}` descriptor to pick a template layout for that slide (see `template` below). |
| `options`           | `object`                                                    | Configuration object.                                                                                              |

**Options Object:**

| Key              | Type      | Default         | Description                                                                                                   |
| :--------------- | :-------- | :-------------- | :------------------------------------------------------------------------------------------------------------ |
| `fileName`       | `string`  | `"export.pptx"` | The name of the downloaded file.                                                                              |
| `autoEmbedFonts` | `boolean` | `true`          | Automatically detect and embed used fonts.                                                                    |
| `fonts`          | `Array`   | `[]`            | Manual array of font objects: `{ name, url }`.                                                                |
| `skipDownload`   | `boolean` | `false`         | If `true`, the file is not downloaded automatically. Use the returned `Blob` for custom handling (upload).    |
| `svgAsVector`    | `boolean` | `false`         | If `true`, keeps SVG elements as vectors (not rasterized). Enables "Convert to Shape" in PowerPoint.          |
| `layout`         | `string`  | `"LAYOUT_16x9"` | Slide layout name (e.g., `LAYOUT_4x3`, `LAYOUT_16x10`, `LAYOUT_WIDE`).                                        |
| `width`          | `number`  | `10`            | Custom slide width in inches (requires `height` to be set).                                                   |
| `height`         | `number`  | `5.625`         | Custom slide height in inches (requires `width` to be set).                                                   |
| `listConfig`     | `object`  | `undefined`     | Global overrides for list styles. Structure: `{ color: string, spacing: { before: number, after: number } }`. |
| `template`       | `string` \| `ArrayBuffer` \| `Uint8Array` \| `Blob` | `undefined` | Base the export on an existing `.pptx` so slides inherit its real slideLayout/master background. See [Template Support](docs/template-support.md). |
| `defaultBaseLayout` | `string` | template's first layout | Layout name (from `template`) used for any slide that doesn't set its own `baseLayout`. |

> Note: animations and transitions are controlled entirely through CSS classes on your elements (see [Animated Slides & Transitions](#6-animated-slides--transitions-new-in-v120)), not through the `options` object.

**List Configuration Example:**

```javascript
listConfig: {
  spacing: {
    before: 10,       // Space before bullet (pt)
    after: 5          // Space after bullet (pt)
  }
}
```

### `getTemplateLayouts(template)`

Returns: `Promise<Array<{id: string, name: string}>>` — the slide layouts declared in an existing `.pptx`, e.g. for building a layout picker upstream of `dom-to-pptx`. `id` is the internal OOXML part path; `name` is what you pass as `baseLayout`/`defaultBaseLayout`. See [Template Support](docs/template-support.md).

### `applyBrowserAnimations(parentElement, options)`

Applies browser animation inline styles by parsing animation class utilities. This helper enables real-time browser previewing of custom slide animation speeds, delays, sequencing triggers, and text builds with PowerPoint-accurate timeline parity.

| Parameter       | Type          | Default    | Description                                          |
| :-------------- | :------------ | :--------- | :--------------------------------------------------- |
| `parentElement` | `HTMLElement` | _Required_ | The root element of the slide stage or presentation. |
| `options`       | `object`      | `{}`       | Optional configuration object.                       |

**Options Object (`options`):**

| Key           | Type      | Default | Description                                                                                                                                                                                                                                                                                     |
| :------------ | :-------- | :------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enableClick` | `boolean` | `false` | If `true`, click-triggered steps are initially paused and advance one-by-one upon slide clicks (matching manual click timing). If `false` (default), click-triggered steps are automatically chained and play sequentially, accurately waiting for staggered paragraph/letter builds to finish. |

## Important Notes

1.  **Fonts & CORS:**
    - **Automatic Embedding:** Works perfectly for local fonts and external fonts served with correct CORS headers.
    - **Google Fonts:** For auto-detection to work with Google Fonts, you must add `crossorigin="anonymous"` to your link tag:
      `<link href="https://fonts.googleapis.com/..." rel="stylesheet" crossorigin="anonymous">`
    - If a font cannot be accessed due to CORS, the library will log a warning and proceed without embedding it (PowerPoint will fallback to Arial).

2.  **Layout System:** The library does not "read" Flexbox or Grid definitions directly. It measures the final `x, y, width, height` of every element relative to the slide root and places them absolutely. This ensures 100% visual accuracy regardless of the CSS layout method used.

3.  **CORS Images:** External images (`<img>` tags) must also be served with `Access-Control-Allow-Origin: *` headers to be processed by the rounding/masking engine.

4.  **Animations & Transitions:** Link `animations.css` and `transitions.css` (note: only slide element animations are previewed in the browser; slide-to-slide transitions are not previewed in-browser, though they are still exported correctly) so motion previews correctly in your browser before export — the export engine reads the applied classes and converts them into native PowerPoint animation/transition effects regardless of whether the stylesheets are present at export time.

## Contributors

A huge thank you to everyone who has helped improve `dom-to-pptx`!

Please see [CONTRIBUTORS.md](CONTRIBUTORS.md) for the full list of our amazing contributors.

## License

MIT © [Atharva Dharmendra Jagtap](https://github.com/atharva9167j) and `dom-to-pptx` contributors.

## Acknowledgements

This project is built on top of [PptxGenJS](https://github.com/gitbrent/PptxGenJS). Huge thanks to the PptxGenJS maintainers and all contributors — dom-to-pptx leverages and extends their excellent work on PPTX generation.
