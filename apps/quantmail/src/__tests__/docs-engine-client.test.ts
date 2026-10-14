// Quant Docs engine client: request/response over the worker, stable error codes, timeouts
// and crash recovery (a fresh worker, and handles from the old one going stale).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DocsEngineClient, describeEngineError, engineErrorCode } from '../lib/docs-engine/client';

type Msg = Record<string, unknown> & { id: number; op: string };

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: Msg[] = [];
  terminated = false;
  constructor(public url: string) {}
  postMessage(msg: Msg) {
    this.posted.push(msg);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: Record<string, unknown>) {
    this.onmessage?.({ data } as MessageEvent);
  }
  last(): Msg {
    return this.posted[this.posted.length - 1]!;
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const client = new DocsEngineClient('/engines/docs/test/worker.js', (url) => {
    const w = new FakeWorker(url);
    workers.push(w);
    return w as unknown as Worker;
  });
  return { client, workers };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('DocsEngineClient', () => {
  it('starts the worker lazily and resolves an open with a document handle', async () => {
    const { client, workers } = setup();
    expect(workers).toHaveLength(0);
    const bytes = new ArrayBuffer(8);
    const opening = client.open('pdf', 'a.pdf', bytes);
    expect(workers).toHaveLength(1);
    expect(workers[0]!.url).toBe('/engines/docs/test/worker.js');
    const msg = workers[0]!.last();
    expect(msg).toMatchObject({ op: 'open', kind: 'pdf', name: 'a.pdf', bytes });
    workers[0]!.reply({ id: msg.id, ok: true, result: { docId: 1, pageCount: 2, pageSizes: [612, 792, 612, 792], title: 'T' } });
    const doc = await opening;
    expect(doc.pageCount).toBe(2);
    expect(doc.title).toBe('T');

    const rendering = client.render(doc.docId, 1, 2);
    const r = workers[0]!.last();
    // The worker sees its own doc id, not the client handle.
    expect(r).toMatchObject({ op: 'render', docId: 1, page: 1, scale: 2 });
    workers[0]!.reply({ id: r.id, ok: true, result: { width: 1, height: 1, rgba: new Uint8Array([1, 2, 3, 255]) } });
    const page = await rendering;
    expect(page).toMatchObject({ width: 1, height: 1 });
    expect(Array.from(page.rgba)).toEqual([1, 2, 3, 255]);
    expect(page.rgba).toBeInstanceOf(Uint8ClampedArray);
  });

  it('rejects with the engine error code and maps it to plain language', async () => {
    const { client, workers } = setup();
    const opening = client.open('pdf', 'locked.pdf', new ArrayBuffer(4));
    workers[0]!.reply({ id: workers[0]!.last().id, ok: false, error: 'E_PASSWORD: the document is encrypted' });
    const error = await opening.catch((e: unknown) => e);
    expect(engineErrorCode(error)).toBe('E_PASSWORD');
    expect(describeEngineError(error)).toMatch(/password-protected/);
    expect(workers[0]!.terminated).toBe(false);
  });

  it('times out a stuck engine, replaces the worker and invalidates old handles', async () => {
    vi.useFakeTimers();
    const { client, workers } = setup();
    const opening = client.open('word', 'a.docx', new ArrayBuffer(4));
    workers[0]!.reply({ id: workers[0]!.last().id, ok: true, result: { docId: 1, pageCount: 1, pageSizes: [612, 792], title: null } });
    const doc = await opening;

    const stuck = client.render(doc.docId, 0, 1).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(60_001);
    expect(engineErrorCode(await stuck)).toBe('E_TIMEOUT');
    expect(workers[0]!.terminated).toBe(true);

    // The old handle is stale: no message reaches any worker, the call fails E_CLOSED.
    expect(engineErrorCode(await client.render(doc.docId, 0, 1).catch((e: unknown) => e))).toBe('E_CLOSED');
    await client.close(doc.docId); // a no-op, never rejects
    expect(workers).toHaveLength(1);

    // The next open starts a fresh worker.
    const again = client.open('word', 'a.docx', new ArrayBuffer(4));
    expect(workers).toHaveLength(2);
    workers[1]!.reply({ id: workers[1]!.last().id, ok: true, result: { docId: 1, pageCount: 1, pageSizes: [612, 792], title: null } });
    const doc2 = await again;
    expect(doc2.docId).not.toBe(doc.docId);
    const r = client.render(doc2.docId, 0, 1);
    expect(workers[1]!.last()).toMatchObject({ op: 'render', docId: 1 });
    workers[1]!.reply({ id: workers[1]!.last().id, ok: true, result: { width: 1, height: 1, rgba: new Uint8Array(4) } });
    await r;
  });

  it('treats a fatal engine error as a crash: the worker is replaced and other calls fail', async () => {
    const { client, workers } = setup();
    const a = client.previewWorkbook('a.xlsx', new ArrayBuffer(4)).catch((e: unknown) => e);
    const b = client.previewWorkbook('b.xlsx', new ArrayBuffer(4)).catch((e: unknown) => e);
    const [first] = workers[0]!.posted;
    workers[0]!.reply({ id: first!.id, ok: false, fatal: true, error: 'E_CRASH: unreachable' });
    expect(engineErrorCode(await a)).toBe('E_CRASH');
    expect(engineErrorCode(await b)).toBe('E_CRASH');
    expect(workers[0]!.terminated).toBe(true);
    void client.previewWorkbook('c.xlsx', new ArrayBuffer(4));
    expect(workers).toHaveLength(2);
  });

  it('fails in-flight calls with E_LOAD when the worker script cannot load', async () => {
    const { client, workers } = setup();
    const opening = client.open('slides', 'a.pptx', new ArrayBuffer(4)).catch((e: unknown) => e);
    workers[0]!.onerror?.({ message: 'NetworkError', preventDefault() {} } as unknown as ErrorEvent);
    const error = await opening;
    expect(engineErrorCode(error)).toBe('E_LOAD');
    expect(describeEngineError(error)).toMatch(/couldn’t start/);
  });

  it('reports E_WORKER when workers are unavailable', async () => {
    const client = new DocsEngineClient('/w.js', () => {
      throw new Error('Worker is not defined');
    });
    expect(engineErrorCode(await client.previewWorkbook('a.xlsx', new ArrayBuffer(1)).catch((e: unknown) => e))).toBe('E_WORKER');
  });
});

describe('describeEngineError', () => {
  it('has a message for every code and a safe default', () => {
    for (const code of ['E_PASSWORD', 'E_WRONG_PASSWORD', 'E_INVALID', 'E_UNSUPPORTED', 'E_TOO_LARGE', 'E_TIMEOUT', 'E_WORKER', 'E_LOAD', 'E_SOMETHING']) {
      const text = describeEngineError(new Error(`${code}: detail`));
      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toContain(code);
    }
    expect(engineErrorCode('no code here')).toBe('E_UNKNOWN');
  });
});
