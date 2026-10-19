#!/usr/bin/env node

// Thin executable entrypoint: kept separate from cli-exporter-core.js so the
// shebang above never has to survive being parsed by a JS module bundler —
// tests (and any other consumer that wants to import the CLI's exports
// directly) import cli-exporter-core.js instead.
export {
  runExporter,
  resolveSlideSizeOptions,
  computeSizeMismatch,
  resolveTemplateSldSzInches,
  parseArgs,
} from './cli-exporter-core.js';
import { runExporter } from './cli-exporter-core.js';

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('cli-exporter.js') ||
    process.argv[1].endsWith('cli-exporter-core.js') ||
    process.argv[1].endsWith('dom-to-pptx-exporter'));
if (isMain) {
  runExporter(process.argv.slice(2));
}
