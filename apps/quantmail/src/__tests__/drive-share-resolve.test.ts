/**
 * fix/qm-drive-dead-share-links — share landing token resolution tests.
 *
 * The landing page at /drive/share/[token] must resolve tokens against the
 * real backend with honest states: a known drive-file token returns the file,
 * a document token falls back to the documents endpoint, and unknown/expired
 * tokens surface honest errors — never invented file data.
 *
 * No real fixtures: tokens and payloads below are synthetic and the fetch
 * implementation is injected.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  downloadUrlFor,
  previewKindFor,
  resolveShareToken,
  ShareResolveError,
  TEXT_PREVIEW_MAX_BYTES,
} from '../app/drive/share/[token]/share-resolve';

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

const SYNTHETIC_DRIVE_TOKEN = 'drive-synthetic-token-001';
const SYNTHETIC_DOC_TOKEN = 'doc_share_synthetic001';

const syntheticDriveFile = {
  id: 'file-synth-1',
  name: 'synthetic-report.pdf',
  size: 123456,
  mimeType: 'application/pdf',
  updatedAt: '2026-10-01T00:00:00.000Z',
  role: 'viewer',
  ownerName: 'Synthetic Owner',
  requiresPassword: false,
  expiresAt: null,
  scope: 'anyone',
  requiresSignIn: false,
};

const syntheticDocument = {
  id: 'doc-synth-1',
  title: 'Synthetic doc',
  content: 'synthetic content',
  role: 'view',
  expiresAt: null,
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('resolveShareToken', () => {
  it('resolves a valid drive file token from the drive endpoint', async () => {
    const fetchImpl: FetchImpl = vi.fn(async (input: string) => {
      expect(input).toBe(`/api/drive/public/share/${SYNTHETIC_DRIVE_TOKEN}`);
      return jsonResponse({ success: true, file: syntheticDriveFile });
    });
    const resolved = await resolveShareToken(SYNTHETIC_DRIVE_TOKEN, fetchImpl);
    expect(resolved.kind).toBe('drive-file');
    if (resolved.kind === 'drive-file') {
      expect(resolved.file.name).toBe('synthetic-report.pdf');
      expect(resolved.file.ownerName).toBe('Synthetic Owner');
    }
    // The documents endpoint is never consulted when drive resolves.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('falls back to the documents endpoint when the drive endpoint 404s', async () => {
    const calls: string[] = [];
    const fetchImpl: FetchImpl = vi.fn(async (input: string) => {
      calls.push(input);
      if (input.startsWith('/api/drive/public/share/')) {
        return jsonResponse(
          { success: false, error: { code: 'SHARE_NOT_FOUND', message: 'nope', statusCode: 404 } },
          false,
          404,
        );
      }
      return jsonResponse({ success: true, data: syntheticDocument });
    });
    const resolved = await resolveShareToken(SYNTHETIC_DOC_TOKEN, fetchImpl);
    expect(resolved.kind).toBe('document');
    if (resolved.kind === 'document') {
      expect(resolved.document.title).toBe('Synthetic doc');
      expect(resolved.document.content).toBe('synthetic content');
    }
    expect(calls).toEqual([
      `/api/drive/public/share/${SYNTHETIC_DOC_TOKEN}`,
      `/api/documents/public/share/${SYNTHETIC_DOC_TOKEN}`,
    ]);
  });

  it('throws NOT_FOUND when neither endpoint knows the token', async () => {
    const fetchImpl: FetchImpl = vi.fn(async () =>
      jsonResponse(
        { success: false, error: { code: 'SHARE_NOT_FOUND', message: 'gone', statusCode: 404 } },
        false,
        404,
      ),
    );
    const err = await resolveShareToken('unknown-token-xyz', fetchImpl).catch((e) => e);
    expect(err).toBeInstanceOf(ShareResolveError);
    expect((err as ShareResolveError).code).toBe('NOT_FOUND');
  });

  it('throws EXPIRED on a 410 from the drive endpoint without probing documents', async () => {
    const fetchImpl: FetchImpl = vi.fn(async (input: string) => {
      expect(input.startsWith('/api/drive/public/share/')).toBe(true);
      return jsonResponse(
        { success: false, error: { code: 'LINK_EXPIRED', message: 'expired', statusCode: 410 } },
        false,
        410,
      );
    });
    const err = await resolveShareToken(SYNTHETIC_DRIVE_TOKEN, fetchImpl).catch((e) => e);
    expect((err as ShareResolveError).code).toBe('EXPIRED');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('throws SIGN_IN_REQUIRED on a 401 (restricted link, anonymous viewer)', async () => {
    const fetchImpl: FetchImpl = vi.fn(async () =>
      jsonResponse(
        {
          success: false,
          error: { code: 'LINK_SIGNIN_REQUIRED', message: 'sign in', statusCode: 401 },
        },
        false,
        401,
      ),
    );
    const err = await resolveShareToken(SYNTHETIC_DRIVE_TOKEN, fetchImpl).catch((e) => e);
    expect((err as ShareResolveError).code).toBe('SIGN_IN_REQUIRED');
  });

  it('throws FORBIDDEN on a 403 (audience-gated link)', async () => {
    const fetchImpl: FetchImpl = vi.fn(async () =>
      jsonResponse(
        {
          success: false,
          error: { code: 'LINK_AUDIENCE_FORBIDDEN', message: 'not yours', statusCode: 403 },
        },
        false,
        403,
      ),
    );
    const err = await resolveShareToken(SYNTHETIC_DRIVE_TOKEN, fetchImpl).catch((e) => e);
    expect((err as ShareResolveError).code).toBe('FORBIDDEN');
  });

  it('throws NETWORK when fetch itself fails', async () => {
    const fetchImpl: FetchImpl = vi.fn(async () => {
      throw new Error('boom');
    });
    const err = await resolveShareToken(SYNTHETIC_DRIVE_TOKEN, fetchImpl).catch((e) => e);
    expect((err as ShareResolveError).code).toBe('NETWORK');
  });

  it('throws NETWORK when the drive endpoint returns a malformed success body', async () => {
    const fetchImpl: FetchImpl = vi.fn(async () =>
      jsonResponse({ success: true, file: { nope: true } }),
    );
    const err = await resolveShareToken(SYNTHETIC_DRIVE_TOKEN, fetchImpl).catch((e) => e);
    expect((err as ShareResolveError).code).toBe('NETWORK');
  });

  it('URL-encodes tokens before placing them in the path', async () => {
    const seen: string[] = [];
    const fetchImpl: FetchImpl = vi.fn(async (input: string) => {
      seen.push(input);
      return jsonResponse({ success: true, file: syntheticDriveFile });
    });
    await resolveShareToken('tok/en?x=1', fetchImpl);
    expect(seen[0]).toBe('/api/drive/public/share/tok%2Fen%3Fx%3D1');
  });
});

describe('downloadUrlFor', () => {
  it('builds the backend download path for a token', () => {
    expect(downloadUrlFor('abc123')).toBe('/api/drive/public/share/abc123/download');
  });

  it('appends the password as the backend-supported query fallback', () => {
    expect(downloadUrlFor('abc123', 's3cret & more')).toBe(
      '/api/drive/public/share/abc123/download?password=s3cret%20%26%20more',
    );
  });
});

describe('previewKindFor', () => {
  it.each([
    ['image/png', 'image'],
    ['image/jpeg', 'image'],
    ['application/pdf', 'pdf'],
    ['text/plain', 'text'],
    ['text/markdown', 'text'],
    ['application/json', 'text'],
  ])('maps %s to %s preview', (mime, expected) => {
    expect(previewKindFor(mime)).toBe(expected);
  });

  it.each([['application/zip'], ['video/mp4'], ['application/octet-stream'], ['']])(
    'returns null (download-only, honest) for %s',
    (mime) => {
      expect(previewKindFor(mime)).toBeNull();
    },
  );

  it('ignores mime parameters', () => {
    expect(previewKindFor('text/plain; charset=utf-8')).toBe('text');
  });
});

describe('text preview budget', () => {
  it('caps inline text previews at 256KB', () => {
    expect(TEXT_PREVIEW_MAX_BYTES).toBe(256 * 1024);
  });
});
