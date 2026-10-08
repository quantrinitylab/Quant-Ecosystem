// QM-M39-003 — Drive upload center (M39 screen 15) tests.
//
// Hook contract: queued → uploading → scanning → available → failed, with
// retry. Progress comes only from real XHR byte counts; 'scanning' appears
// only while the backend's real scanStatus is pending/scanning.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDrive } from '../hooks/useDrive';
import type { UploadProgress } from '../hooks/useDrive';

// Isolated hook-contract tests, not a React renderer or live storage test.
const state = vi.hoisted(() => ({
  cells: [] as { value: unknown }[],
  requests: [] as FakeUploadRequest[],
  replies: [] as { status: number; body?: unknown }[],
  scanReplies: [] as string[],
  request: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const cell = { value: initial };
    state.cells.push(cell);
    return [
      initial,
      (next: unknown) => {
        cell.value =
          typeof next === 'function' ? (next as (previous: unknown) => unknown)(cell.value) : next;
      },
    ];
  },
  useCallback: (callback: unknown) => callback,
  useRef: (value: unknown) => ({ current: value }),
}));
vi.mock('@quant/common', () => ({ logger: { error: vi.fn() } }));
vi.mock('../services/browser-api-request', () => ({ browserApiRequest: state.request }));
vi.mock('../services/browser-auth-session', () => ({
  browserAuthSession: { refresh: state.refresh, getAccessToken: () => null },
}));

class FakeUploadRequest {
  upload = { onprogress: undefined as unknown };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  withCredentials = false;
  status = 0;
  statusText = '';
  responseText = '';

  open() {
    return undefined;
  }
  setRequestHeader() {
    return undefined;
  }
  abort() {
    this.onabort?.();
  }
  send() {
    state.requests.push(this);
    const reply = state.replies.shift();
    if (!reply) throw new Error('Unexpected upload request');
    this.status = reply.status;
    this.responseText = JSON.stringify(reply.body ?? {});
    queueMicrotask(() => this.onload?.());
  }
  /** Fire a real byte-count progress event, like the browser would. */
  progress(loaded: number, total: number) {
    const handler = this.upload.onprogress as
      | ((event: { lengthComputable: boolean; loaded: number; total: number }) => void)
      | undefined;
    handler?.({ lengthComputable: true, loaded, total });
  }
}

const files = () => [new File(['one'], 'one.txt'), new File(['two'], 'two.txt')];
const uploadsCell = () => state.cells[3].value as UploadProgress[];

beforeEach(() => {
  state.cells = [];
  state.requests = [];
  state.replies = [];
  state.scanReplies = [];
  state.request.mockReset();
  state.refresh.mockReset();
  state.request.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/drive/files/') && url !== '/api/drive/files/') {
      const scanStatus = state.scanReplies.shift() ?? 'scanning';
      return {
        ok: true,
        json: async () => ({ file: { id: 'f1', scanStatus, scanReason: null } }),
      };
    }
    return { ok: true, json: async () => ({ files: [] }) };
  });
  state.refresh.mockResolvedValue({ success: false });
  vi.stubGlobal('XMLHttpRequest', FakeUploadRequest);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('upload center queue states', () => {
  it('moves queued → uploading → available with progress from real byte counts', async () => {
    state.replies = [{ status: 201, body: { file: { id: 'f1', scanStatus: 'unknown' } } }];
    const hook = useDrive();
    const pending = hook.uploadFiles(files().slice(0, 1));

    // Real byte event: 512 of 1024 => exactly 50%, never interpolated.
    state.requests[0].progress(512, 1024);
    expect(uploadsCell()[0]).toMatchObject({
      status: 'uploading',
      progress: 50,
      bytesUploaded: 512,
    });

    await pending;
    // 'unknown' scan state goes straight to available — no fake 'scanning'.
    expect(uploadsCell()[0]).toMatchObject({
      status: 'available',
      progress: 100,
      scanStatus: 'unknown',
    });
    // No scan poll was needed for an unscanned file.
    expect(state.request).not.toHaveBeenCalledWith('/api/drive/files/f1');
  });

  it('shows scanning only while the backend reports an in-flight scan, then resolves the real verdict', async () => {
    vi.useFakeTimers();
    state.replies = [{ status: 201, body: { file: { id: 'f1', scanStatus: 'scanning' } } }];
    const hook = useDrive();
    const pending = hook.uploadFiles(files().slice(0, 1));

    await vi.advanceTimersByTimeAsync(0);
    expect(uploadsCell()[0]).toMatchObject({ status: 'scanning', progress: 100 });

    state.scanReplies = ['clean'];
    await vi.advanceTimersByTimeAsync(2000);
    await pending;
    expect(uploadsCell()[0]).toMatchObject({ status: 'available', scanStatus: 'clean' });
    expect(state.request).toHaveBeenCalledWith('/api/drive/files/f1');
  });

  it('blocks a quarantined file: failed, no retry, batch summary stays honest', async () => {
    state.replies = [
      {
        status: 201,
        body: { file: { id: 'f3', scanStatus: 'quarantined', scanReason: 'EICAR test signature' } },
      },
    ];
    const hook = useDrive();
    await expect(hook.uploadFiles(files().slice(0, 1))).rejects.toThrow(
      'Uploaded 0 of 1 files. 1 failed or cancelled. Quarantined by the security scan',
    );
    const entry = uploadsCell()[0];
    expect(entry).toMatchObject({
      status: 'failed',
      blocked: true,
      scanStatus: 'quarantined',
      error: 'Quarantined: EICAR test signature',
    });
    // Retry is a no-op for a blocked entry.
    state.replies = [{ status: 201, body: { file: { id: 'f3', scanStatus: 'unknown' } } }];
    await hook.retryUpload(entry.fileId);
    expect(state.requests).toHaveLength(1);
    expect(uploadsCell()[0].status).toBe('failed');
  });

  it('retries a failed upload with the original file and records the attempt', async () => {
    state.replies = [{ status: 500, body: { error: { message: 'Network down' } } }];
    const hook = useDrive();
    await expect(hook.uploadFiles(files().slice(0, 1))).rejects.toThrow(
      'Uploaded 0 of 1 files. 1 failed or cancelled. Network down',
    );
    const uploadId = uploadsCell()[0].fileId;
    expect(uploadsCell()[0]).toMatchObject({ status: 'failed', error: 'Network down', attempts: 1 });

    state.replies = [{ status: 201, body: { file: { id: 'f2', scanStatus: 'unknown' } } }];
    await hook.retryUpload(uploadId);
    expect(state.requests).toHaveLength(2);
    expect(uploadsCell()[0]).toMatchObject({ status: 'available', attempts: 2, progress: 100 });
  });

  it('marks a cancelled upload as cancelled instead of dropping it', async () => {
    state.replies = [{ status: 201, body: { file: { id: 'f1', scanStatus: 'unknown' } } }];
    const hook = useDrive();
    const pending = hook.uploadFiles(files().slice(0, 1));
    const uploadId = uploadsCell()[0].fileId;
    hook.cancelUpload(uploadId);
    await pending;
    expect(uploadsCell()[0]).toMatchObject({ status: 'cancelled' });
  });

  it('dismisses and clears finished entries', async () => {
    state.replies = [
      { status: 201, body: { file: { id: 'f1', scanStatus: 'unknown' } } },
      { status: 500, body: { error: { message: 'Too large' } } },
    ];
    const hook = useDrive();
    await expect(hook.uploadFiles(files())).rejects.toThrow('Uploaded 1 of 2 files');
    expect(uploadsCell()).toHaveLength(2);
    hook.dismissUpload(uploadsCell()[0].fileId);
    expect(uploadsCell()).toHaveLength(1);
    hook.clearFinishedUploads();
    expect(uploadsCell()).toHaveLength(0);
  });
});
