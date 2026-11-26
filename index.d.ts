/**
 * Single font definition for manual font embedding.
 */
export interface FontDefinition {
  name: string;
  url: string;
}

/**
 * List style configuration overrides.
 */
export interface ListConfig {
  color?: string;
  spacing?: {
    before?: number;
    after?: number;
  };
}

/**
 * Slide target with optional layout specification from a template.
 */
export interface SlideTargetDescriptor {
  element: HTMLElement | string;
  baseLayout?: string;
}

/**
 * Single slide or target descriptor.
 */
export type SlideTarget = HTMLElement | string | SlideTargetDescriptor;

/**
 * Configuration options for exportToPptx.
 */
export interface ExportOptions {
  /**
   * Name of the exported PowerPoint file (defaults to "export.pptx").
   */
  fileName?: string;

  /**
   * Automatically detect and embed web fonts (defaults to true).
   */
  autoEmbedFonts?: boolean;

  /**
   * Explicit array of fonts to embed ({ name, url }).
   */
  fonts?: FontDefinition[];

  /**
   * If true, prevents automatic browser download and returns the PPTX Blob.
   */
  skipDownload?: boolean;

  /**
   * If true, preserves SVG elements as vector shapes in PowerPoint.
   */
  svgAsVector?: boolean;

  /**
   * PowerPoint slide layout name (e.g. 'LAYOUT_16x9', 'LAYOUT_4x3', 'LAYOUT_WIDE').
   */
  layout?: string;

  /**
   * Custom slide width in inches (requires height to be set).
   */
  width?: number;

  /**
   * Custom slide height in inches (requires width to be set).
   */
  height?: number;

  /**
   * Global configuration overrides for list bullets and spacing.
   */
  listConfig?: ListConfig;

  /**
   * Capture CSS pseudo-elements (::before/::after), defaults to true.
   */
  includePseudoElements?: boolean;

  /**
   * Language code for text runs and spell-checking (e.g. 'de-DE', 'en-US').
   * Unset by default.
   */
  lang?: string;

  /**
   * Base presentation template (.pptx) URL or binary buffer.
   * Slides will inherit real slide master and layout backgrounds.
   */
  template?: string | ArrayBuffer | Uint8Array | Blob;

  /**
   * Layout name from template applied to slides that don't specify baseLayout.
   */
  defaultBaseLayout?: string;

  /**
   * Skip ZIP normalization (DEFLATE compression and content types cleanup).
   */
  skipNormalize?: boolean;
}

/**
 * Template layout descriptor returned by getTemplateLayouts.
 */
export interface TemplateLayout {
  id: string;
  name: string;
}

/**
 * Options for browser animation previewer.
 */
export interface ApplyBrowserAnimationsOptions {
  enableClick?: boolean;
}

/**
 * Main export function converting DOM elements into a PowerPoint presentation.
 */
export function exportToPptx(
  target: SlideTarget | SlideTarget[],
  options?: ExportOptions
): Promise<Blob>;

/**
 * Introspect slide layout names declared inside an existing .pptx template.
 */
export function getTemplateLayouts(
  template: string | ArrayBuffer | Uint8Array | Blob
): Promise<TemplateLayout[]>;

/**
 * Applies browser animation inline styles for PowerPoint timeline parity.
 */
export function applyBrowserAnimations(
  parentElement: HTMLElement,
  options?: ApplyBrowserAnimationsOptions
): void;
