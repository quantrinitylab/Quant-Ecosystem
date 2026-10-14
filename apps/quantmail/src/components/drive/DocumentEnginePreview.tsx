'use client';

/**
 * On-device preview for PDFs, Word documents, presentations and spreadsheets.
 *
 * The bytes are fetched with the session attached (`loadBytes`) and handed to the Quant Docs
 * engines — WebAssembly in a Web Worker on this device (see `lib/docs-engine`). Pages render
 * lazily as they scroll into view, at the resolution the screen needs; only a bounded number
 * of rendered pages stay in memory. Spreadsheets show each visible sheet's displayed values.
 * Every failure ends in a plain-language message, with Download as the way out.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  describeEngineError,
  engineErrorCode,
  getDocsEngineClient,
  type DocsEngineClient,
  type OpenedDocument,
  type SheetPreview,
  type WorkbookPreview,
} from '../../lib/docs-engine/client';
import { DOCS_ENGINE_MAX_BYTES, docsEngineLabel, type DocsEngineKind } from '../../lib/docs-engine/formats';
import { DOCS_ENGINE_NOTICES_URL } from '../../lib/docs-engine/version';

export interface DocumentEnginePreviewProps {
  kind: DocsEngineKind;
  name: string;
  /** Size in bytes when known: files over the engine limit are not fetched at all. */
  size?: number | null;
  /** Fetches the file's bytes (session attached). Rejections are shown to the user verbatim. */
  loadBytes: (signal: AbortSignal) => Promise<ArrayBuffer>;
  onDownload?: () => void;
  /** Injected by tests; defaults to the tab-wide engine client. */
  client?: DocsEngineClient;
}

type PreviewState =
  | { status: 'loading'; step: 'fetch' | 'engine' }
  | { status: 'pages'; doc: OpenedDocument }
  | { status: 'sheets'; workbook: WorkbookPreview }
  | { status: 'error'; message: string; retryable: boolean };

/** Engine failures worth a second attempt (a fresh worker is started for it). */
const RETRYABLE = new Set(['E_CRASH', 'E_TIMEOUT', 'E_LOAD', 'E_WORKER', 'E_CLOSED']);
/** Rendered pages kept as canvases; pages further from view are released and re-rendered. */
const MAX_LIVE_PAGES = 10;
/** Canvas area cap (Safari refuses canvases above ~16.7 M pixels). */
const MAX_PAGE_PIXELS = 12_000_000;

export function DocumentEnginePreview({ kind, name, size, loadBytes, onDownload, client }: DocumentEnginePreviewProps) {
  const engine = useMemo(() => client ?? getDocsEngineClient(), [client]);
  const [state, setState] = useState<PreviewState>({ status: 'loading', step: 'fetch' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (typeof size === 'number' && size > DOCS_ENGINE_MAX_BYTES) {
      setState({ status: 'error', message: describeEngineError(new Error('E_TOO_LARGE')), retryable: false });
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    let opened: OpenedDocument | null = null;
    setState({ status: 'loading', step: 'fetch' });

    void (async () => {
      let bytes: ArrayBuffer;
      try {
        bytes = await loadBytes(controller.signal);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error && error.message ? error.message : 'Failed to load file preview';
        setState({ status: 'error', message, retryable: true });
        return;
      }
      if (cancelled) return;
      if (bytes.byteLength > DOCS_ENGINE_MAX_BYTES) {
        setState({ status: 'error', message: describeEngineError(new Error('E_TOO_LARGE')), retryable: false });
        return;
      }
      setState({ status: 'loading', step: 'engine' });
      try {
        if (kind === 'sheets') {
          const workbook = await engine.previewWorkbook(name, bytes);
          if (!cancelled) setState({ status: 'sheets', workbook });
        } else {
          const doc = await engine.open(kind, name, bytes);
          if (cancelled) {
            void engine.close(doc.docId);
            return;
          }
          opened = doc;
          setState({ status: 'pages', doc });
        }
      } catch (error) {
        if (cancelled) return;
        setState({ status: 'error', message: describeEngineError(error), retryable: RETRYABLE.has(engineErrorCode(error)) });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (opened) void engine.close(opened.docId);
    };
  }, [kind, name, size, loadBytes, engine, attempt]);

  const onFatal = useCallback((error: unknown) => {
    setState({ status: 'error', message: describeEngineError(error), retryable: true });
  }, []);

  return (
    <div className="text-left" data-testid="docs-engine-preview">
      {state.status === 'loading' ? (
        <div className="py-12 text-center text-xs text-[var(--quant-muted-foreground)] space-y-3" role="status" aria-live="polite">
          <svg className="w-6 h-6 animate-spin mx-auto text-[var(--app-accent)]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
            <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          </svg>
          <p>{state.step === 'fetch' ? 'Loading file…' : `Opening ${docsEngineLabel(kind).toLowerCase()}…`}</p>
        </div>
      ) : state.status === 'error' ? (
        <div className="py-8 text-center text-xs bg-rose-500/10 rounded-lg p-4 border border-rose-500/20" role="alert">
          <p className="font-semibold mb-1 text-rose-400">Unable to preview this file</p>
          <p className="text-[var(--quant-muted-foreground)] max-w-md mx-auto">{state.message}</p>
          <div className="mt-3 flex items-center justify-center gap-2">
            {state.retryable && (
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="px-3 py-1.5 rounded-lg bg-[var(--quant-surface-elevated)] border border-[#232938] text-xs font-semibold text-[var(--quant-foreground)] hover:border-[color-mix(in_srgb,var(--app-accent)_50%,transparent)]"
              >
                Try again
              </button>
            )}
            {onDownload && (
              <button
                type="button"
                onClick={onDownload}
                className="px-3 py-1.5 rounded-lg bg-[var(--quant-surface-elevated)] border border-[#232938] text-xs font-semibold text-[var(--quant-foreground)] hover:border-[color-mix(in_srgb,var(--app-accent)_50%,transparent)]"
              >
                Download
              </button>
            )}
          </div>
        </div>
      ) : state.status === 'pages' ? (
        <PagesView doc={state.doc} kind={kind} engine={engine} onFatal={onFatal} />
      ) : (
        <SheetsView workbook={state.workbook} />
      )}
      <p className="mt-2 text-[11px] text-[var(--quant-muted-foreground)]">
        Rendered on this device — the file isn’t sent anywhere to be previewed.{' '}
        <a href={DOCS_ENGINE_NOTICES_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--quant-foreground)]">
          Open-source notices
        </a>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Pages (PDF, documents, presentations)
// ---------------------------------------------------------------------------------------------

function pageScale(widthPt: number, heightPt: number, cssWidth: number, dpr: number): number {
  let scale = (cssWidth * dpr) / Math.max(widthPt, 1);
  const area = widthPt * heightPt * scale * scale;
  if (area > MAX_PAGE_PIXELS) scale = Math.sqrt(MAX_PAGE_PIXELS / (widthPt * heightPt));
  return Math.min(Math.max(scale, 0.1), 4);
}

function PagesView({ doc, kind, engine, onFatal }: { doc: OpenedDocument; kind: DocsEngineKind; engine: DocsEngineClient; onFatal: (error: unknown) => void }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const rendered = useRef(new Map<number, number>()); // page → scale it was drawn at
  const wanted = useRef(new Set<number>());
  const busy = useRef(false);
  const disposed = useRef(false);
  const widthRef = useRef(640);
  const [drawn, setDrawn] = useState<ReadonlySet<number>>(new Set());
  const [failed, setFailed] = useState<ReadonlySet<number>>(new Set());
  const [current, setCurrent] = useState(0);
  const pages = doc.pageCount;
  const noun = kind === 'slides' ? 'Slide' : 'Page';

  const sizeOf = useCallback(
    (page: number): [number, number] => [doc.pageSizes[page * 2] || 612, doc.pageSizes[page * 2 + 1] || 792],
    [doc.pageSizes],
  );

  const targetScale = useCallback(
    (page: number) => {
      const [w, h] = sizeOf(page);
      const dpr = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      return pageScale(w, h, widthRef.current, dpr);
    },
    [sizeOf],
  );

  const evict = useCallback(() => {
    if (rendered.current.size <= MAX_LIVE_PAGES) return;
    const near = [...wanted.current];
    const center = near.length ? near.reduce((a, b) => a + b, 0) / near.length : 0;
    const candidates = [...rendered.current.keys()].filter((p) => !wanted.current.has(p)).sort((a, b) => Math.abs(b - center) - Math.abs(a - center));
    const released: number[] = [];
    while (rendered.current.size > MAX_LIVE_PAGES && candidates.length) {
      const page = candidates.shift()!;
      const canvas = canvases.current[page];
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      rendered.current.delete(page);
      released.push(page);
    }
    if (released.length) {
      setDrawn((prev) => {
        const next = new Set(prev);
        for (const p of released) next.delete(p);
        return next;
      });
    }
  }, []);

  const pump = useCallback(async () => {
    if (busy.current || disposed.current) return;
    busy.current = true;
    try {
      for (;;) {
        const next = [...wanted.current]
          .sort((a, b) => a - b)
          .find((p) => {
            const at = rendered.current.get(p);
            if (at === undefined) return true;
            const target = targetScale(p);
            return Math.abs(at - target) / target > 0.2;
          });
        if (next === undefined || disposed.current) break;
        const scale = targetScale(next);
        try {
          const img = await engine.render(doc.docId, next, scale);
          if (disposed.current) break;
          const canvas = canvases.current[next];
          const ctx = canvas?.getContext('2d');
          if (canvas && ctx) {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.putImageData(new ImageData(img.rgba, img.width, img.height), 0, 0);
          }
          rendered.current.set(next, scale);
          setDrawn((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
          evict();
        } catch (error) {
          if (disposed.current) break;
          if (RETRYABLE.has(engineErrorCode(error))) {
            onFatal(error);
            break;
          }
          // One bad page doesn't sink the document: mark it and move on.
          rendered.current.set(next, scale);
          setFailed((prev) => new Set(prev).add(next));
        }
      }
    } finally {
      busy.current = false;
    }
  }, [doc.docId, engine, evict, onFatal, targetScale]);

  // Track the scroller's width (render resolution) and which pages are near the viewport.
  useEffect(() => {
    disposed.current = false;
    const root = scrollRef.current;
    if (!root) return;
    widthRef.current = root.clientWidth - 24 || 640;
    const ro =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            widthRef.current = root.clientWidth - 24 || widthRef.current;
            void pump();
          });
    ro?.observe(root);

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === 'undefined') {
      for (let p = 0; p < Math.min(pages, 3); p++) wanted.current.add(p);
    } else {
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const page = Number((entry.target as HTMLElement).dataset.page);
            if (entry.isIntersecting) wanted.current.add(page);
            else wanted.current.delete(page);
          }
          void pump();
        },
        { root, rootMargin: '400px 0px' },
      );
      root.querySelectorAll('[data-page]').forEach((el) => io!.observe(el));
    }
    void pump();
    return () => {
      disposed.current = true;
      ro?.disconnect();
      io?.disconnect();
    };
  }, [pages, pump]);

  const onScroll = useCallback(() => {
    const root = scrollRef.current;
    if (!root) return;
    const probe = root.scrollTop + root.clientHeight / 3;
    const items = root.querySelectorAll<HTMLElement>('[data-page]');
    let page = 0;
    items.forEach((el, i) => {
      if (el.offsetTop <= probe) page = i;
    });
    setCurrent(page);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between pb-2 text-[11px] text-[var(--quant-muted-foreground)]">
        <span className="truncate" title={doc.title ?? undefined}>
          {doc.title || docsEngineLabel(kind)}
        </span>
        <span aria-live="polite">
          {noun} {Math.min(current + 1, pages)} of {pages}
        </span>
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="list"
        aria-label={`${docsEngineLabel(kind)} pages`}
        className="relative max-h-[65vh] overflow-y-auto rounded-lg bg-[#0B0C0E] border border-[var(--quant-surface-elevated)] p-3 space-y-3"
      >
        {Array.from({ length: pages }, (_, page) => {
          const [w, h] = sizeOf(page);
          return (
            <div
              key={page}
              role="listitem"
              data-page={page}
              className="relative mx-auto w-full overflow-hidden rounded-sm bg-white shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
              style={{ aspectRatio: `${w} / ${h}` }}
            >
              <canvas
                ref={(el) => {
                  canvases.current[page] = el;
                }}
                role="img"
                aria-label={`${noun} ${page + 1} of ${pages}`}
                className="block h-full w-full"
              />
              {!drawn.has(page) && (
                <div className="absolute inset-0 grid place-items-center text-[11px] text-zinc-500">
                  {failed.has(page) ? `${noun} ${page + 1} couldn’t be rendered` : `${noun} ${page + 1}`}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Spreadsheets
// ---------------------------------------------------------------------------------------------

/** 0 → A, 25 → Z, 26 → AA. */
export function columnLetters(index: number): string {
  let n = Math.max(0, Math.floor(index)) + 1;
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Displayed text that reads as a number (incl. currency, %, accounting negatives) aligns right. */
export function looksNumeric(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return /^[(-]?[+-]?\s?[$€£¥₹]?\s?\d[\d,. ]*(?:[eE][+-]?\d+)?\s?%?\)?$/.test(t);
}

/** "Showing the first 500 of 1,234 rows and 60 of 75 columns. Download the file to see everything." */
export function truncationNote(sheet: Pick<SheetPreview, 'rows' | 'colIndexes' | 'totalRows' | 'totalCols' | 'truncatedRows' | 'truncatedCols'>): string {
  const parts: string[] = [];
  if (sheet.truncatedRows) parts.push(`the first ${sheet.rows.length.toLocaleString('en-US')} of ${sheet.totalRows.toLocaleString('en-US')} rows`);
  if (sheet.truncatedCols)
    parts.push(`${parts.length ? '' : 'the first '}${sheet.colIndexes.length.toLocaleString('en-US')} of ${sheet.totalCols.toLocaleString('en-US')} columns`);
  return parts.length ? `Showing ${parts.join(' and ')}. Download the file to see everything.` : '';
}

function SheetsView({ workbook }: { workbook: WorkbookPreview }) {
  const [active, setActive] = useState(0);
  const sheet: SheetPreview | undefined = workbook.sheets[Math.min(active, workbook.sheets.length - 1)];

  return (
    <div>
      {workbook.sheets.length > 1 && (
        <div role="tablist" aria-label="Sheets" className="mb-2 flex gap-1 overflow-x-auto pb-1">
          {workbook.sheets.map((s, i) => (
            <button
              key={`${s.name}-${i}`}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={`shrink-0 rounded-md px-3 py-1 text-xs font-medium border transition-colors ${
                i === active
                  ? 'border-[color-mix(in_srgb,var(--app-accent)_60%,transparent)] text-[var(--quant-foreground)] bg-[var(--quant-surface-elevated)]'
                  : 'border-[#232938] text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      {sheet ? <SheetGrid sheet={sheet} /> : null}
    </div>
  );
}

function SheetGrid({ sheet }: { sheet: SheetPreview }) {
  const width = sheet.colIndexes.length;
  const { spans, covered } = useMemo(() => {
    const spans = new Map<string, [number, number]>();
    const covered = new Set<string>();
    for (const [r, c, rs, cs] of sheet.merges) {
      spans.set(`${r}:${c}`, [rs, cs]);
      for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) if (dr || dc) covered.add(`${r + dr}:${c + dc}`);
    }
    return { spans, covered };
  }, [sheet.merges]);

  if (!sheet.rows.length) {
    return <p className="py-8 text-center text-xs text-[var(--quant-muted-foreground)]">This sheet is empty.</p>;
  }

  return (
    <div>
      <div className="max-h-[60vh] overflow-auto rounded-lg border border-[var(--quant-surface-elevated)] bg-[#0B0C0E]" tabIndex={0}>
        <table className="border-separate border-spacing-0 text-xs text-[#E0E2EC]">
          <caption className="sr-only">{sheet.name}</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 top-0 z-20 min-w-10 border-b border-r border-[#22262E] bg-[#12151C]">
                <span className="sr-only">Row</span>
              </th>
              {sheet.colIndexes.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className="sticky top-0 z-10 min-w-20 border-b border-r border-[#22262E] bg-[#12151C] px-2 py-1 text-center font-medium text-[#94A3B8]"
                >
                  {columnLetters(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, r) => (
              <tr key={sheet.rowNumbers[r] ?? r}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-b border-r border-[#22262E] bg-[#12151C] px-2 py-1 text-right font-medium text-[#94A3B8]"
                >
                  {sheet.rowNumbers[r] ?? r + 1}
                </th>
                {Array.from({ length: width }, (_, c) => {
                  const key = `${r}:${c}`;
                  if (covered.has(key)) return null;
                  const text = row[c] ?? '';
                  const span = spans.get(key);
                  return (
                    <td
                      key={c}
                      rowSpan={span?.[0]}
                      colSpan={span?.[1]}
                      className={`border-b border-r border-[#22262E] px-2 py-1 ${looksNumeric(text) ? 'text-right tabular-nums' : 'text-left'}`}
                      title={text.length > 40 ? text : undefined}
                    >
                      <div className="max-w-80 truncate">{text}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(sheet.truncatedRows || sheet.truncatedCols) && (
        <p className="mt-2 text-[11px] text-[var(--quant-muted-foreground)]">{truncationNote(sheet)}</p>
      )}
    </div>
  );
}

export default DocumentEnginePreview;
