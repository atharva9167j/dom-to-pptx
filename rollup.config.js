import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/index.js',
  output: [
    // ESM build for modern bundlers
    {
      file: 'dist/dom-to-pptx.mjs',
      format: 'es',
      sourcemap: false,
    },
    // CommonJS build for Node / require()
    {
      file: 'dist/dom-to-pptx.cjs',
      format: 'cjs',
      sourcemap: false,
      exports: 'named',
    },
    // UMD build for direct browser usage via script tag (lightweight, keeps pptxgenjs external)
    {
      file: 'dist/dom-to-pptx.min.js',
      format: 'umd',
      name: 'domToPptx',
      esModule: false,
      globals: {
        pptxgenjs: 'PptxGenJS',
      },
    },
    // Full standalone bundle (includes dependencies) — use this when you want a single <script> to work
    {
      file: 'dist/dom-to-pptx.bundle.js',
      format: 'umd',
      name: 'domToPptx',
      esModule: false,
      sourcemap: false,
    },
  ],
  plugins: [resolve(), commonjs()],
  // Keep conventional UMD/min file compatible with consumers that already load pptxgenjs separately.
  // For the standalone `dist/dom-to-pptx.bundle.js` we must NOT mark dependencies as external so Rollup will
  // include them. Therefore leave the external list empty (no externals).
  external: [],
};
