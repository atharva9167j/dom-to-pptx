import { ExportOptions } from './index';

export interface NodeExportOptions {
  selector?: string;
  injectBundle?: boolean;
  browserWidth?: number;
  browserHeight?: number;
  pptxOptions?: ExportOptions;
}

export function getLaunchArgs(product?: string): string[];

export function exportHtmlToPptx(
  htmlSource: string,
  options?: NodeExportOptions
): Promise<Buffer>;
