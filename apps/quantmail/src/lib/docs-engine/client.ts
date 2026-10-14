/**
 * Quant Docs engine client — talks to the engine Web Worker.
 *
 * One shared worker per tab; engines load lazily on first use (PDF ≈ 2 MB gzipped,
 * spreadsheets ≈ 0.6 MB). Every call has a timeout. A WebAssembly trap (a crash inside an
 * engine) poisons that worker, so it is terminated and the next call starts a fresh one.
 */

import type { DocsEngineKind } from './formats';
import { DOCS_ENGINE_WORKER_URL } from './version';

export interface OpenedDocument {
  /** Handle for `render`/`close`; it goes stale when the worker restarts (calls then fail with E_CLOSED). */
  docId: number;
  pageCount: number;
  /** [w0, h0, w1, h1, …] in points. */
  pageSizes: number[];
  title: string | null;
}

export interface RenderedPage {
  width: number;
  height: number;
  /** Straight RGBA8, opaque. */
  rgba: Uint8ClampedArray;
}

export interface SheetPreview {
  name: string;
  rows: string[][];
  rowNumbers: number[];
  colIndexes: number[];
  /** [row, col, rowSpan, colSpan] — indexes into rows / colIndexes. */
  merges: [number, number, number, number][];
  totalRows: number;
  totalCols: number;
  truncatedRows: boolean;
  truncatedCols: boolean;
}

export interface WorkbookPreview {
  sheets: SheetPreview[];
  warnings: string[];
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type WorkerFactory = (url: string) => Worker;

const defaultFactory: WorkerFactory = (url) => new Worker(url, { type: 'module', name: 'quant-docs-engine' });

/** Engine errors carry a stable code prefix ("E_PASSWORD: …"). */
export function engineErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const m = /^(E_[A-Z_]+)\b/.exec(message);
  return m ? m[1]! : 'E_UNKNOWN';
}

/** What to tell the user for an engine error. */
export function describeEngineError(error: unknown): string {
  switch (engineErrorCode(error)) {
    case 'E_PASSWORD':
    case 'E_WRONG_PASSWORD':
      return 'This file is password-protected. Download it to open it with its password.';
    case 'E_INVALID':
      return 'This file could not be read. It may be damaged, or saved in a format we can’t preview yet.';
    case 'E_UNSUPPORTED':
      return 'This file uses features we can’t preview yet. Download it to open it.';
    case 'E_TOO_LARGE':
      return 'This file is too large to preview on this device. Download it to open it.';
    case 'E_TIMEOUT':
      return 'The preview took too long. Download the file to open it.';
    case 'E_WORKER':
    case 'E_LOAD':
      return 'The preview engine couldn’t start on this device. Download the file to open it.';
    default:
      return 'Something went wrong while rendering this preview. Download the file to open it.';
  }
}

/** Handles are `generation · 2^20 + worker doc id`: a restarted worker never sees an old handle. */
const HANDLE_SPAN = 2 ** 20;

export class DocsEngineClient {
  private worker: Worker | null = null;
  /** Bumped whenever the worker is replaced; documents opened earlier are gone with it. */
  private generation = 0;
  private seq = 0;
  private readonly pending = new Map<number, Pending>();

  constructor(
    private readonly workerUrl: string = DOCS_ENGINE_WORKER_URL,
    private readonly factory: WorkerFactory = defaultFactory,
  ) {}

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    let worker: Worker;
    try {
      worker = this.factory(this.workerUrl);
    } catch (e) {
      throw new Error(`E_WORKER: ${e instanceof Error ? e.message : String(e)}`);
    }
    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as { id: number; ok: boolean; result?: unknown; error?: string; fatal?: boolean };
      const entry = this.pending.get(data.id);
      if (data.fatal) this.reset(new Error(data.error || 'E_WORKER: the engine crashed'), data.id);
      if (!entry) return;
      this.pending.delete(data.id);
      clearTimeout(entry.timer);
      if (data.ok) entry.resolve(data.result);
      else entry.reject(new Error(data.error || 'E_UNKNOWN'));
    };
    worker.onerror = (event: ErrorEvent) => {
      event.preventDefault?.();
      this.reset(new Error(`E_LOAD: ${event.message || 'the engine failed to load'}`));
    };
    this.worker = worker;
    return worker;
  }

  /** Terminate the worker and fail everything in flight (except `keep`, answered by the caller). */
  private reset(reason: Error, keep?: number): void {
    this.worker?.terminate();
    this.worker = null;
    this.generation++;
    for (const [id, entry] of this.pending) {
      if (id === keep) continue;
      clearTimeout(entry.timer);
      entry.reject(reason);
      this.pending.delete(id);
    }
  }

  private call<T>(message: Record<string, unknown>, transfer: Transferable[] = [], timeoutMs = 60_000): Promise<T> {
    let worker: Worker;
    try {
      worker = this.ensureWorker();
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        // A stuck engine keeps its thread busy: start over on the next call.
        this.reset(new Error('E_TIMEOUT: the engine did not answer'));
        reject(new Error('E_TIMEOUT: the engine did not answer'));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      worker.postMessage({ ...message, id }, transfer);
    });
  }

  /** The worker's doc id for a live handle, or null when the handle predates a restart. */
  private workerDocId(handle: number): number | null {
    return this.worker && Math.floor(handle / HANDLE_SPAN) === this.generation ? handle % HANDLE_SPAN : null;
  }

  /** Open a PDF, document or presentation. `bytes` is transferred (do not reuse it). */
  async open(kind: Exclude<DocsEngineKind, 'sheets'>, name: string, bytes: ArrayBuffer, password?: string): Promise<OpenedDocument> {
    const generation = this.generation;
    const doc = await this.call<OpenedDocument>({ op: 'open', kind, name, bytes, password }, [bytes]);
    // A restart while opening means the document is already gone.
    if (generation !== this.generation) throw new Error('E_CLOSED: the engine restarted');
    return { ...doc, docId: generation * HANDLE_SPAN + doc.docId };
  }

  /** Rasterize one page (0-based) at `scale` device pixels per point. */
  async render(docId: number, page: number, scale: number): Promise<RenderedPage> {
    const id = this.workerDocId(docId);
    if (id === null) throw new Error('E_CLOSED: the engine restarted');
    const out = await this.call<{ width: number; height: number; rgba: Uint8Array }>({ op: 'render', docId: id, page, scale });
    return { width: out.width, height: out.height, rgba: new Uint8ClampedArray(out.rgba.buffer, out.rgba.byteOffset, out.rgba.byteLength) };
  }

  /** Release a document. Never rejects; a stale handle is a no-op. */
  close(docId: number): Promise<void> {
    const id = this.workerDocId(docId);
    if (id === null) return Promise.resolve();
    return this.call<void>({ op: 'close', docId: id }, [], 10_000).then(
      () => undefined,
      () => undefined,
    );
  }

  /** A bounded preview of every visible sheet. `bytes` is transferred. */
  previewWorkbook(name: string, bytes: ArrayBuffer, maxRows = 500, maxCols = 60): Promise<WorkbookPreview> {
    return this.call<WorkbookPreview>({ op: 'sheets', name, bytes, maxRows, maxCols }, [bytes]);
  }

  dispose(): void {
    this.reset(new Error('E_CLOSED: the engine was shut down'));
  }
}

let shared: DocsEngineClient | null = null;

/** The tab-wide engine client (created on first use). */
export function getDocsEngineClient(): DocsEngineClient {
  if (!shared) shared = new DocsEngineClient();
  return shared;
}
