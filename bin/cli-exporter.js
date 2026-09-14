#!/usr/bin/env node

/**
 * dom-to-pptx-exporter  ─  Headless PPTX Exporter CLI
 *
 * Usage:
 *   dom-to-pptx-exporter <htmlFile> [options]
 *
 * Options:
 *   --output, -o   <path>          Output .pptx file path  [default: same dir as input]
 *   --selector     <css>           CSS selector for slide elements  [default: .slide]
 *   --inject                       Force-inject the local browser bundle even if lib detected
 *   --title        <text>          Presentation title metadata
 *   --author       <text>          Presentation author metadata
 *   --width        <number>        Slide width in inches  [default: 10]
 *   --height       <number>        Slide height in inches [default: 5.625]
 *   --browser-width, --bw <num>    Headless browser viewport width in pixels [default: width * 192]
 *   --browser-height, --bh <num>   Headless browser viewport height in pixels [default: height * 192]
 *   --template     <path>          Base the export on an existing .pptx (real master/layout background)
 *   --base-layout  <name>          Layout name from --template applied to every exported slide
 *   --help, -h                     Show this help message
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import JSZip from 'jszip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── ANSI helpers ─────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
};

const logo = `
${c.cyan} ____   ___  __  __   _____ ___    ____  ____  _____ ${c.reset}
${c.cyan}|  _ \\ / _ \\|  \\/  | |_   _/ _ \\  |  _ \\|  _ \\|_   _|${c.reset}
${c.cyan}| | | | | | | |\\/| |   | || | | | | |_) | |_) || |  ${c.reset}
${c.cyan}| |_| | |_| | |  | |   | || |_| | |  __/|  __/ | |  ${c.reset}
${c.cyan}|____/ \\___/|_|  |_|   |_| \\___/  |_|   |_|    |_|  ${c.reset}

       ${c.bold}${c.green}E X P O R T E R${c.reset}   ${c.dim}— Headless HTML to PPTX Conversion CLI${c.reset}
       ${c.dim}------------------------------------------------------${c.reset}
`;

// ─── Help Text ────────────────────────────────────────────────────────────────
function printHelp() {
  console.log(logo);
  console.log(`${c.bold}Usage:${c.reset}`);
  console.log(`  ${c.cyan}dom-to-pptx-exporter${c.reset} ${c.yellow}<htmlFile>${c.reset} [options]\n`);

  console.log(`${c.bold}Export Options:${c.reset}`);
  const opts = [
    ['--output,  -o  <path>', 'Output .pptx path (default: <input>.pptx)'],
    ['--selector, -s  <css>', 'CSS selector for slide elements (default: .slide)'],
    ['--inject', 'Force-inject the local browser bundle into the page'],
    ['--title        <text>', 'Presentation title metadata'],
    ['--author       <text>', 'Presentation author metadata'],
    ['--width        <num>', 'Slide width in inches (default: 10)'],
    ['--height       <num>', 'Slide height in inches (default: 5.625)'],
    ['--browser-width, --bw <num>', 'Viewport width in px (default: slide width * 192)'],
    ['--browser-height, --bh <num>', 'Viewport height in px (default: slide height * 192)'],
    ['--no-pseudo', 'Disable exporting CSS pseudo-elements (::before/::after)'],
    ['--template     <path>', 'Base the export on an existing .pptx (real master/layout background)'],
    ['--base-layout  <name>', 'Layout name from --template applied to every exported slide'],
    ['--help,    -h', 'Show this help message'],
  ];
  opts.forEach(([flag, desc]) => {
    console.log(`  ${c.yellow}${flag.padEnd(28)}${c.reset}  ${c.dim}${desc}${c.reset}`);
  });

  console.log(`\n${c.bold}Examples:${c.reset}`);
  console.log(`  ${c.dim}# Export using standard 16:9 slide size and corresponding viewport (1920x1080)${c.reset}`);
  console.log(`  ${c.cyan}dom-to-pptx-exporter${c.reset} slides.html\n`);

  console.log(`  ${c.dim}# Export with a custom browser viewport and slide aspect ratio${c.reset}`);
  console.log(`  ${c.cyan}dom-to-pptx-exporter${c.reset} slides.html --width 13.33 --height 7.5 --bw 1280 --bh 720\n`);
}

// ─── Arg Parser ───────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { _: [] };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      args.help = true;
    } else if ((a === '--output' || a === '-o') && argv[i + 1]) {
      args.output = argv[++i];
    } else if ((a === '--selector' || a === '-s') && argv[i + 1]) {
      args.selector = argv[++i];
    } else if (a === '--inject') {
      args.inject = true;
    } else if (a === '--no-pseudo') {
      args.noPseudo = true;
    } else if (a === '--title' && argv[i + 1]) {
      args.title = argv[++i];
    } else if (a === '--author' && argv[i + 1]) {
      args.author = argv[++i];
    } else if (a === '--width' && argv[i + 1]) {
      args.width = parseFloat(argv[++i]);
    } else if (a === '--height' && argv[i + 1]) {
      args.height = parseFloat(argv[++i]);
    } else if ((a === '--browser-width' || a === '--bw') && argv[i + 1]) {
      args.browserWidth = parseInt(argv[++i], 10);
    } else if ((a === '--browser-height' || a === '--bh') && argv[i + 1]) {
      args.browserHeight = parseInt(argv[++i], 10);
    } else if (a === '--template' && argv[i + 1]) {
      args.template = argv[++i];
    } else if (a === '--base-layout' && argv[i + 1]) {
      args.baseLayout = argv[++i];
    } else if (!a.startsWith('-')) {
      args._.push(a);
    }
    i++;
  }
  return args;
}

// ─── Export Command Execution ──────────────────────────────────────────────────
async function runExporter(argv) {
  const args = parseArgs(argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Find first positional argument
  let htmlSource = args._[0];
  if (htmlSource === 'export') {
    htmlSource = args._[1];
  }

  if (!htmlSource) {
    console.error(`${c.red}❌  No HTML file specified.${c.reset}`);
    console.error(
      `${c.cyan}💡  Try:${c.reset} Specify a path to a local HTML file or a URL (e.g. \`dom-to-pptx-exporter slides.html\`).`
    );
    console.error(`${c.dim}For options: dom-to-pptx-exporter --help${c.reset}\n`);
    process.exit(1);
  }

  // Resolve output path
  const isUrl = htmlSource.startsWith('http://') || htmlSource.startsWith('https://');
  let resolvedInput = htmlSource;
  if (!isUrl) {
    resolvedInput = path.resolve(htmlSource);
    if (!fs.existsSync(resolvedInput)) {
      console.error(`${c.red}❌  HTML file not found:${c.reset} ${resolvedInput}`);
      console.error(
        `${c.cyan}💡  Try:${c.reset} Check if the file path is correct, or if it is a URL, verify the protocol prefix (http:// or https://).`
      );
      process.exit(1);
    }
  }

  const defaultOutput = isUrl
    ? path.join(process.cwd(), 'presentation.pptx')
    : resolvedInput.replace(/\.html?$/i, '') + '.pptx';
  const outputPath = args.output ? path.resolve(args.output) : defaultOutput;

  // Resolve slide and browser dimensions using script scale (PPI = 192)
  const slideWidth = args.width || 10;
  const slideHeight = args.height || 5.625;
  const browserWidth = args.browserWidth || Math.round(slideWidth * 192);
  const browserHeight = args.browserHeight || Math.round(slideHeight * 192);

  // Build options for node-exporter
  const exporterOptions = {
    selector: args.selector || '.slide',
    injectBundle: args.inject || false,
    browserWidth,
    browserHeight,
    pptxOptions: {
      ...(args.title && { title: args.title }),
      ...(args.author && { author: args.author }),
      ...(args.template && { template: args.template }),
      // The CLI selects slides by CSS selector, with no way to assign a
      // different layout per slide — every exported slide uses this same
      // layout (or the template's own default layout if omitted). Per-slide
      // layout selection is a programmatic-API-only feature (see
      // docs/template-support.md).
      ...(args.baseLayout && { defaultBaseLayout: args.baseLayout }),
      // Only force explicit slide dimensions when the caller actually asked
      // for them. With --template and no --width/--height, exportToPptx
      // adopts the template's own declared slide size instead — passing our
      // 10x5.625in fallback here would silently override that.
      ...((args.width || args.height || !args.template) && { width: slideWidth, height: slideHeight }),
      includePseudoElements: !args.noPseudo,
    },
  };

  console.log(logo);
  console.log(`${c.bold}Exporting:${c.reset}      ${c.cyan}${resolvedInput}${c.reset}`);
  console.log(`${c.bold}Output:    ${c.reset}      ${c.green}${outputPath}${c.reset}`);
  console.log(
    `${c.bold}Slide Dimensions:${c.reset} ${c.yellow}${slideWidth}" x ${slideHeight}"${c.reset} (Viewport: ${c.yellow}${browserWidth}px x ${browserHeight}px${c.reset})`
  );
  console.log(
    `${c.bold}Mode:      ${c.reset}      ${c.yellow}programmatic${c.reset} (selector: ${c.dim}${exporterOptions.selector}${c.reset})`
  );
  console.log();

  let exportHtmlToPptx;
  try {
    const distPath = path.resolve(__dirname, '..', 'dist', 'dom-to-pptx-node.mjs');
    const srcPath = path.resolve(__dirname, '..', 'src', 'node-exporter.js');
    const importTarget = pathToFileURL(fs.existsSync(distPath) ? distPath : srcPath).href;
    ({ exportHtmlToPptx } = await import(importTarget));
  } catch (err) {
    console.error(`${c.red}❌  Failed to load the node exporter:${c.reset}`, err.message);
    console.error(`${c.cyan}💡  Try:${c.reset}`);
    console.error(`  1. Run "${c.bold}pnpm run build${c.reset}" to build the distribution bundles.`);
    console.error(
      `  2. Ensure all dependencies are installed using "${c.bold}pnpm install${c.reset}" (especially "${c.bold}puppeteer${c.reset}").`
    );
    process.exit(1);
  }

  try {
    process.stdout.write(`${c.dim}⏳  Launching headless browser...${c.reset}\n`);
    const buffer = await exportHtmlToPptx(htmlSource, exporterOptions);

    let effectiveWidth = slideWidth;
    let effectiveHeight = slideHeight;
    try {
      const zip = await JSZip.loadAsync(buffer);
      const xmlStr = await zip.file('ppt/presentation.xml').async('string');
      const sldSzMatch = xmlStr.match(/<[a-zA-Z0-9:]*sldSz\s+([^>]+)>/);
      if (sldSzMatch) {
        const attrs = sldSzMatch[1];
        const cxMatch = attrs.match(/cx=["'](\d+)["']/);
        const cyMatch = attrs.match(/cy=["'](\d+)["']/);
        if (cxMatch && cyMatch) {
          const cx = parseInt(cxMatch[1], 10);
          const cy = parseInt(cyMatch[1], 10);
          effectiveWidth = parseFloat((cx / 914400).toFixed(6));
          effectiveHeight = parseFloat((cy / 914400).toFixed(6));
        }
      }
    } catch (zipErr) {
      console.warn(
        `${c.yellow}⚠️  Warning: Failed to parse generated PPTX to verify dimensions: ${zipErr.message}${c.reset}`
      );
    }

    fs.writeFileSync(outputPath, buffer);
    console.log(`\n${c.green}${c.bold}✅  Export complete!${c.reset}`);
    console.log(`   ${c.dim}Saved to:${c.reset} ${c.cyan}${outputPath}${c.reset}`);
    console.log(
      `   ${c.dim}Effective Slide Dimensions:${c.reset} ${c.yellow}${effectiveWidth}" x ${effectiveHeight}"${c.reset}`
    );

    if (Math.abs(effectiveWidth - slideWidth) > 0.01 || Math.abs(effectiveHeight - slideHeight) > 0.01) {
      console.warn(
        `   ${c.yellow}⚠️  Warning: Requested dimensions (${slideWidth}" x ${slideHeight}") ` +
          `differ from effective slide dimensions (${effectiveWidth}" x ${effectiveHeight}").${c.reset}\n`
      );
    } else {
      console.log();
    }
    process.exit(0);
  } catch (err) {
    console.error(`\n${c.red}❌  Export failed:${c.reset}`, err.message);
    console.error(`${c.cyan}💡  Try:${c.reset}`);
    if (err.message.includes('selector') || err.message.includes('matching')) {
      console.error(
        `  - Make sure elements matching the CSS selector "${exporterOptions.selector}" exist in the HTML file.`
      );
      console.error(
        `  - If the HTML loads content dynamically, verify that the slides are fully rendered when network is idle.`
      );
    } else if (
      err.message.includes('puppeteer') ||
      err.message.includes('browser') ||
      err.message.includes('chrome') ||
      err.message.includes('executable')
    ) {
      console.error(
        `  - Ensure a compatible web browser (Google Chrome, Microsoft Edge, Chromium, or Firefox) is installed on your system.`
      );
      console.error(
        `  - On Windows, install Chrome or Edge. On Linux, run "sudo apt install chromium-browser" or install Chrome.`
      );
      console.error(
        `  - Alternatively, run with internet access to let dom-to-pptx auto-download a headless Chrome binary.`
      );
    } else {
      console.error(`  - Double check that the HTML file is valid and doesn't contain syntax errors.`);
      console.error(`  - Check console logs of the browser or verify page structure.`);
    }
    process.exit(1);
  }
}

export { runExporter };

const isMain =
  process.argv[1] && (process.argv[1].endsWith('cli-exporter.js') || process.argv[1].endsWith('dom-to-pptx-exporter'));
if (isMain) {
  runExporter(process.argv.slice(2));
}
