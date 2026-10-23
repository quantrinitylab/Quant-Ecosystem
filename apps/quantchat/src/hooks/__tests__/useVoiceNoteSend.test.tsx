// @vitest-environment jsdom
// ============================================================================
// QC-F-573 — useVoiceNoteSend: the voice-note send pipeline.
//
// recorded -> uploading -> finalizing -> sending -> sent | failed-*
// The blob is RETAINED on every failure; retry reuses the SAME clientMsgId;
// no send happens before finalize returns. XHR is a controllable fake so
// upload progress is exercised honestly (no synthetic ticks).
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useVoiceNoteSend, type VoiceNoteJob } from '../useVoiceNoteSend';
import { apiClient } from '../../services/api-client';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Controllable XHR fake
// ---------------------------------------------------------------------------

type XhrMode = 'success' | 'hang';

class FakeXHR {
  static mode: XhrMode = 'success';
  static instances: FakeXHR[] = [];
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 200;
  aborted = false;
  sentBody: unknown = null;

  constructor() {
    FakeXHR.instances.push(this);
  }
  open(_method: string, _url: string): void {}
  setRequestHeader(_k: string, _v: string): void {}
  send(body: unknown): void {
    this.sentBody = body;
    if (FakeXHR.mode === 'hang') return;
    // Emit one honest progress event, then complete.
    queueMicrotask(() => {
      if (this.aborted) return;
      this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
      queueMicrotask(() => {
        if (this.aborted) return;
        this.status = 200;
        this.onload?.();
      });
    });
  }
  abort(): void {
    this.aborted = true;
    this.onabort?.();
  }
}

// ---------------------------------------------------------------------------
// Hook harness (no @testing-library dependency — React 19 act + createRoot)
// ---------------------------------------------------------------------------

let captured: { current: VoiceNoteJob | null } = { current: null };
let capturedApi: {
  start: (b: Blob, d: number) => void;
  retry: () => void;
  dismiss: () => void;
} | null = null;

function Harness() {
  const { job, start, retry, dismiss } = useVoiceNoteSend('conv-1');
  captured.current = job;
  capturedApi = { start, retry, dismiss };
  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() => {
    root!.render(
      <QueryClientProvider client={qc}>
        <Harness />
      </QueryClientProvider>,
    );
  });
}

async function waitFor(
  cond: () => boolean,
  timeoutMs = 3000,
  label = 'condition',
): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
}

const BLOB = () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' });

beforeEach(() => {
  FakeXHR.instances = [];
  FakeXHR.mode = 'success';
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
  captured = { current: null };
  capturedApi = null;
  mount();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

function mockApi(opts: {
  presign?: unknown;
  finalize?: unknown;
  send?: unknown;
  sendImpl?: (...args: unknown[]) => Promise<unknown>;
}) {
  const presignData = { uploadUrl: 'https://stub.test/k?sig=x', mediaId: 'media_1', expiresAt: '', fields: {} };
  const finalizeData = { mediaId: 'media_1', url: 'https://stub.test/k', filename: 'v.webm', contentType: 'audio/webm' };
  vi.spyOn(apiClient, 'createMediaUploadUrl').mockResolvedValue(
    (opts.presign as never) ?? ({ success: true, data: presignData } as never),
  );
  vi.spyOn(apiClient, 'finalizeMediaUpload').mockResolvedValue(
    (opts.finalize as never) ?? ({ success: true, data: finalizeData } as never),
  );
  const sendSpy = vi.spyOn(apiClient, 'sendMessage');
  if (opts.sendImpl) sendSpy.mockImplementation(opts.sendImpl as never);
  else
    sendSpy.mockResolvedValue(
      (opts.send as never) ?? ({ success: true, data: { id: 'msg-1' } } as never),
    );
  return sendSpy;
}

describe('QC-F-573 useVoiceNoteSend pipeline', () => {
  it('full success: recorded -> uploading -> finalizing -> sending -> sent', async () => {
    const sendSpy = mockApi({});
    await act(async () => {
      capturedApi!.start(BLOB(), 5320);
    });
    await waitFor(() => captured.current?.stage === 'sent', 5000, 'sent');
    const job = captured.current!;
    expect(job.uploadProgress).toBe(1);
    expect(job.mediaUrl).toBe('https://stub.test/k');
    // The send carried the real contract: audio type, finalized URL, real
    // duration, and the client idempotency key.
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const req = sendSpy.mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(req.type).toBe('audio');
    expect(req.mediaUrl).toBe('https://stub.test/k');
    expect((req.metadata as unknown as Record<string, unknown>).voiceDurationMs).toBe(5320);
    expect(typeof req.clientMsgId).toBe('string');
    // The blob bytes were actually PUT.
    expect(FakeXHR.instances).toHaveLength(1);
    expect(FakeXHR.instances[0]!.sentBody).toBeInstanceOf(Blob);
  });

  it('presign failure: failed-upload with the blob RETAINED for retry', async () => {
    mockApi({ presign: { success: false, error: { message: 'storage down' } } });
    await act(async () => {
      capturedApi!.start(BLOB(), 3000);
    });
    await waitFor(() => captured.current?.stage === 'failed-upload', 5000, 'failed-upload');
    // The blob is retained — the user can retry; nothing claimed sent.
    expect(captured.current!.blob).toBeInstanceOf(Blob);
    expect(captured.current!.blob.size).toBe(4);
    expect(captured.current!.error).toContain('storage down');
  });

  it('finalize failure: NO send happens before finalize returns', async () => {
    const sendSpy = mockApi({
      finalize: { success: false, error: { message: 'MEDIA_NOT_UPLOADED' } },
    });
    await act(async () => {
      capturedApi!.start(BLOB(), 3000);
    });
    await waitFor(() => captured.current?.stage === 'failed-finalize', 5000, 'failed-finalize');
    expect(sendSpy).not.toHaveBeenCalled();
    expect(captured.current!.blob.size).toBe(4);
  });

  it('retry after a failed send reuses the SAME clientMsgId (idempotent)', async () => {
    let attempts = 0;
    const sendSpy = mockApi({
      sendImpl: async () => {
        attempts++;
        if (attempts === 1) return { success: false, error: { message: 'boom' } };
        return { success: true, data: { id: 'msg-1' } };
      },
    });
    await act(async () => {
      capturedApi!.start(BLOB(), 3000);
    });
    await waitFor(() => captured.current?.stage === 'failed-send', 5000, 'failed-send');
    const firstKey = (sendSpy.mock.calls[0]![0] as unknown as Record<string, unknown>).clientMsgId;
    expect(typeof firstKey).toBe('string');

    await act(async () => {
      capturedApi!.retry();
    });
    await waitFor(() => captured.current?.stage === 'sent', 5000, 'sent after retry');
    expect(sendSpy).toHaveBeenCalledTimes(2);
    const secondKey = (sendSpy.mock.calls[1]![0] as unknown as Record<string, unknown>).clientMsgId;
    // Same logical operation: identical idempotency key, identical payload.
    expect(secondKey).toBe(firstKey);
    expect((sendSpy.mock.calls[1]![0] as unknown as Record<string, unknown>).type).toBe('audio');
    expect((sendSpy.mock.calls[1]![0] as unknown as Record<string, unknown>).mediaUrl).toBe(
      (sendSpy.mock.calls[0]![0] as unknown as Record<string, unknown>).mediaUrl,
    );
  });

  it('retry after failed upload restarts the pipeline but keeps the clientMsgId', async () => {
    const presignSpy = vi.spyOn(apiClient, 'createMediaUploadUrl');
    presignSpy
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValue({
        success: true,
        data: { uploadUrl: 'https://stub.test/k?sig=x', mediaId: 'media_1', expiresAt: '', fields: {} },
      } as never);
    vi.spyOn(apiClient, 'finalizeMediaUpload').mockResolvedValue({
      success: true,
      data: { mediaId: 'media_1', url: 'https://stub.test/k', filename: 'v', contentType: 'audio/webm' },
    } as never);
    const sendSpy = vi
      .spyOn(apiClient, 'sendMessage')
      .mockResolvedValue({ success: true, data: { id: 'msg-1' } } as never);

    let firstClientMsgId = '';
    sendSpy.mockImplementation(async (req: unknown) => {
      firstClientMsgId = (req as unknown as Record<string, unknown>).clientMsgId as string;
      return { success: true, data: { id: 'msg-1' } } as never;
    });

    await act(async () => {
      capturedApi!.start(BLOB(), 3000);
    });
    await waitFor(() => captured.current?.stage === 'failed-upload', 5000, 'failed-upload');
    const jobBefore = captured.current!;
    await act(async () => {
      capturedApi!.retry();
    });
    await waitFor(() => captured.current?.stage === 'sent', 5000, 'sent after retry');
    // Same clientMsgId across the restart: one logical send.
    expect(firstClientMsgId).toBe(jobBefore.clientMsgId);
    expect(captured.current!.clientMsgId).toBe(jobBefore.clientMsgId);
  });

  it('dismiss clears the job (blob released)', async () => {
    mockApi({ presign: { success: false, error: { message: 'down' } } });
    await act(async () => {
      capturedApi!.start(BLOB(), 3000);
    });
    await waitFor(() => captured.current?.stage === 'failed-upload', 5000, 'failed-upload');
    await act(async () => {
      capturedApi!.dismiss();
    });
    expect(captured.current).toBeNull();
  });
});
