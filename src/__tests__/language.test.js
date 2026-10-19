import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { exportToPptx } from '../index.js';

const mockAddText = vi.fn();
const mockAddTable = vi.fn();
const mockAddSlide = vi.fn(() => ({
  addText: mockAddText,
  addShape: vi.fn(),
  addImage: vi.fn(),
  addTable: mockAddTable,
  addNotes: vi.fn(),
}));

vi.mock('pptxgenjs', () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return {
        defineLayout: vi.fn(),
        addSlide: mockAddSlide,
        write: vi.fn(() => Promise.resolve('')),
      };
    }),
  };
});

function buildSlide() {
  const container = document.createElement('div');
  container.className = 'slide';

  const ul = document.createElement('ul');
  const li = document.createElement('li');
  li.textContent = 'Umsatz';
  ul.appendChild(li);

  const table = document.createElement('table');
  table.innerHTML = '<tr><td>Quartal</td><td>Wert</td></tr>';

  container.append(ul, table);
  document.body.appendChild(container);

  container.getBoundingClientRect = () => ({ width: 960, height: 540, left: 0, top: 0, right: 960, bottom: 540 });
  ul.getBoundingClientRect = () => ({ width: 900, height: 100, left: 0, top: 0, right: 900, bottom: 100 });
  li.getBoundingClientRect = () => ({ width: 900, height: 50, left: 0, top: 0, right: 900, bottom: 50 });
  table.getBoundingClientRect = () => ({ width: 480, height: 40, left: 0, top: 200, right: 480, bottom: 240 });

  return container;
}

function textRunOptions() {
  return mockAddText.mock.calls.map(([, options]) => options);
}

function tableCellOptions() {
  return mockAddTable.mock.calls.flatMap(([rows]) => rows.flat().map((cell) => cell.options));
}

describe('options.lang', () => {
  beforeAll(() => {
    // Mock HTMLCanvasElement.prototype.getContext for JSDOM env
    let fillStyle = '';
    HTMLCanvasElement.prototype.getContext = () => ({
      get fillStyle() {
        return fillStyle;
      },
      set fillStyle(val) {
        fillStyle = val;
      },
      clearRect: () => {},
      fillRect: () => {},
      getImageData: () => ({ data: [0, 0, 0, 0] }),
    });
  });

  beforeEach(() => {
    mockAddText.mockClear();
    mockAddTable.mockClear();
  });

  it.each(['de-DE', 'fr-FR', 'es-ES', 'pt-BR', 'it-IT', 'nl-NL', 'pl-PL', 'ja-JP', 'zh-CN', 'ko-KR', 'ar-SA'])(
    'tags text boxes and table cells with %s',
    async (lang) => {
      const container = buildSlide();

      await exportToPptx(container, { skipDownload: true, skipNormalize: true, lang });

      expect(mockAddText).toHaveBeenCalled();
      expect(mockAddTable).toHaveBeenCalled();
      expect(textRunOptions().every((options) => options.lang === lang)).toBe(true);
      expect(tableCellOptions().every((options) => options.lang === lang)).toBe(true);

      document.body.removeChild(container);
    }
  );

  it('leaves the language unset when the option is omitted', async () => {
    const container = buildSlide();

    await exportToPptx(container, { skipDownload: true, skipNormalize: true });

    expect(mockAddText).toHaveBeenCalled();
    expect(textRunOptions().some((options) => 'lang' in options)).toBe(false);
    expect(tableCellOptions().some((options) => 'lang' in options)).toBe(false);

    document.body.removeChild(container);
  });
});
