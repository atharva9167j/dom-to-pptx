# dom-to-pptx-exporter

Headless CLI tool to convert HTML/CSS/URLs to PPTX presentation files using Puppeteer and `dom-to-pptx`.

## Usage

You can run the dedicated binary or the unified router command:

```bash
# Standalone command
npx dom-to-pptx-exporter <htmlFileOrUrl> [options]

# Or via unified router
npx dom-to-pptx export <htmlFileOrUrl> [options]
```

## Options

- `--output, -o <path>`: Output `.pptx` file path (defaults to `<input>.pptx`).
- `--selector, -s <css>`: CSS selector for slide elements (defaults to `.slide`).
- `--inject`: Force-inject the local browser bundle into the page context.
- `--title <text>`: Presentation title metadata.
- `--author <text>`: Presentation author metadata.
- `--width <num>`: Slide width in inches (default: `10`).
- `--height <num>`: Slide height in inches (default: `5.625`).
- `--browser-width, --bw <num>`: Viewport width in pixels (defaults to slide width \* 192).
- `--browser-height, --bh <num>`: Viewport height in pixels (defaults to slide height \* 192).
- `--no-pseudo`: Disable exporting CSS pseudo-elements (`::before`/`::after`).
- `--template <path>`: Base export on an existing `.pptx` template file.
- `--base-layout <name>`: Layout name from `--template` applied to every slide.
- `--lang <code>`: Language code for text and spell-check (e.g. `de-DE`, `en-US`).
- `--help, -h`: Show help message.

## Examples

```bash
# Standard 16:9 export
npx dom-to-pptx-exporter slides.html --output presentation.pptx

# Export with template and German language
npx dom-to-pptx-exporter slides.html --template corporate.pptx --base-layout "Content Light" --lang de-DE

# Custom dimensions and viewport
npx dom-to-pptx-exporter slides.html --width 13.33 --height 7.5 --bw 1280 --bh 720
```
