import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/dom-to-pptx.min.js',
    format: 'umd',
    name: 'domToPptx',
    esModule: false,
    globals: {
      'pptxgenjs': 'PptxGenJS'
    }
  },
  plugins: [
    resolve(),
    commonjs()
  ],
  external: ['pptxgenjs']
};