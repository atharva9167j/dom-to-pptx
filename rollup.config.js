// rollup.config.js
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import polyfillNode from 'rollup-plugin-polyfill-node';

const input = 'src/index.js';

// Config A: produce module (mjs), cjs and a lightweight UMD that keeps `pptxgenjs` external.
const configModules = {
  input,
  output: [
    {
      file: 'dist/dom-to-pptx.mjs',
      format: 'es',
      sourcemap: false,
    },
    {
      file: 'dist/dom-to-pptx.cjs',
      format: 'cjs',
      sourcemap: false,
      exports: 'named',
    },
    {
      file: 'dist/dom-to-pptx.min.js',
      format: 'umd',
      name: 'domToPptx',
      esModule: false,
      globals: {
        pptxgenjs: 'PptxGenJS',
      },
    },
  ],
  plugins: [resolve(), commonjs()],
  external: ['pptxgenjs'],
};

// Config B: produce a single standalone UMD bundle that includes dependencies (for script-tag consumers).
const configBundle = {
  input,
  output: {
    file: 'dist/dom-to-pptx.bundle.js',
    format: 'umd',
    name: 'domToPptx',
    esModule: false,
    sourcemap: false,
    intro: 'var global = typeof self !== "undefined" ? self : this;', 
  },
  plugins: [
    // 1. Resolve must be configured to pick browser versions of dependencies
    resolve({
      browser: true, 
      preferBuiltins: false 
    }),
    // 2. CommonJS transforms CJS modules to ESM
    commonjs(),
    // 3. Polyfills for any remaining Node logic (like Buffer in older JSZip versions)
    polyfillNode(),
  ],
  external: [],
};

export default [configModules, configBundle];
