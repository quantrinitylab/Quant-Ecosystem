// ============================================================================
// QuantDrive public share landing — token resolution (fix/qm-drive-dead-share-links)
//
// The product hands out share URLs at the ONE canonical path /drive/share/<token>:
//   - Drive file links:  backend shareUrl = `/drive/share/<token>` (drive.ts linkDto +
//                        POST /drive/shares/link), resolved via GET /drive/public/share/:token
//   - Document links:    backend shareUrl = `/drive/share/<token>` (documents.ts
//                        POST /documents/:id/share-link), resolved via
//                        GET /documents/public/share/:token
//
// This module resolves a token against the real backend with honest states only:
// a token the backend does not know is NOT_FOUND, an expired one is EXPIRED —
// never invented file data, never a fake preview.
// ============================================================================

export type ShareKind = 'drive-file' | 'document';

export interface DriveFileShareInfo {
  id: string;
  name: string;
  size: number | null;
  mimeType: string;
  updatedAt: string | null;
  role: string;
  ownerName: string;
  requiresPassword: boolean;
  expiresAt: string | null;
  scope: string;
  requiresSignIn: boolean;
}

export interface DocumentShareInfo {
  id: string;
  title: string;
  content: string | null;
  role: string;
  expiresAt: string | null;
  updatedAt: string | null;
}

export type ResolvedShare =
  | { kind: 'drive-file'; file: DriveFileShareInfo }
  | { kind: 'document'; document: DocumentShareInfo };

export type ShareErrorCode =
  | 'NOT_FOUND'
  | 'EXPIRED'
  | 'SIGN_IN_REQUIRED'
  | 'FORBIDDEN'
  | 'NETWORK';

/** Honest, user-facing copy for each resolution failure. No invented detail. */
export const SHARE_ERROR_COPY: Record<ShareErrorCode, { title: string; message: string }> = {
  NOT_FOUND: {
    title: 'Share link not found',
    message: "This link doesn't exist or was revoked by the owner. Ask them for a fresh link.",
  },
  EXPIRED: {
    title: 'Share link expired',
    message: 'This link has expired. Ask the owner for a fresh link.',
  },
  SIGN_IN_REQUIRED: {
    title: 'Sign in required',
    message: 'This link is restricted — sign in with your Quant account to continue.',
  },
  FORBIDDEN: {
    title: 'Not shared with you',
    message: "This link wasn't shared with your account.",
  },
  NETWORK: {
    title: "Couldn't load the shared file",
    message: 'Check your connection and try again.',
  },
};

export class ShareResolveError extends Error {
  readonly code: ShareErrorCode;
  readonly status: number;
  constructor(code: ShareErrorCode, status: number, message?: string) {
    super(message ?? SHARE_ERROR_COPY[code].message);
    this.name = 'ShareResolveError';
    this.code = code;
    this.status = status;
  }
}

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

async function readBodyCode(res: Response): Promise<string | null> {
  try {
    const data = (await res.json()) as {
      error?: { code?: string; message?: string } | string;
      message?: string;
    };
    if (data?.error && typeof data.error === 'object' && typeof data.error.code === 'string') {
      return data.error.code;
    }
    return null;
  } catch {
    return null;
  }
}

async function toShareError(res: Response, source: ShareKind): Promise<ShareResolveError> {
  const code = await readBodyCode(res);
  const status = res.status;
  // Prefer the backend's own error code; fall back to the HTTP status.
  if (code === 'LINK_EXPIRED' || status === 410) return new ShareResolveError('EXPIRED', status);
  if (code === 'LINK_SIGNIN_REQUIRED' || status === 401)
    return new ShareResolveError('SIGN_IN_REQUIRED', status);
  if (
    code === 'LINK_AUDIENCE_FORBIDDEN' ||
    code === 'LINK_ORG_FORBIDDEN' ||
    code === 'SHARE_PASSWORD_INVALID' ||
    status === 403
  )
    return new ShareResolveError('FORBIDDEN', status);
  if (code === 'SHARE_NOT_FOUND' || code === 'SHARE_LINK_NOT_FOUND' || status === 404)
    return new ShareResolveError('NOT_FOUND', status);
  return new ShareResolveError('NETWORK', status, 'The server returned an unexpected response.');
}

/**
 * Resolve a share token against the real backend.
 *
 * Drive file tokens go to GET /api/drive/public/share/:token. When that 404s,
 * the token may belong to a document-editor share link, which resolves via
 * GET /api/documents/public/share/:token. Both endpoints are public (backend
 * publicPaths exemption); credentials are included so restricted
 * (org/specific-audience) links resolve for a signed-in viewer.
 */
export async function resolveShareToken(
  token: string,
  fetchImpl: FetchImpl = fetch,
): Promise<ResolvedShare> {
  const encoded = encodeURIComponent(token);
  let driveRes: Response;
  try {
    driveRes = await fetchImpl(`/api/drive/public/share/${encoded}`, { credentials: 'include' });
  } catch {
    throw new ShareResolveError('NETWORK', 0);
  }

  if (driveRes.ok) {
    const data = (await driveRes.json().catch(() => ({}))) as { file?: DriveFileShareInfo };
    if (!data.file || typeof data.file.name !== 'string') {
      throw new ShareResolveError(
        'NETWORK',
        driveRes.status,
        'The server returned an unexpected response.',
      );
    }
    return { kind: 'drive-file', file: data.file };
  }

  // Any non-404 from the drive endpoint is a real answer (expired, gated, …).
  if (driveRes.status !== 404) throw await toShareError(driveRes, 'drive-file');

  let docRes: Response;
  try {
    docRes = await fetchImpl(`/api/documents/public/share/${encoded}`, {
      credentials: 'include',
    });
  } catch {
    throw new ShareResolveError('NETWORK', 0);
  }

  if (docRes.ok) {
    const data = (await docRes.json().catch(() => ({}))) as {
      data?: DocumentShareInfo;
      document?: DocumentShareInfo;
    };
    const document = data.data ?? data.document;
    if (!document || typeof document.title !== 'string') {
      throw new ShareResolveError(
        'NETWORK',
        docRes.status,
        'The server returned an unexpected response.',
      );
    }
    return { kind: 'document', document };
  }

  throw await toShareError(docRes, 'document');
}

/**
 * Download URL for a drive file share token. The backend streams the real
 * bytes from object storage.
 *
 * fix/qm-share-pw-query-param: a link password is NEVER placed in this URL —
 * it travels only in the `x-share-password` header (see fetchShareDownload),
 * so the secret never lands in browser history, server logs, or referers.
 * This function intentionally takes no password argument, so no caller can
 * reintroduce the query-string leak.
 */
export function downloadUrlFor(token: string): string {
  return `/api/drive/public/share/${encodeURIComponent(token)}/download`;
}

/** Header that carries a share-link password. Never the query string. */
export const SHARE_PASSWORD_HEADER = 'x-share-password';

/**
 * Fetch the share download bytes with the password in a header, never the
 * URL. Returns the raw Response so callers can stream to blob/text.
 */
export async function fetchShareDownload(
  token: string,
  password: string | undefined,
  fetchImpl: FetchImpl = fetch,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (password) headers[SHARE_PASSWORD_HEADER] = password;
  return fetchImpl(downloadUrlFor(token), { credentials: 'include', headers });
}

/**
 * Download a share file without any navigation carrying a secret: fetch with
 * the password header, then trigger a blob download with the real filename.
 */
export async function downloadShareFile(
  token: string,
  password: string | undefined,
  filename: string,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  const res = await fetchShareDownload(token, password, fetchImpl);
  if (!res.ok) throw await toShareError(res, 'drive-file');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Revoke on the next tick so the download has started; the blob is
    // reference-counted by the download itself once initiated.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

/**
 * Blob object URL for inline image/pdf previews. Same header-only password
 * transport as downloads — previews used to embed the secret in <img>/<iframe>
 * src URLs via the query fallback.
 */
export async function sharePreviewObjectUrl(
  token: string,
  password: string | undefined,
  fetchImpl: FetchImpl = fetch,
): Promise<string> {
  const res = await fetchShareDownload(token, password, fetchImpl);
  if (!res.ok) throw await toShareError(res, 'drive-file');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

const IMAGE_MIME = /^image\//;
const TEXT_MIME = /^(text\/|application\/(json|.*\+json)$)/;

/** Inline preview kind for a real file, or null when only download is honest. */
export function previewKindFor(mimeType: string): 'image' | 'pdf' | 'text' | null {
  const mime = mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (IMAGE_MIME.test(mime)) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (TEXT_MIME.test(mime) || mime === 'text/markdown') return 'text';
  return null;
}

/** Max bytes fetched for an inline text preview — never stream a dump blindly. */
export const TEXT_PREVIEW_MAX_BYTES = 256 * 1024;
