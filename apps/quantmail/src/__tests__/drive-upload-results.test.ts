import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getUploadBatchError } from '../lib/drive-upload-results';
import { useDrive, clearResumableUploadSessionsForTests } from '../hooks/useDrive';

// Isolated hook-contract tests for the resumable chunked upload path
// (QM-SCREEN-011 P0), not a React renderer or live storage test.
const state = vi.hoisted(() => ({
  cells: [] as { value: unknown }[],
  request: vi.fn(),
  // Per-URL-behavior script for the chunked protocol mock.
  chunkPlan: {
    initiateCalls: 0,
    failSecondInitiate: false,
    chunkFailuresRemaining: 0,
    chunkCalls: 0,
  },
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
  browserAuthSession: { refresh: vi.fn(), getAccessToken: () => null },
}));

const okJson = (body: unknown, status = 200) => ({
  ok: true,
  status,
  text: async () => JSON.stringify(body),
  json: async () => body,
});
const errJson = (status: number, message: string) => ({
  ok: false,
  status,
  statusText: '',
  text: async () => JSON.stringify({ error: { message } }),
  json: async () => ({ error: { message } }),
});

const installChunkMock = () => {
  state.request.mockImplementation(async (url: string) => {
    if (typeof url === 'string' && url.includes('/drive/upload/chunk/initiate')) {
      state.chunkPlan.initiateCalls += 1;
      if (state.chunkPlan.failSecondInitiate && state.chunkPlan.initiateCalls === 2) {
        return errJson(500, 'Quota exceeded');
      }
      return okJson({ uploadId: 'srv-test-1', chunkSize: 5 * 1024 * 1024, totalChunks: 1 }, 201);
    }
    if (typeof url === 'string' && url.includes('/drive/upload/chunk/') && url.endsWith('/status')) {
      return okJson({
        uploadId: 'srv-test-1',
        chunkSize: 5 * 1024 * 1024,
        totalChunks: 1,
        missingChunks: [0],
        isComplete: false,
      });
    }
    if (typeof url === 'string' && url.includes('/drive/upload/chunk/') && url.endsWith('/complete')) {
      return okJson({ file: { id: 'file-1' }, quota: { used: 1, total: 100 } }, 201);
    }
    if (typeof url === 'string' && url.includes('/drive/upload/chunk/')) {
      state.chunkPlan.chunkCalls += 1;
      if (state.chunkPlan.chunkFailuresRemaining > 0) {
        state.chunkPlan.chunkFailuresRemaining -= 1;
        throw new TypeError('Network error');
      }
      return okJson({
        uploadId: 'srv-test-1',
        chunkIndex: 0,
        receivedChunks: 1,
        totalChunks: 1,
        isComplete: true,
      });
    }
    // fetchFiles and everything else.
    return okJson({ files: [] });
  });
};

const files = () => [new File(['one'], 'one.txt'), new File(['two'], 'two.txt')];

beforeEach(() => {
  state.cells = [];
  state.request.mockReset();
  state.chunkPlan.initiateCalls = 0;
  state.chunkPlan.failSecondInitiate = false;
  state.chunkPlan.chunkFailuresRemaining = 0;
  state.chunkPlan.chunkCalls = 0;
  clearResumableUploadSessionsForTests();
  installChunkMock();
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
  it('uploads via the chunk protocol (initiate → chunk → complete) and refreshes the file list', async () => {
    await expect(useDrive().uploadFiles(files())).resolves.toBeUndefined();
    expect(state.chunkPlan.initiateCalls).toBe(2);
    expect(state.chunkPlan.chunkCalls).toBe(2);
    expect(state.request).toHaveBeenCalledWith('/api/drive/files?');
    // The per-file uploads/progress tracking was removed — no consumer ever
    // rendered it. Success = resolved promise + refreshed file list.
    expect(state.cells[2].value).toBeNull();
  });

  it('rejects a partial upload while refreshing successes', async () => {
    state.chunkPlan.failSecondInitiate = true;
    await expect(useDrive().uploadFiles(files())).rejects.toThrow(
      'Uploaded 1 of 2 files. 1 failed or cancelled. Quota exceeded',
    );
    expect(state.request).toHaveBeenCalledWith('/api/drive/files?');
    expect(state.cells[2].value).toContain('Uploaded 1 of 2 files');
  });

  it('retries a failed chunk instead of restarting the file', async () => {
    state.chunkPlan.chunkFailuresRemaining = 2;
    await expect(useDrive().uploadFiles(files().slice(0, 1))).resolves.toBeUndefined();
    // 2 failures + 1 success, all for the same chunk of the same session.
    expect(state.chunkPlan.chunkCalls).toBe(3);
    expect(state.chunkPlan.initiateCalls).toBe(1);
    // No per-file progress state anymore — success = resolved promise.
    expect(state.cells[2].value).toBeNull();
  });

  it('resumes an interrupted upload via the status endpoint on retry', async () => {
    // Same File object across both calls — a re-selected file keeps its
    // lastModified, so the fingerprint (and the remembered session) matches.
    const retryFiles = files().slice(0, 1);
    // First attempt: every chunk POST fails (3 attempts exhausted).
    state.chunkPlan.chunkFailuresRemaining = 3;
    await expect(useDrive().uploadFiles(retryFiles)).rejects.toThrow(
      'Uploaded 0 of 1 files. 1 failed or cancelled. Network error',
    );
    expect(state.chunkPlan.initiateCalls).toBe(1);

    // Second attempt with the same File: the remembered session is resumed —
    // status is queried and only the missing chunk is re-uploaded, no new
    // initiate.
    state.chunkPlan.chunkFailuresRemaining = 0;
    await expect(useDrive().uploadFiles(retryFiles)).resolves.toBeUndefined();
    expect(state.chunkPlan.initiateCalls).toBe(1);
  });

  it('refuses empty files up front with an honest message — no upload path is attempted', async () => {
    const empty = new File([], 'empty.txt');
    await expect(useDrive().uploadFiles([empty])).rejects.toThrow(
      "Empty files can't be uploaded yet",
    );
    // Neither the chunk protocol nor the legacy one-shot POST /api/drive/upload
    // may be called for a 0-byte file (both reject it server-side anyway).
    const urls = state.request.mock.calls.map((call) => String(call[0]));
    expect(urls.some((u) => u.endsWith('/api/drive/upload'))).toBe(false);
    expect(urls.some((u) => u.includes('/drive/upload/chunk/initiate'))).toBe(false);
  });

  it('rejects a file larger than the chunked cap with the honest 413 message', async () => {
    const big = new File(['x'], 'big.bin');
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 * 1024 });
    await expect(useDrive().uploadFiles([big])).rejects.toThrow(
      'Uploaded 0 of 1 files. 1 failed or cancelled. File exceeds maximum upload size of 5368709120 bytes',
    );
    expect(state.chunkPlan.initiateCalls).toBe(0);
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
