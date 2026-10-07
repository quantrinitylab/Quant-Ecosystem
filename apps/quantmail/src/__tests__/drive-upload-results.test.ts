import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getUploadBatchError } from '../lib/drive-upload-results';
import { useDrive } from '../hooks/useDrive';

// Isolated hook-contract tests, not a React renderer or live storage test.
const state = vi.hoisted(() => ({
  cells: [] as { value: unknown }[],
  replies: [] as { status: number; body?: unknown }[],
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
    const reply = state.replies.shift();
    if (!reply) throw new Error('Unexpected upload request');
    this.status = reply.status;
    this.responseText = JSON.stringify(reply.body ?? {});
    queueMicrotask(() => this.onload?.());
  }
}

const files = () => [new File(['one'], 'one.txt'), new File(['two'], 'two.txt')];

beforeEach(() => {
  state.cells = [];
  state.replies = [];
  state.request.mockReset();
  state.refresh.mockReset();
  state.request.mockResolvedValue({ ok: true, json: async () => ({ files: [] }) });
  state.refresh.mockResolvedValue({ success: false });
  vi.stubGlobal('XMLHttpRequest', FakeUploadRequest);
});
afterEach(() => vi.unstubAllGlobals());

describe('upload batch summaries', () => {
  it('does not invent an error for a successful or empty batch', () => {
    expect(getUploadBatchError(2, [])).toBeNull();
    expect(getUploadBatchError(0, [])).toBeNull();
  });

  it('reports partial completion and the first failure reason', () => {
    expect(getUploadBatchError(3, ['Quota exceeded'])).toBe(
      'Uploaded 2 of 3 files. 1 failed or cancelled. Quota exceeded',
    );
  });

  it('reports zero successful files when every upload failed', () => {
    expect(getUploadBatchError(2, ['Storage unavailable', 'Upload cancelled'])).toBe(
      'Uploaded 0 of 2 files. 2 failed or cancelled. Storage unavailable',
    );
  });
});

describe('Drive operation promise contracts', () => {
  it('resolves an all-success upload and refreshes the file list', async () => {
    state.replies = [{ status: 201 }, { status: 201 }];
    await expect(useDrive().uploadFiles(files())).resolves.toBeUndefined();
    expect(state.request).toHaveBeenCalledWith('/api/drive/files?');
    expect(state.cells[3].value).toEqual([
      expect.objectContaining({ status: 'complete', progress: 100 }),
      expect.objectContaining({ status: 'complete', progress: 100 }),
    ]);
  });

  it('rejects a partial upload while preserving progress and refreshing successes', async () => {
    state.replies = [
      { status: 201 },
      { status: 500, body: { error: { message: 'Quota exceeded' } } },
    ];
    await expect(useDrive().uploadFiles(files())).rejects.toThrow(
      'Uploaded 1 of 2 files. 1 failed or cancelled. Quota exceeded',
    );
    expect(state.request).toHaveBeenCalledWith('/api/drive/files?');
    expect(state.cells[3].value).toEqual([
      expect.objectContaining({ status: 'complete' }),
      expect.objectContaining({ status: 'error', error: 'Quota exceeded' }),
    ]);
    expect(state.cells[2].value).toContain('Uploaded 1 of 2 files');
  });

  it('rejects when session refresh throws instead of leaving the upload unresolved', async () => {
    state.replies = [{ status: 401 }];
    state.refresh.mockRejectedValueOnce(new Error('Refresh unavailable'));
    await expect(useDrive().uploadFiles(files().slice(0, 1))).rejects.toThrow(
      'Uploaded 0 of 1 files. 1 failed or cancelled. Refresh unavailable',
    );
    expect(state.refresh).toHaveBeenCalledTimes(1);
  });

  it('rejects a failed folder response without inserting a folder', async () => {
    state.request.mockResolvedValueOnce({ ok: false });
    await expect(useDrive().createFolder('Docs')).rejects.toThrow('Create folder failed');
    expect(state.cells[0].value).toEqual([]);
    expect(state.cells[2].value).toBe('Create folder failed');
  });

  it('propagates a folder network error to the caller', async () => {
    state.request.mockRejectedValueOnce(new Error('Network unavailable'));
    await expect(useDrive().createFolder('Docs')).rejects.toThrow('Network unavailable');
    expect(state.cells[0].value).toEqual([]);
  });

  it('returns and inserts a confirmed folder creation', async () => {
    const folder = { id: 'folder-fixture', name: 'Docs', type: 'folder' };
    state.request.mockResolvedValueOnce({ ok: true, json: async () => folder });
    await expect(useDrive().createFolder('Docs')).resolves.toEqual(folder);
    expect(state.cells[0].value).toEqual([folder]);
  });
});
