// ============================================================================
// QuantDrive — public share landing page (fix/qm-drive-dead-share-links)
//
// ONE canonical path for every share link the product hands out:
// /drive/share/<token>. Previously both /drive/share/<token> (drive file links)
// and /documents/public/share/<token> (document links) 404'd — no route existed.
//
// Public page: no AppShell, no auth requirement. Everything rendered here comes
// from the real backend (see ./share-resolve.ts); unknown/expired tokens get
// honest errors, never invented file data or fake previews.
// UI rules: pure black, no divider lines, Drive green accent.
// ============================================================================
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Badge, Button, Card, ErrorState, Skeleton } from '@quant/shared-ui';
import { QuantrinityMark } from '../../../../components/QuantrinityMark';
import { formatBytes } from '../../../../lib/format-bytes';
import {
  SHARE_ERROR_COPY,
  ShareResolveError,
  downloadShareFile,
  fetchShareDownload,
  previewKindFor,
  resolveShareToken,
  sharePreviewObjectUrl,
  TEXT_PREVIEW_MAX_BYTES,
  type ResolvedShare,
} from './share-resolve';

// Locked Drive accent via app theme var; hex fallback only for standalone public pages.
const DRIVE_GREEN = 'var(--app-accent, var(--quant-success))';

function FileGlyph() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
        stroke={DRIVE_GREEN}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14 2v4h4" stroke={DRIVE_GREEN} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
}

function DriveFileCard({ share, token }: { share: ResolvedShare & { kind: 'drive-file' }; token: string }) {
  const { file } = share;
  const [password, setPassword] = useState('');
  const [passwordHint, setPasswordHint] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [textPreviewState, setTextPreviewState] = useState<'idle' | 'loading' | 'error' | 'too-large'>(
    'idle',
  );
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const previewKind = previewKindFor(file.mimeType);
  const expiresLabel = formatDate(file.expiresAt);
  const sizeTooLargeForText = typeof file.size === 'number' && file.size > TEXT_PREVIEW_MAX_BYTES;

  const handleDownload = useCallback(async () => {
    if (file.requiresPassword && !password) {
      setPasswordHint('Enter the link password to download this file.');
      return;
    }
    setPasswordHint(null);
    setIsDownloading(true);
    try {
      // fix/qm-share-pw-query-param: blob download via the password header —
      // no navigation URL ever carries the secret.
      await downloadShareFile(token, password || undefined, file.name);
    } catch (err) {
      // Honest errors only: the backend gate answers 401 (missing) / 403
      // (wrong password); anything else is a network failure.
      if (err instanceof ShareResolveError && (err.status === 401 || err.status === 403)) {
        setPasswordHint('That password didn\u2019t unlock this file — check it and try again.');
      } else {
        setPasswordHint('Download failed — check your connection and try again.');
      }
    } finally {
      setIsDownloading(false);
    }
  }, [file.requiresPassword, file.name, password, token]);

  // Image/PDF previews fetch through the password header into a blob object
  // URL — the secret never appears in an <img>/<iframe> src URL.
  useEffect(() => {
    if (previewKind !== 'image' && previewKind !== 'pdf') return;
    if (file.requiresPassword && !password) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setPreviewFailed(false);
    sharePreviewObjectUrl(token, password || undefined)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setPreviewObjectUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setPreviewObjectUrl(null);
    };
  }, [previewKind, file.requiresPassword, token, password]);

  useEffect(() => {
    if (previewKind !== 'text' || textPreviewState !== 'idle') return;
    if (sizeTooLargeForText) {
      setTextPreviewState('too-large');
      return;
    }
    let cancelled = false;
    setTextPreviewState('loading');
    fetchShareDownload(token, password || undefined)
      .then(async (res) => {
        if (!res.ok) throw new Error('preview failed');
        const text = await res.text();
        if (!cancelled) {
          setTextPreview(
            text.length > TEXT_PREVIEW_MAX_BYTES
              ? text.slice(0, TEXT_PREVIEW_MAX_BYTES) + '\n… (truncated)'
              : text,
          );
          setTextPreviewState('idle');
        }
      })
      .catch(() => {
        if (!cancelled) setTextPreviewState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [previewKind, textPreviewState, sizeTooLargeForText, token, password]);

  return (
    <Card padding="none" className="p-6">
      <div className="flex flex-col items-center text-center">
        <FileGlyph />
        <h1 className="mt-3 text-lg font-semibold break-all">{file.name}</h1>
        <p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">
          {typeof file.size === 'number' ? formatBytes(file.size) : 'Unknown size'}
          {' · '}
          {file.mimeType || 'Unknown type'}
        </p>
        <p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">
          Shared by {file.ownerName || 'Unknown'}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Badge variant="default">{file.role === 'editor' ? 'Can edit' : 'View only'}</Badge>
          {file.requiresSignIn && <Badge variant="default">Restricted link</Badge>}
          {file.requiresPassword && <Badge variant="default">Password protected</Badge>}
        </div>
        {expiresLabel && (
          <p className="mt-2 text-[11px] text-[var(--quant-muted-foreground)]">
            Link expires {expiresLabel}
          </p>
        )}
      </div>

      {file.requiresPassword && (
        <div className="mt-5">
          <label
            htmlFor="share-password"
            className="mb-1 block text-xs text-[var(--quant-muted-foreground)]"
          >
            Link password
          </label>
          <input
            id="share-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter the password the owner shared"
            className="w-full rounded-xl bg-[var(--quant-muted)] px-3 py-2 text-sm outline-none placeholder:text-[var(--quant-muted-foreground)] focus:ring-1"
            style={{ ['--tw-ring-color' as string]: DRIVE_GREEN }}
            autoComplete="off"
          />
          {passwordHint && <p className="mt-1 text-xs text-amber-400">{passwordHint}</p>}
          <p className="mt-1 text-[11px] text-[var(--quant-muted-foreground)]">
            The password is sent to the server to unlock this file.
          </p>
        </div>
      )}

      {previewKind === 'image' && (
        <div className="mt-5 overflow-hidden rounded-xl bg-black">
          {/* Real bytes from the backend download endpoint — not a placeholder. */}
          {previewObjectUrl ? (
            <img
              src={previewObjectUrl}
              alt={file.name}
              className="max-h-[60vh] w-full object-contain"
            />
          ) : (
            <p className="p-4 text-center text-xs text-[var(--quant-muted-foreground)]">
              {previewFailed
                ? 'Preview failed to load — download the file to view it.'
                : file.requiresPassword && !password
                  ? 'Enter the link password above to preview this file.'
                  : 'Loading preview…'}
            </p>
          )}
        </div>
      )}
      {previewKind === 'pdf' && (
        <div className="mt-5 overflow-hidden rounded-xl bg-black">
          {previewObjectUrl ? (
            <iframe
              src={previewObjectUrl}
              title={file.name}
              className="h-[60vh] w-full"
              sandbox="allow-same-origin"
            />
          ) : (
            <p className="p-4 text-center text-xs text-[var(--quant-muted-foreground)]">
              {previewFailed
                ? 'Preview failed to load — download the file to view it.'
                : file.requiresPassword && !password
                  ? 'Enter the link password above to preview this file.'
                  : 'Loading preview…'}
            </p>
          )}
        </div>
      )}
      {previewKind === 'text' && (
        <div className="mt-5 overflow-hidden rounded-xl bg-black p-4">
          {textPreviewState === 'loading' && <Skeleton variant="rect" width="100%" height="120px" />}
          {textPreviewState === 'error' && (
            <p className="text-xs text-[var(--quant-muted-foreground)]">
              Preview failed to load — download the file to read it.
            </p>
          )}
          {textPreviewState === 'too-large' && (
            <p className="text-xs text-[var(--quant-muted-foreground)]">
              This file is too large to preview here — download it to read it.
            </p>
          )}
          {textPreviewState === 'idle' && textPreview !== null && (
            <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed">
              {textPreview}
            </pre>
          )}
        </div>
      )}
      {previewKind === null && (
        <p className="mt-5 text-center text-xs text-[var(--quant-muted-foreground)]">
          Preview isn&apos;t available for this file type — download it to view.
        </p>
      )}

      <div className="mt-5">
        <Button
          variant="primary"
          fullWidth
          onClick={handleDownload}
          disabled={isDownloading}
          className="bg-[var(--app-accent,var(--quant-success))] border-[var(--app-accent,var(--quant-success))] text-black"
        >
          {isDownloading ? 'Downloading…' : 'Download file'}
        </Button>
      </div>
    </Card>
  );
}

function DocumentCard({ share }: { share: ResolvedShare & { kind: 'document' } }) {
  const { document } = share;
  const expiresLabel = formatDate(document.expiresAt);
  const updatedLabel = formatDate(document.updatedAt);
  const content = typeof document.content === 'string' ? document.content : '';

  return (
    <Card padding="none" className="p-6">
      <div className="flex flex-col items-center text-center">
        <FileGlyph />
        <h1 className="mt-3 text-lg font-semibold break-all">{document.title || 'Untitled document'}</h1>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Badge variant="default">{document.role === 'edit' ? 'Can edit' : 'View only'}</Badge>
        </div>
        {updatedLabel && (
          <p className="mt-2 text-[11px] text-[var(--quant-muted-foreground)]">
            Updated {updatedLabel}
          </p>
        )}
        {expiresLabel && (
          <p className="mt-1 text-[11px] text-[var(--quant-muted-foreground)]">
            Link expires {expiresLabel}
          </p>
        )}
      </div>

      {content ? (
        <div className="mt-5 overflow-hidden rounded-xl bg-black p-4">
          <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words text-sm leading-relaxed">
            {content}
          </pre>
        </div>
      ) : (
        <p className="mt-5 text-center text-xs text-[var(--quant-muted-foreground)]">
          This document has no text content to preview.
        </p>
      )}

      <div className="mt-5">
        <Button
          variant="primary"
          fullWidth
          onClick={() => window.open(`/drive/doc/${document.id}`, '_blank', 'noopener')}
          className="bg-[var(--app-accent,var(--quant-success))] border-[var(--app-accent,var(--quant-success))] text-black"
        >
          Open in QuantDrive
        </Button>
        <p className="mt-2 text-center text-[11px] text-[var(--quant-muted-foreground)]">
          Opens the live document — you may be asked to sign in.
        </p>
      </div>
    </Card>
  );
}

export default function DriveShareLandingPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const router = useRouter();
  const [share, setShare] = useState<ResolvedShare | null>(null);
  const [error, setError] = useState<ShareResolveError | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(() => {
    if (!token) {
      setError(new ShareResolveError('NOT_FOUND', 404));
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    let cancelled = false;
    resolveShareToken(token)
      .then((resolved) => {
        if (!cancelled) {
          setShare(resolved);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof ShareResolveError ? err : new ShareResolveError('NETWORK', 0),
          );
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load]);

  const copy = error ? SHARE_ERROR_COPY[error.code] : null;

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-screen items-center justify-center p-6"
      style={{ background: '#000', color: '#f5f3f7' }}
    >
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center justify-center gap-2">
          <QuantrinityMark />
          <p className="text-xs tracking-wide" style={{ color: DRIVE_GREEN }}>
            QuantDrive shared file
          </p>
        </div>

        {isLoading && <Skeleton variant="rect" width="100%" height="320px" />}

        {!isLoading && error && error.code === 'SIGN_IN_REQUIRED' && (
          <Card padding="none" className="p-6 text-center">
            <h1 className="text-lg font-semibold">{copy?.title}</h1>
            <p className="mt-2 text-xs text-[var(--quant-muted-foreground)]">{copy?.message}</p>
            <div className="mt-5">
              <Button
                variant="primary"
                fullWidth
                onClick={() =>
                  router.push(`/login?returnTo=${encodeURIComponent(`/drive/share/${token}`)}`)
                }
                className="bg-[var(--app-accent,var(--quant-success))] border-[var(--app-accent,var(--quant-success))] text-black"
              >
                Sign in to view
              </Button>
            </div>
          </Card>
        )}

        {!isLoading && error && error.code !== 'SIGN_IN_REQUIRED' && (
          <ErrorState
            title={copy?.title ?? 'Something went wrong'}
            message={copy?.message ?? 'Please try again.'}
            onRetry={() => load()}
          />
        )}

        {!isLoading && !error && share?.kind === 'drive-file' && (
          <DriveFileCard share={share} token={token} />
        )}
        {!isLoading && !error && share?.kind === 'document' && <DocumentCard share={share} />}
      </div>
    </main>
  );
}
