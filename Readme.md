# dom-to-pptx

**The High-Fidelity HTML to PowerPoint Converter (v1.0.7).**

Most HTML-to-PPTX libraries fail when faced with modern web design. They break on gradients, misalign text, ignore rounded corners, or simply take a screenshot (which isn't editable).

**dom-to-pptx** is different. It is a **Coordinate Scraper & Style Engine** that traverses your DOM, calculates the exact computed styles of every element (Flexbox/Grid positions, complex gradients, shadows), and mathematically maps them to native PowerPoint shapes and text boxes. The result is a fully editable, vector-sharp presentation that looks exactly like your web view.

## Features

### 🎨 Advanced Visual Fidelity

- **Complex Gradients:** Includes a built-in CSS Gradient Parser that converts `linear-gradient` strings (with multiple stops, angles, and transparency) into vector SVGs for perfect rendering. This now also supports `text-fill-color` gradients, falling back to the first color for broad compatibility.
- **Mathematically Accurate Shadows:** Converts CSS Cartesian shadows (`x`, `y`, `blur`) into PowerPoint's Polar coordinate system (`angle`, `distance`) for 1:1 depth matching.
- **Anti-Halo Image Processing:** Uses off-screen HTML5 Canvas with `source-in` composite masking to render rounded images without the ugly white "halo" artifacts found in other libraries.
- **Soft Edges/Blurs:** Accurately translates CSS `filter: blur()` into PowerPoint's soft-edge effects, preserving visual depth.

### 📐 Smart Layout & Typography

- **Auto-Scaling Engine:** Build your slide in HTML at **1920x1080** (or any aspect ratio). The library automatically calculates the scaling factor to fit it perfectly into a standard 16:9 PowerPoint slide (10 x 5.625 inches) with auto-centering.
- **Rich Text Blocks:** Handles mixed-style text (e.g., **bold** spans inside a normal paragraph) while sanitizing HTML source code whitespace (newlines/tabs) to prevent jagged text alignment.
- **Font Stack Normalization:** Automatically maps web-only fonts (like `ui-sans-serif`, `system-ui`) to safe system fonts (`Arial`, `Calibri`) to ensure the file opens correctly on any computer.
- **Text Transformations:** Supports CSS `text-transform: uppercase/lowercase` and `letter-spacing` (converted to PT).

### ⚡ Technical Capabilities

- **Z-Index Handling:** Respects DOM order for correct layering of elements.
- **Border Radius Math:** Calculates perfect corner rounding percentages based on element dimensions.
- **Client-Side:** Runs entirely in the browser. No server required.

## Installation

```bash
npm install dom-to-pptx
```

## Usage

This library is intended for use in the browser (React, Vue, Svelte, Vanilla JS, etc.).

### 1. Basic Example

```javascript
import { exportToPptx } from 'dom-to-pptx';

// import PptxGenJS from 'pptxgenjs'; // Uncomment and use if needed for your setup

document.getElementById('export-btn').addEventListener('click', async () => {
  // Pass the CSS selector of the container you want to turn into a slide
  await exportToPptx('#slide-container', {
    fileName: 'slide-presentation.pptx',
  });
});
```

### 2. Multi-Slide Example

To export multiple HTML elements as separate slides, pass an array of elements or selectors:

```javascript
import { exportToPptx } from 'dom-to-pptx'; // ESM or CJS import

document.getElementById('export-btn').addEventListener('click', async () => {
  const slideElements = document.querySelectorAll('.slide');
  await exportToPptx(Array.from(slideElements), {
    fileName: 'multi-slide-presentation.pptx',
  });
});
```

### 3. Browser Usage (single-file bundle or legacy setup)

You can use `dom-to-pptx` directly in the browser in two ways:

- Recommended — Single-file bundle (includes runtime deps):

```html
<!-- Single script that contains dom-to-pptx + pptxgenjs + html2canvas -->
<script src="https://cdn.jsdelivr.net/npm/dom-to-pptx@latest/dist/dom-to-pptx.bundle.js"></script>
<script>
  document.getElementById('export-btn').addEventListener('click', async () => {
    // The library is available globally as `domToPptx`
    await domToPptx.exportToPptx('#slide-container', { fileName: 'slide-presentation.pptx' });
  });
</script>
```

You can load the bundle from a CDN (unpkg/jsdelivr):

```html
<script src="https://unpkg.com/dom-to-pptx@latest/dist/dom-to-pptx.bundle.js"></script>
```
```html
<script src="https://cdn.jsdelivr.net/npm/dom-to-pptx@latest/dist/dom-to-pptx.bundle.js"></script>
```


- Legacy — Explicit runtime includes (smaller dom-to-pptx file, you manage deps):

```html
<!-- Load pptxgenjs first -->
<script src="https://cdn.jsdelivr.net/npm/pptxgenjs@latest/dist/pptxgen.bundle.js"></script>
<!-- html2canvas is required by the legacy dom-to-pptx build for backdrop-filter and canvas image processing -->
<script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
<!-- Then load the legacy dom-to-pptx file that expects the above libs -->
<script src="https://cdn.jsdelivr.net/npm/dom-to-pptx@latest/dist/dom-to-pptx.min.js"></script>
<script>
  document.getElementById('download-btn').addEventListener('click', async () => {
    await domToPptx.exportToPptx('#slide-container', { fileName: 'slide-presentation.pptx' });
  });
</script>
```

Notes:

- The standalone `dist/dom-to-pptx.bundle.js` includes `pptxgenjs` and `html2canvas`, so you only need one script tag.
- If you prefer a smaller payload and already have `pptxgenjs` on the page, use the legacy `dist/dom-to-pptx.min.js` and load `pptxgenjs` first.

### 4. Recommended HTML Structure

### Recommended HTML Structure

For the best results, treat your container as a fixed-size canvas. We recommend building your slide at **1920x1080px**. The library will handle the downscaling.

```html
<!-- Container (16:9 Aspect Ratio) -->
<!-- The library will capture this background color/gradient automatically -->
<div
  id="slide-container"
  class="slide w-[1000px] h-[562px] bg-white rounded-xl overflow-hidden relative shadow-2xl shadow-black/50 flex"
>
  <!-- Left Sidebar -->
  <div
    class="w-1/3 bg-slate-900 relative overflow-hidden flex flex-col p-10 justify-between"
  >
    <!-- Decorative gradients -->
    <div
      class="absolute top-0 left-0 w-full h-full opacity-30 pointer-events-none"
    >
      <div
        class="absolute -top-20 -left-20 w-64 h-64 bg-purple-600 rounded-full blur-3xl mix-blend-screen"
      ></div>
      <div
        class="absolute bottom-0 right-0 w-80 h-80 bg-indigo-600 rounded-full blur-3xl mix-blend-screen"
      ></div>
    </div>
    <div class="relative z-10">
      <div
        class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 backdrop-blur-md mb-6"
      >
        <span
          class="w-2 h-2 rounded-full bg-green-400 animate-pulse"
        ></span>
        <span class="text-xs font-medium text-slate-300 tracking-wider"
          >LIVE DATA</span
        >
      </div>
      <h2 class="text-4xl font-bold text-white leading-tight mb-4">
        Quarterly <br />
        <span
          class="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400"
          >Performance</span
        >
      </h2>
      <p class="text-slate-400 leading-relaxed">
        Visualizing the impact of high-fidelity DOM conversion on
        presentation workflows.
      </p>
    </div>
    <!-- Feature List (Flexbox/Grid test) -->
    <div class="relative z-10 space-y-4">
      <div
        class="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5"
      >
        <div
          class="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold"
        >
          1
        </div>
        <div class="text-sm text-slate-300">Pixel-perfect Shadows</div>
      </div>
      <div
        class="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5"
      >
        <div
          class="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-bold"
        >
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
        <h3 class="text-slate-800 font-bold text-xl">
          Revenue Breakdown
        </h3>
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
      <div
        class="bg-white p-5 rounded-xl complex-shadow border border-slate-100 relative overflow-hidden group"
      >
        <div class="relative z-10">
          <p
            class="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-1"
          >
            Total Sales
          </p>
          <h4 class="text-3xl font-bold text-slate-800">$124,500</h4>
          <div
            class="mt-3 flex items-center text-xs font-semibold text-green-600"
          >
            <svg
              class="w-3 h-3 mr-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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
        <p
          class="text-xs font-bold text-white/80 uppercase tracking-wider mb-1"
        >
          Active Users
        </p>
        <h4 class="text-3xl font-bold text-white">45.2k</h4>
        <div class="mt-3 w-full bg-black/20 rounded-full h-1.5">
          <div
            class="bg-white/90 h-1.5 rounded-full"
            style="width: 70%"
          ></div>
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
        <span class="italic">optimization algorithm</span>. We observed a <strong class="text-indigo-700">240% increase</strong>
        in processing speed across all nodes.
      </p>
    </div>
    <!-- Floating Badge (Absolute positioning test) -->
    <div
      class="absolute bottom-6 right-6 bg-white/90 backdrop-blur px-4 py-2 rounded-lg shadow-lg border border-slate-200 flex items-center gap-2"
    >
      <div class="w-2 h-2 rounded-full bg-red-500"></div>
      <span class="text-xs font-bold text-slate-600 uppercase"
        >Confidential</span
      >
    </div>
  </div>
</div>
```

## API

### `exportToPptx(elementOrSelector, options)`

| Parameter           | Type                                                        | Description                                                                                                        |
| :------------------ | :---------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------- |
| `elementOrSelector` | `string` \| `HTMLElement` \| `Array<string \| HTMLElement>` | The DOM node(s) or ID selector(s) to convert. Can be a single element/selector or an array for multi-slide export. |
| `options`           | `object`                                                    | Configuration object.                                                                                              |

**Options Object:**

| Key               | Type     | Default        | Description                                   |
| :---------------- | :------- | :------------- | :-------------------------------------------- |
| `fileName`        | `string` | `"slide.pptx"` | The name of the downloaded file.              |
| `backgroundColor` | `string` | `null`         | Force a background color for the slide (hex). |

## Important Notes

1.  **CORS Images:** Because this library uses HTML5 Canvas to process rounded images, any external images must be served with `Access-Control-Allow-Origin: *` headers. If an image is "tainted" (CORS blocked), the browser will refuse to read its data, and it may appear blank in the PPTX.
2.  **Layout System:** The library does not "read" Flexbox or Grid definitions directly. Instead, it lets the browser render the layout, measures the final `x, y, width, height` (BoundingBox) of every element, and places them absolutely on the slide. This ensures 100% visual accuracy regardless of the layout method used.
3.  **Fonts:** PPTX files use the fonts installed on the viewer's OS. If you use a web font like "Inter", and the user doesn't have it installed, PowerPoint will fallback to Arial.

## License

MIT © [Atharva Dharmendra Jagtap](https://github.com/atharva9167j) and `dom-to-pptx` contributors.

## Acknowledgements

This project is built on top of [PptxGenJS](https://github.com/gitbrent/PptxGenJS). Huge thanks to the PptxGenJS maintainers and all contributors — dom-to-pptx leverages and extends their excellent work on PPTX generation.