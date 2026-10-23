import { describe, it, expect, vi, beforeEach } from 'vitest';

// QM-FIX-LOOP — universal-search drive FILE deep link (?file=<id>).
// The drive page resolves the id through the real
// GET /api/drive/files/:id/details endpoint via fetchDeepLinkFileItem.
// Errors must be honest (backend message, no invented file), folders must be
// rejected (no file preview exists), and incomplete payloads must fail loudly.

vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(),
}));

import { apiFetchRaw } from '@quant/api-client';
import { fetchDeepLinkFileItem } from '../app/drive/components/file-deep-link';

const mockedFetch = vi.mocked(apiFetchRaw);

function okResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  };
}

function errResponse(status: number, payload: unknown) {
  return {
    ok: false,
    status,
    json: async () => payload,
  };
}

beforeEach(() => {
  mockedFetch.mockReset();
});

describe('fetchDeepLinkFileItem', () => {
  it('maps the details payload to the preview item shape', async () => {
    mockedFetch.mockResolvedValue(
      okResponse({
        id: 'file-123',
        name: 'Q3 report.pdf',
        type: 'file',
        mimeType: 'application/pdf',
        size: 204800,
        modifiedAt: '2026-10-20T08:00:00Z',
        scan: { status: 'clean', reason: null },
      }) as never,
    );
    const item = await fetchDeepLinkFileItem('file-123');
    expect(item).toEqual({
      id: 'file-123',
      name: 'Q3 report.pdf',
      type: 'file',
      mimeType: 'application/pdf',
      size: 204800,
      modifiedAt: '2026-10-20T08:00:00Z',
      scanStatus: 'clean',
      scanReason: null,
    });
    expect(mockedFetch).toHaveBeenCalledWith(
      '/api/drive/files/file-123/details',
    );
  });

  it('tolerates missing optional fields without inventing data', async () => {
    mockedFetch.mockResolvedValue(
      okResponse({ id: 'f-9', name: 'notes', type: 'file' }) as never,
    );
    const item = await fetchDeepLinkFileItem('f-9');
    expect(item.mimeType).toBe('application/octet-stream');
    expect(item.size).toBe(0);
    expect(item.scanStatus).toBeNull();
    expect(item.scanReason).toBeNull();
  });

  it('URL-encodes the file id in the request path', async () => {
    mockedFetch.mockResolvedValue(okResponse({ id: 'a b', name: 'x', type: 'file' }) as never);
    await fetchDeepLinkFileItem('a b/c');
    expect(mockedFetch).toHaveBeenCalledWith('/api/drive/files/a%20b%2Fc/details');
  });

  it('throws the backend message on a failed fetch (honest error)', async () => {
    mockedFetch.mockResolvedValue(
      errResponse(404, { message: 'File not found' }) as never,
    );
    await expect(fetchDeepLinkFileItem('gone')).rejects.toThrow('File not found');
  });

  it('falls back to the status code when the backend gives no message', async () => {
    mockedFetch.mockResolvedValue(errResponse(500, {}) as never);
    await expect(fetchDeepLinkFileItem('f-1')).rejects.toThrow('(500)');
  });

  it('rejects folders — they have no file preview', async () => {
    mockedFetch.mockResolvedValue(
      okResponse({ id: 'fld-1', name: 'Photos', type: 'folder' }) as never,
    );
    await expect(fetchDeepLinkFileItem('fld-1')).rejects.toThrow(/folder/i);
  });

  it('fails loudly on an incomplete payload instead of inventing a file', async () => {
    mockedFetch.mockResolvedValue(okResponse({ id: 'f-2', type: 'file' }) as never);
    await expect(fetchDeepLinkFileItem('f-2')).rejects.toThrow(/incomplete/i);
  });
});
