# dom-to-pptx

**The High-Fidelity HTML to PowerPoint Converter (v1.0.2).**

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

document.getElementById('download-btn').addEventListener('click', async () => {
  // Pass the CSS selector of the container you want to turn into a slide
  await exportToPptx('#slide-container', {
    fileName: 'dashboard-report.pptx',
  });
});
```

### 2. Multi-Slide Example

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

### 3. Direct Browser Usage (via Script Tag)

For direct inclusion in a web page using a `<script>` tag, you can use the UMD bundle:

```html
<script src="./node_modules/dom-to-pptx/dist/dom-to-pptx.min.js"></script>
<script>
  document.getElementById('download-btn').addEventListener('click', async () => {
    // The library is available globally as `domToPptx`
    await domToPptx.exportToPptx('#slide-container', {
      fileName: 'dashboard-report.pptx',
    });
  });
</script>
```

### 4. Recommended HTML Structure

### Recommended HTML Structure

For the best results, treat your container as a fixed-size canvas. We recommend building your slide at **1920x1080px**. The library will handle the downscaling.

```html
<!-- Container (16:9 Aspect Ratio) -->
<!-- The library will capture this background color/gradient automatically -->
<div
  id="slide-container"
  class="slide w-[1000px] h-[562px] bg-white mx-auto shadow-xl relative overflow-hidden rounded-lg flex items-center justify-center p-10"
>
  <div
    class="w-full max-w-3xl bg-white rounded-2xl shadow-xl overflow-hidden grid md:grid-cols-2 items-center 
border-l-2 border-indigo-500"
  >
    <div class="p-12">
      <h2 class="text-xl font-semibold text-indigo-500 uppercase tracking-wide mb-2">
        Core Concept
      </h2>
      <h3 class="text-4xl font-bold text-slate-800 mb-6">From Bit to Qubit</h3>
      <div class="space-y-6 text-slate-600">
        <div class="flex items-start gap-4">
          <div
            class="flex-shrink-0 w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center font-bold text-slate-700"
          >
            B
          </div>
          <div>
            <h4 class="font-bold text-slate-700">Classical Bit</h4>
            <p>
              A fundamental unit of information that is either
              <span class="font-semibold text-indigo-600">0</span> or
              <span class="font-semibold text-indigo-600">1</span>.
            </p>
          </div>
        </div>
        <div class="flex items-start gap-4">
          <div
            class="flex-shrink-0 w-8 h-8 bg-indigo-200 rounded-full flex items-center justify-center font-bold text-indigo-700"
          >
            Q
          </div>
          <div>
            <h4 class="font-bold text-slate-700">Quantum Bit (Qubit)</h4>
            <p>
              Can be <span class="font-semibold text-indigo-600">0</span>,
              <span class="font-semibold text-indigo-600">1</span>, or a
              <span class="font-semibold text-indigo-600">superposition</span>
              of both states simultaneously.
            </p>
          </div>
        </div>
      </div>
    </div>
    <div class="h-64 md:h-full">
      <img
        src="https://picsum.photos/800/600?random=2"
        alt="Stylized representation of a qubit"
        class="w-full h-full object-cover"
      />
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
