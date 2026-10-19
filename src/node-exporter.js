import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Compute the browser launch args for a given Puppeteer product.
 *
 * Chrome / Chromium / Edge get:
 *   - `--no-sandbox` and `--disable-setuid-sandbox` because Puppeteer
 *     runs the browser as an unprivileged user in most CI/server envs
 *     where the setuid sandbox is unavailable.
 *   - `--allow-file-access-from-files` so that XHR / fetch() from a
 *     file:// page can reach other file:// URLs. Without this flag,
 *     autoEmbedFonts silently fails whenever the caller's @font-face
 *     rules point at local .ttf files (a common setup for offline deck
 *     builds), and PowerPoint falls back to a system font on open. The
 *     flag scopes only to file:// origins, so it does not weaken
 *     security when exporting http(s):// pages.
 *
 * Firefox does not accept the Chrome flags and manages its own
 * sandboxing, so we pass an empty array there.
 *
 * Exported so callers can override or extend the default set, and so
 * the default is unit-testable without spinning up a browser.
 *
 * @param {'chrome'|'firefox'} product
 * @returns {string[]}
 */
export function getLaunchArgs(product) {
  if (product === 'firefox') return [];
  return ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files'];
}

// ─── Platform-aware browser search map ───────────────────────────────────────
// Each entry is { name, product, paths[] }.
// `product` is 'chrome' or 'firefox' — controls puppeteer launch args.
// NOTE: Safari is not listed (it doesn't implement Chrome DevTools Protocol).
const PLATFORM_BROWSERS = {
  win32: [
    {
      name: 'Google Chrome',
      product: 'chrome',
      paths: [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      ],
    },
    {
      name: 'Microsoft Edge',
      product: 'chrome', // Edge is Chromium-based, uses same protocol
      paths: [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      ],
    },
  ],
  linux: [
    {
      name: 'Google Chrome',
      product: 'chrome',
      paths: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/snap/bin/google-chrome'],
    },
    {
      name: 'Chromium',
      product: 'chrome',
      paths: ['/usr/bin/chromium-browser', '/usr/bin/chromium', '/snap/bin/chromium'],
    },
    {
      name: 'Firefox',
      product: 'firefox', // Puppeteer supports Firefox via WebDriver BiDi (v21+)
      paths: ['/usr/bin/firefox', '/snap/bin/firefox', '/usr/lib/firefox/firefox'],
    },
  ],
  darwin: [
    {
      name: 'Google Chrome',
      product: 'chrome',
      paths: [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      ],
    },
    {
      name: 'Chromium',
      product: 'chrome',
      paths: ['/Applications/Chromium.app/Contents/MacOS/Chromium'],
    },
    // Safari excluded — does not implement Chrome DevTools Protocol
  ],
};

/**
 * Resolves a browser executable. Priority order:
 *  1. Puppeteer's bundled Chrome (installed via postinstall or `puppeteer browsers install`)
 *  2. Platform-specific system browsers (Chrome/Edge on Windows, Chrome/Chromium/Firefox on Linux,
 *     Chrome/Chromium on macOS — Safari excluded, no CDP support)
 *  3. Auto-install headless Chrome via @puppeteer/browsers (one-time, ~150 MB)
 *
 * @param {object} puppeteer - The imported puppeteer module
 * @returns {Promise<{ executablePath: string, product: 'chrome' | 'firefox' }>}
 */
async function ensureBrowser(puppeteer) {
  // 1. Puppeteer's bundled Chrome
  try {
    const p = puppeteer.executablePath();
    if (p && fs.existsSync(p)) {
      return { executablePath: p, product: 'chrome' };
    }
  } catch {
    // executablePath() throws if Chrome was never downloaded
  }

  // 2. Platform-aware system browser search
  const platform = process.platform; // 'win32' | 'linux' | 'darwin'
  const candidates = PLATFORM_BROWSERS[platform] ?? PLATFORM_BROWSERS.linux;

  for (const browser of candidates) {
    for (const candidate of browser.paths) {
      if (fs.existsSync(candidate)) {
        console.log(`Using system browser: ${browser.name} → ${candidate}`);
        return { executablePath: candidate, product: browser.product };
      }
    }
  }

  // 3. Auto-install headless Chrome via @puppeteer/browsers
  console.log('No compatible browser found. Installing headless Chrome (one-time ~150 MB)...');
  console.log('This only happens once. Subsequent runs will reuse the cached binary.\n');

  const { install, Browser, resolveBuildId, detectBrowserPlatform } = await import('@puppeteer/browsers');

  const cacheDir = path.join(os.homedir(), '.cache', 'puppeteer');
  const detectedPlatform = detectBrowserPlatform();

  let buildId;
  try {
    buildId = await resolveBuildId(Browser.CHROME, detectedPlatform, 'stable');
  } catch (err) {
    throw new Error(
      `Unable to resolve stable Chrome build via @puppeteer/browsers: ${err.message}.\n` +
        `Ensure you have an active internet connection to download the headless browser automatically, ` +
        `or install Chrome/Edge/Firefox locally on your system.`
    );
  }

  let lastPercent = -1;
  let result;

  try {
    result = await install({
      browser: Browser.CHROME,
      buildId,
      cacheDir,
      downloadProgressCallback(downloaded, total) {
        if (!total) return;
        const pct = Math.floor((downloaded / total) * 100);
        if (pct !== lastPercent && pct % 5 === 0) {
          lastPercent = pct;
          const filled = Math.floor(pct / 5);
          const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
          process.stdout.write(
            `\r  [${bar}] ${pct}%  (${(downloaded / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB)`
          );
        }
      },
    });
  } catch (err) {
    throw new Error(
      `Headless Chrome installation failed: ${err.message}.\n` +
        `Ensure you have an active internet connection and write permissions to ${cacheDir}, ` +
        `or install Chrome/Edge/Firefox locally on your system.`
    );
  }

  process.stdout.write('\n');
  console.log(`\nChrome installed at: ${result.executablePath}\n`);
  return { executablePath: result.executablePath, product: 'chrome' };
}

/**
 * Headless server-side HTML-to-PPTX exporter.
 * Launches a headless browser, navigates to the HTML source,
 * handles optional script injections, and extracts the PPTX blob.
 *
 * @param {string} htmlSource - Path to a local HTML file or a URL.
 * @param {Object} [options={}] - Export configuration options.
 * @param {string} [options.selector='.slide'] - CSS selector for slide elements.
 * @param {boolean} [options.injectBundle=false] - Force injection of the local browser bundle.
 * @param {Object} [options.pptxOptions={}] - Settings passed directly to exportToPptx. If
 *   `pptxOptions.template` is a path to a local file, it is read from disk and forwarded into
 *   the page as raw bytes (exportToPptx's `template` option otherwise only accepts a URL
 *   string or in-memory bytes, since it always runs inside a browser/page context).
 * @returns {Promise<Buffer>} - PPTX output buffer.
 */
export async function exportHtmlToPptx(htmlSource, options = {}) {
  const puppeteer = await import('puppeteer').then((m) => m.default || m);

  // Resolve browser — self-managing, no external setup required
  const { executablePath, product } = await ensureBrowser(puppeteer);

  const launchArgs = getLaunchArgs(product);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      browser: product, // 'chrome' | 'firefox'
      args: launchArgs,
    });
  } catch (err) {
    throw new Error(
      `Failed to launch headless browser (executable: ${executablePath}): ${err.message}.\n` +
        `Make sure you have all system dependencies for Chrome/Chromium installed.`
    );
  }

  try {
    const page = await browser.newPage();
    if (options.browserWidth && options.browserHeight) {
      await page.setViewport({
        width: options.browserWidth,
        height: options.browserHeight,
      });
    }

    // 1. Navigate to HTML source (file path or URL)
    if (fs.existsSync(htmlSource)) {
      const absolutePath = path.resolve(htmlSource);
      // Use proper file:// URL (handles Windows drive letters)
      const fileUrl = new URL(`file:///${absolutePath.replace(/\\/g, '/')}`).href;
      try {
        await page.goto(fileUrl, { waitUntil: 'networkidle0' });
      } catch (err) {
        throw new Error(`Failed to load local HTML file: ${err.message}`);
      }
    } else if (htmlSource.startsWith('http://') || htmlSource.startsWith('https://')) {
      try {
        await page.goto(htmlSource, { waitUntil: 'networkidle0' });
      } catch (err) {
        throw new Error(`Failed to load URL "${htmlSource}": ${err.message}`);
      }
    } else {
      // Inline HTML content fallback
      try {
        await page.setContent(htmlSource, { waitUntil: 'networkidle0' });
      } catch (err) {
        throw new Error(`Failed to set inline HTML content: ${err.message}`);
      }
    }

    // 2. Check for dom-to-pptx presence
    let hasLib = await page.evaluate(() => typeof window.domToPptx !== 'undefined');

    if (!hasLib || options.injectBundle) {
      if (!options.injectBundle) {
        console.log('dom-to-pptx library not detected on page. Injecting local bundle...');
      } else {
        console.log('Injecting local bundle (--inject flag)...');
      }

      const __dirname = path.dirname(fileURLToPath(import.meta.url));

      // Look for bundle in typical distribution folder paths
      const candidates = [
        path.resolve(__dirname, 'dom-to-pptx.bundle.js'),
        path.resolve(__dirname, '..', 'dist', 'dom-to-pptx.bundle.js'),
        path.resolve(__dirname, 'dist', 'dom-to-pptx.bundle.js'),
      ];

      const bundlePath = candidates.find((p) => fs.existsSync(p));
      if (!bundlePath) {
        throw new Error(`Browser bundle not found. Please compile the UMD bundle first by running 'pnpm run build'.`);
      }

      try {
        await page.addScriptTag({ path: bundlePath });
      } catch (err) {
        throw new Error(`Failed to inject local script bundle: ${err.message}`);
      }

      // Re-verify library is now loaded
      hasLib = await page.evaluate(() => typeof window.domToPptx !== 'undefined');
      if (!hasLib) {
        throw new Error('Failed to load dom-to-pptx library after injecting the bundle.');
      }
    } else {
      console.log('dom-to-pptx library detected on page.');
    }

    const selector = options.selector || '.slide';
    console.log(`Running programmatic extraction for slide elements matching: ${selector}`);

    // exportToPptx's `template` option runs inside the page and only accepts
    // a URL string or in-memory bytes — it has no `fs` access. A local file
    // path here is read on this (Node) side and forwarded as base64, then
    // reconstructed into a Uint8Array inside the page below.
    const pptxOptions = { ...(options.pptxOptions || {}) };
    if (
      typeof pptxOptions.template === 'string' &&
      !/^https?:\/\//i.test(pptxOptions.template) &&
      fs.existsSync(pptxOptions.template)
    ) {
      const templateBuffer = fs.readFileSync(path.resolve(pptxOptions.template));
      pptxOptions.template = templateBuffer.toString('base64');
      pptxOptions._templateEncoding = 'base64';
    }

    let dataUrl;
    try {
      dataUrl = await page.evaluate(
        async (sel, pptxOpts) => {
          if (!window.domToPptx || !window.domToPptx.exportToPptx) {
            throw new Error('dom-to-pptx library not found on the page context.');
          }

          const targets = Array.from(document.querySelectorAll(sel));
          if (targets.length === 0) {
            throw new Error(`No elements matching slide selector "${sel}" found.`);
          }

          let resolvedPptxOpts = pptxOpts;
          if (pptxOpts && pptxOpts._templateEncoding === 'base64' && typeof pptxOpts.template === 'string') {
            const binary = atob(pptxOpts.template);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            resolvedPptxOpts = { ...pptxOpts, template: bytes };
            delete resolvedPptxOpts._templateEncoding;
          }

          const blob = await window.domToPptx.exportToPptx(targets, {
            ...resolvedPptxOpts,
            skipDownload: true,
          });

          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        },
        selector,
        pptxOptions
      );
    } catch (err) {
      throw new Error(`Programmatic export failed: ${err.message}`);
    }

    const base64Data = dataUrl.split(',')[1];
    return Buffer.from(base64Data, 'base64');
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
