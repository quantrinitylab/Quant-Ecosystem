// Forward attachment carryover: the original's files must ride along, and a
// file that cannot ride along must be reported — never silently dropped.
// Ported from PR #1556 (superseded by the integrated #1555 head, which owns
// this module now) and extended with the integrated contract's additions:
// metadata preflight (no download for a file already over budget on its
// declared size) and abortable, strictly sequential resolution.
import { describe, it, expect, vi } from 'vitest';
import {
  arrayBufferToDataUrl,
  carryForwardAttachments,
  FORWARD_MAX_ATTACHMENT_BYTES,
  FORWARD_MAX_ATTACHMENTS_TOTAL_BYTES,
  type ForwardByteLoader,
} from '../lib/forward-attachments';
import type { AttachmentByteSource } from '../lib/mail-attachments';

const SERVICE_ID = 'att_550e8400-e29b-41d4-a716-446655440000';

function bytes(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

function bytesOfSize(size: number): ArrayBuffer {
  return new Uint8Array(size).buffer;
}

/** Loader that answers per byte-source kind; records what it was asked for. */
function loaderFor(
  byKind: Partial<Record<AttachmentByteSource['kind'], ArrayBuffer>>,
  onCall?: (source: AttachmentByteSource) => void,
): ForwardByteLoader {
  return async (source) => {
    onCall?.(source);
    const found = byKind[source.kind];
    if (found === undefined) throw new Error(`no bytes for ${source.kind}`);
    return found;
  };
}

describe('arrayBufferToDataUrl', () => {
  it('round-trips bytes through base64', () => {
    const original = bytes('hello forward');
    const url = arrayBufferToDataUrl(original, 'text/plain');
    expect(url.startsWith('data:text/plain;base64,')).toBe(true);
    const decoded = Buffer.from(url.split(',')[1]!, 'base64');
    expect(decoded.toString()).toBe('hello forward');
  });

  it('handles an empty buffer', () => {
    expect(arrayBufferToDataUrl(new ArrayBuffer(0), 'text/plain')).toBe(
      'data:text/plain;base64,',
    );
  });
});

describe('carryForwardAttachments', () => {
  it('carries an inline data-URL attachment as a composer attachment', async () => {
    const seen: AttachmentByteSource[] = [];
    const result = await carryForwardAttachments(
      [
        {
          id: 'att_1710000000000_x1y2',
          filename: 'note.txt',
          mimeType: 'text/plain',
          url: 'data:text/plain;base64,aGVsbG8=',
        },
      ],
      loaderFor({ inline: bytes('hello') }, (s) => seen.push(s)),
    );
    expect(seen[0]?.kind).toBe('inline');
    expect(result.dropped).toEqual([]);
    expect(result.carried).toHaveLength(1);
    expect(result.carried[0]).toMatchObject({
      filename: 'note.txt',
      name: 'note.txt',
      mimeType: 'text/plain',
      type: 'text/plain',
      size: 5,
      url: 'data:text/plain;base64,aGVsbG8=',
    });
    // A forwarded entry must not look like a stored AttachmentService row:
    // on the next forward it resolves through its data URL, not a fake id.
    expect(result.carried[0]!.id.startsWith('att_fwd_')).toBe(true);
  });

  it('carries a stored AttachmentService row via its id', async () => {
    const seen: AttachmentByteSource[] = [];
    const result = await carryForwardAttachments(
      [{ id: SERVICE_ID, filename: 'report.pdf', mimeType: 'application/pdf' }],
      loaderFor({ stored: bytes('pdf-bytes') }, (s) => seen.push(s)),
    );
    expect(seen[0]).toEqual({ kind: 'stored', attachmentId: SERVICE_ID });
    expect(result.carried[0]).toMatchObject({
      filename: 'report.pdf',
      size: 9,
      url: 'data:application/pdf;base64,cGRmLWJ5dGVz',
    });
    expect(result.dropped).toEqual([]);
  });

  it('carries a QuantDrive pick via its download reference', async () => {
    const seen: AttachmentByteSource[] = [];
    const result = await carryForwardAttachments(
      [
        {
          filename: 'sheet.xlsx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          url: '/api/drive/files/file_abc123/download',
        },
      ],
      loaderFor({ drive: bytes('sheet') }, (s) => seen.push(s)),
    );
    expect(seen[0]).toEqual({ kind: 'drive', fileId: 'file_abc123' });
    expect(result.carried).toHaveLength(1);
    expect(result.dropped).toEqual([]);
  });

  it('drops a metadata-only attachment with an honest reason', async () => {
    const result = await carryForwardAttachments(
      [{ id: 'meta_0', filename: 'ghost.bin', mimeType: 'application/octet-stream' }],
      loaderFor({}),
    );
    expect(result.carried).toEqual([]);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0]!.filename).toBe('ghost.bin');
    expect(result.dropped[0]!.reason).toMatch(/not kept with the original/);
  });

  it('drops an unreadable attachment keeping the loader’s own words', async () => {
    const result = await carryForwardAttachments(
      [{ id: SERVICE_ID, filename: 'blocked.pdf', mimeType: 'application/pdf' }],
      async () => {
        throw new Error('malware scan blocked this file');
      },
    );
    expect(result.carried).toEqual([]);
    expect(result.dropped[0]).toEqual({
      filename: 'blocked.pdf',
      reason: 'malware scan blocked this file',
    });
  });

  it('drops an empty file', async () => {
    const result = await carryForwardAttachments(
      [{ id: SERVICE_ID, filename: 'empty.txt', mimeType: 'text/plain' }],
      loaderFor({ stored: new ArrayBuffer(0) }),
    );
    expect(result.dropped[0]).toMatchObject({
      filename: 'empty.txt',
      reason: 'its file is empty',
    });
  });

  it('drops an oversize file but still carries the files after it', async () => {
    const calls = { n: 0 };
    const result = await carryForwardAttachments(
      [
        { id: SERVICE_ID, filename: 'huge.bin', mimeType: 'application/octet-stream' },
        { id: SERVICE_ID, filename: 'small.txt', mimeType: 'text/plain' },
      ],
      async () => {
        calls.n += 1;
        return calls.n === 1
          ? bytesOfSize(FORWARD_MAX_ATTACHMENT_BYTES + 1)
          : bytes('tiny');
      },
    );
    expect(result.carried.map((c) => c.filename)).toEqual(['small.txt']);
    expect(result.dropped.map((d) => d.filename)).toEqual(['huge.bin']);
    expect(result.dropped[0]!.reason).toMatch(/per-file limit/);
  });

  it('drops a file that would breach the total budget, keeps earlier files', async () => {
    const first = bytesOfSize(20 * 1024 * 1024);
    const second = bytesOfSize(10 * 1024 * 1024);
    const calls = { n: 0 };
    const result = await carryForwardAttachments(
      [
        { id: SERVICE_ID, filename: 'first.bin', mimeType: 'application/octet-stream' },
        { id: SERVICE_ID, filename: 'second.bin', mimeType: 'application/octet-stream' },
      ],
      async () => {
        calls.n += 1;
        return calls.n === 1 ? first : second;
      },
    );
    expect(result.carried.map((c) => c.filename)).toEqual(['first.bin']);
    expect(result.dropped.map((d) => d.filename)).toEqual(['second.bin']);
    expect(result.dropped[0]!.reason).toMatch(/total attachment limit/);
    expect(FORWARD_MAX_ATTACHMENTS_TOTAL_BYTES).toBe(25 * 1024 * 1024);
  });

  it('falls back to a plain name when the attachment has none', async () => {
    const result = await carryForwardAttachments(
      [{ id: SERVICE_ID, mimeType: 'text/plain' }],
      loaderFor({ stored: bytes('hi') }),
    );
    expect(result.carried[0]!.filename).toBe('attachment');
  });

  it('returns empty results for no attachments', async () => {
    const load = vi.fn();
    await expect(carryForwardAttachments(null, load)).resolves.toEqual({
      carried: [],
      dropped: [],
    });
    await expect(carryForwardAttachments([], load)).resolves.toEqual({
      carried: [],
      dropped: [],
    });
    expect(load).not.toHaveBeenCalled();
  });

  it('metadata preflight: a declared oversize file is dropped WITHOUT a download', async () => {
    const load = vi.fn(async () => bytes('never fetched'));
    const result = await carryForwardAttachments(
      [
        {
          id: SERVICE_ID,
          filename: 'declared-huge.bin',
          mimeType: 'application/octet-stream',
          size: FORWARD_MAX_ATTACHMENT_BYTES + 1,
        },
        { id: SERVICE_ID, filename: 'small.txt', mimeType: 'text/plain' },
      ],
      load,
    );
    // Only the small file's bytes were ever requested.
    expect(load).toHaveBeenCalledTimes(1);
    expect(result.carried.map((c) => c.filename)).toEqual(['small.txt']);
    expect(result.dropped.map((d) => d.filename)).toEqual(['declared-huge.bin']);
    expect(result.dropped[0]!.reason).toMatch(/per-file limit/);
  });

  it('metadata preflight: a declared size that would breach the total is dropped WITHOUT a download', async () => {
    // First file actually carries 20 MB; the second declares 10 MB — under
    // the 20 MB per-file cap, but 20 + 10 breaches the 25 MB total, so its
    // bytes must never be fetched. (A lone 25 MB declaration would trip
    // the per-file cap first, which is also correct — just a different drop.)
    const calls = { n: 0 };
    const load = vi.fn(async () => {
      calls.n += 1;
      return bytesOfSize(20 * 1024 * 1024);
    });
    const result = await carryForwardAttachments(
      [
        { id: SERVICE_ID, filename: 'first.bin', mimeType: 'application/octet-stream' },
        {
          id: SERVICE_ID,
          filename: 'declared-big.bin',
          mimeType: 'application/octet-stream',
          size: 10 * 1024 * 1024,
        },
      ],
      load,
    );
    expect(calls.n).toBe(1);
    expect(load).toHaveBeenCalledTimes(1);
    expect(result.carried.map((c) => c.filename)).toEqual(['first.bin']);
    expect(result.dropped.map((d) => d.filename)).toEqual(['declared-big.bin']);
    expect(result.dropped[0]!.reason).toMatch(/total attachment limit/);
  });

  it('resolves strictly one file at a time, in order', async () => {
    const started: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<ArrayBuffer>((resolve) => {
      releaseFirst = () => resolve(bytes('first'));
    });
    const load: ForwardByteLoader = async (source) => {
      started.push(source.kind);
      if (started.length === 1) return firstGate;
      return bytes('second');
    };
    const pending = carryForwardAttachments(
      [
        { id: SERVICE_ID, filename: 'a.txt', mimeType: 'text/plain' },
        { id: SERVICE_ID, filename: 'b.txt', mimeType: 'text/plain' },
      ],
      load,
    );
    // Flush microtasks: the second file must NOT start while the first
    // download is still in flight.
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual(['stored']);
    releaseFirst();
    const result = await pending;
    expect(started).toEqual(['stored', 'stored']);
    expect(result.carried.map((c) => c.filename)).toEqual(['a.txt', 'b.txt']);
  });

  it('an aborted signal rejects (partial results are discarded by the caller)', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      carryForwardAttachments(
        [{ id: SERVICE_ID, filename: 'a.txt', mimeType: 'text/plain' }],
        async () => bytes('x'),
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('forwards the abort signal to the byte loader', async () => {
    const controller = new AbortController();
    const seen: Array<AbortSignal | undefined> = [];
    await carryForwardAttachments(
      [{ id: SERVICE_ID, filename: 'a.txt', mimeType: 'text/plain' }],
      async (_source, signal) => {
        seen.push(signal);
        return bytes('x');
      },
      { signal: controller.signal },
    );
    expect(seen).toEqual([controller.signal]);
  });
});
