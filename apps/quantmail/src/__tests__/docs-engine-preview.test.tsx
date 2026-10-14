// @vitest-environment jsdom
// On-device document preview (Drive): loading → pages / sheets, every failure ends in a plain
// message with a way out, nothing is fetched for files over the limit, documents are closed.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import type { Root } from 'react-dom/client';
import {
  DocumentEnginePreview,
  columnLetters,
  looksNumeric,
  truncationNote,
} from '../components/drive/DocumentEnginePreview';
import type { DocsEngineClient, WorkbookPreview } from '../lib/docs-engine/client';

function fakeClient(overrides: Partial<Record<'open' | 'render' | 'close' | 'previewWorkbook', ReturnType<typeof vi.fn>>> = {}) {
  return {
    open: vi.fn(async () => ({ docId: 7, pageCount: 2, pageSizes: [612, 792, 792, 612], title: 'Quarterly report' })),
    render: vi.fn(async () => ({ width: 2, height: 2, rgba: new Uint8ClampedArray(16) })),
    close: vi.fn(async () => undefined),
    previewWorkbook: vi.fn(async (): Promise<WorkbookPreview> => ({ sheets: [], warnings: [] })),
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

async function mount(element: React.ReactElement) {
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  // Let the load → open chain settle.
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function unmount() {
  const { act } = await import('react');
  await act(async () => root.unmount());
  container.remove();
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no canvas backend; the component skips drawing when there is no 2D context.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DocumentEnginePreview — pages', () => {
  it('fetches the bytes, opens the document and renders visible pages', async () => {
    const client = fakeClient();
    const bytes = new ArrayBuffer(10);
    const loadBytes = vi.fn(async (signal: AbortSignal) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      return bytes;
    });
    await mount(<DocumentEnginePreview kind="pdf" name="report.pdf" size={10} loadBytes={loadBytes} client={client as unknown as DocsEngineClient} />);

    expect(loadBytes).toHaveBeenCalledTimes(1);
    expect(client.open).toHaveBeenCalledWith('pdf', 'report.pdf', bytes);
    expect(container.textContent).toContain('Quarterly report');
    expect(container.textContent).toContain('Page 1 of 2');
    const pages = container.querySelectorAll('[role="img"]');
    expect(Array.from(pages).map((p) => p.getAttribute('aria-label'))).toEqual(['Page 1 of 2', 'Page 2 of 2']);
    // Second page is landscape: placeholders keep each page's own aspect ratio.
    const boxes = container.querySelectorAll<HTMLElement>('[data-page]');
    expect(boxes[1]!.style.aspectRatio).toBe('792 / 612');
    expect(client.render).toHaveBeenCalledWith(7, 0, expect.any(Number));
    expect(client.render).toHaveBeenCalledWith(7, 1, expect.any(Number));
    expect(container.textContent).toContain('Rendered on this device');
    const notices = container.querySelector('a[href$="/licenses/NOTICES.txt"]');
    expect(notices?.getAttribute('rel')).toContain('noopener');

    await unmount();
    expect(client.close).toHaveBeenCalledWith(7);
  });

  it('calls slides "Slide"', async () => {
    const client = fakeClient({ open: vi.fn(async () => ({ docId: 1, pageCount: 3, pageSizes: [960, 540, 960, 540, 960, 540], title: null })) });
    await mount(<DocumentEnginePreview kind="slides" name="deck.pptx" loadBytes={async () => new ArrayBuffer(1)} client={client as unknown as DocsEngineClient} />);
    expect(container.textContent).toContain('Slide 1 of 3');
    expect(container.textContent).toContain('Presentation');
    await unmount();
  });

  it('zooms from fit-to-width in steps, re-drawing pages at the new resolution', async () => {
    const client = fakeClient();
    await mount(<DocumentEnginePreview kind="pdf" name="report.pdf" loadBytes={async () => new ArrayBuffer(1)} client={client as unknown as DocsEngineClient} />);
    const { act } = await import('react');
    const button = (label: string) => container.querySelector<HTMLButtonElement>(`[role="group"][aria-label="Zoom"] button[aria-label^="${label}"]`)!;
    const click = async (label: string) => {
      await act(async () => {
        button(label).click();
      });
      for (let i = 0; i < 5; i++) await act(async () => Promise.resolve());
    };
    const lastScale = (page: number) => {
      const calls = client.render.mock.calls.filter((call) => call[1] === page);
      return calls[calls.length - 1]![2] as number;
    };
    const firstPage = () => container.querySelector<HTMLElement>('[data-page="0"]')!;

    const fit = lastScale(0);
    expect(button('100%').textContent).toBe('100%');
    expect(firstPage().style.width).toBe('100%');

    await click('Zoom in');
    expect(firstPage().style.width).toBe('125%');
    expect(lastScale(0)).toBeCloseTo(fit * 1.25, 6);
    expect(lastScale(1)).toBeGreaterThan(0);
    expect(button('125%').getAttribute('title')).toBe('Fit to width');

    await click('Zoom in');
    await click('Zoom in');
    expect(firstPage().style.width).toBe('200%');
    expect(lastScale(0)).toBeCloseTo(fit * 2, 6);

    // The percentage resets to fit-to-width.
    await click('200%');
    expect(firstPage().style.width).toBe('100%');
    expect(lastScale(0)).toBeCloseTo(fit, 6);

    await click('Zoom out');
    await click('Zoom out');
    expect(firstPage().style.width).toBe('50%');
    expect(button('Zoom out').disabled).toBe(true);
    expect(button('Zoom in').disabled).toBe(false);
    // Pages and the page counter are unaffected by zoom.
    expect(container.querySelectorAll('[data-page]')).toHaveLength(2);
    expect(container.textContent).toContain('Page 1 of 2');
    await unmount();
  });

  it('does not re-draw a page whose resolution is already close enough', async () => {
    const client = fakeClient();
    await mount(<DocumentEnginePreview kind="pdf" name="report.pdf" loadBytes={async () => new ArrayBuffer(1)} client={client as unknown as DocsEngineClient} />);
    const before = client.render.mock.calls.length;
    expect(before).toBe(2); // the two pages, once each
    const { act } = await import('react');
    for (let i = 0; i < 5; i++) await act(async () => Promise.resolve());
    expect(client.render.mock.calls.length).toBe(before);
    await unmount();
  });

  it('shows a download-instead message for password-protected files, without a retry', async () => {
    const onDownload = vi.fn();
    const client = fakeClient({ open: vi.fn(async () => Promise.reject(new Error('E_PASSWORD: encrypted'))) });
    await mount(
      <DocumentEnginePreview kind="pdf" name="locked.pdf" loadBytes={async () => new ArrayBuffer(1)} onDownload={onDownload} client={client as unknown as DocsEngineClient} />,
    );
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('password-protected');
    const buttons = Array.from(container.querySelectorAll('button')).map((b) => b.textContent);
    expect(buttons).toEqual(['Download']);
    const { act } = await import('react');
    await act(async () => {
      container.querySelector('button')!.click();
    });
    expect(onDownload).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it('surfaces a fetch failure verbatim and retries on request', async () => {
    const loadBytes = vi
      .fn()
      .mockRejectedValueOnce(new Error('This file is quarantined. Contact your administrator.'))
      .mockResolvedValueOnce(new ArrayBuffer(1));
    const client = fakeClient();
    await mount(<DocumentEnginePreview kind="word" name="a.docx" loadBytes={loadBytes} client={client as unknown as DocsEngineClient} />);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('This file is quarantined. Contact your administrator.');
    const retry = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Try again')!;
    const { act } = await import('react');
    await act(async () => {
      retry.click();
    });
    for (let i = 0; i < 5; i++) await act(async () => Promise.resolve());
    expect(loadBytes).toHaveBeenCalledTimes(2);
    expect(client.open).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Page 1 of 2');
    await unmount();
  });

  it('does not fetch files over the engine limit', async () => {
    const loadBytes = vi.fn(async () => new ArrayBuffer(1));
    await mount(<DocumentEnginePreview kind="pdf" name="huge.pdf" size={500 * 1024 * 1024} loadBytes={loadBytes} client={fakeClient() as unknown as DocsEngineClient} />);
    expect(loadBytes).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('too large');
    await unmount();
  });

  it('offers a retry when the engine crashes', async () => {
    const client = fakeClient({ render: vi.fn(async () => Promise.reject(new Error('E_CRASH: unreachable executed'))) });
    await mount(<DocumentEnginePreview kind="pdf" name="a.pdf" loadBytes={async () => new ArrayBuffer(1)} client={client as unknown as DocsEngineClient} />);
    const buttons = Array.from(container.querySelectorAll('button')).map((b) => b.textContent);
    expect(buttons).toContain('Try again');
    await unmount();
  });
});

describe('DocumentEnginePreview — sheets', () => {
  const workbook: WorkbookPreview = {
    sheets: [
      {
        name: 'Budget',
        rows: [
          ['Item', 'Q1', 'Q2'],
          ['Rent', '$1,200.00', '(300)'],
          ['Total', '12%'],
        ],
        rowNumbers: [1, 2, 4],
        colIndexes: [0, 1, 3],
        merges: [[2, 1, 1, 2]],
        totalRows: 900,
        totalCols: 3,
        truncatedRows: true,
        truncatedCols: false,
      },
      { name: 'Notes', rows: [], rowNumbers: [], colIndexes: [], merges: [], totalRows: 0, totalCols: 0, truncatedRows: false, truncatedCols: false },
    ],
    warnings: [],
  };

  it('shows sheets as tabs with real row numbers, column letters, merges and alignment', async () => {
    const client = fakeClient({ previewWorkbook: vi.fn(async () => workbook) });
    await mount(<DocumentEnginePreview kind="sheets" name="budget.xlsx" loadBytes={async () => new ArrayBuffer(1)} client={client as unknown as DocsEngineClient} />);
    expect(client.previewWorkbook).toHaveBeenCalledWith('budget.xlsx', expect.any(ArrayBuffer));
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    expect(tabs.map((t) => t.textContent)).toEqual(['Budget', 'Notes']);
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');

    const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent);
    expect(headers).toEqual(['Row', 'A', 'B', 'D']); // hidden column C is skipped
    const rowNumbers = Array.from(container.querySelectorAll('tbody th')).map((th) => th.textContent);
    expect(rowNumbers).toEqual(['1', '2', '4']); // hidden row 3 is skipped

    const merged = container.querySelector('td[colspan="2"]');
    expect(merged?.textContent).toBe('12%');
    const money = Array.from(container.querySelectorAll('td')).find((td) => td.textContent === '$1,200.00')!;
    expect(money.className).toContain('text-right');
    const label = Array.from(container.querySelectorAll('td')).find((td) => td.textContent === 'Rent')!;
    expect(label.className).toContain('text-left');
    expect(container.textContent).toContain('Showing the first 3 of 900 rows. Download the file to see everything.');

    const { act } = await import('react');
    await act(async () => {
      (tabs[1] as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain('This sheet is empty.');
    await unmount();
  });
});

describe('sheet helpers', () => {
  it('names columns like a spreadsheet', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnLetters)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
  });

  it('recognises displayed numbers', () => {
    for (const t of ['42', '-3.5', '1,234,567.89', '$1,200.00', '₹ 5,000', '12%', '(300)', '1.2E+10']) expect(looksNumeric(t)).toBe(true);
    for (const t of ['', 'Rent', 'Q1', '2024-01-05 note', 'N/A']) expect(looksNumeric(t)).toBe(false);
  });

  it('describes truncation in rows, columns or both', () => {
    const base = { rows: [[]], colIndexes: [0, 1], totalRows: 1, totalCols: 2, truncatedRows: false, truncatedCols: false };
    expect(truncationNote(base)).toBe('');
    expect(truncationNote({ ...base, totalCols: 80, truncatedCols: true })).toBe('Showing the first 2 of 80 columns. Download the file to see everything.');
    expect(truncationNote({ ...base, totalRows: 5000, truncatedRows: true, totalCols: 80, truncatedCols: true })).toBe(
      'Showing the first 1 of 5,000 rows and 2 of 80 columns. Download the file to see everything.',
    );
  });
});
