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
  downloadUrlFor,
  previewKindFor,
  resolveShareToken,
  TEXT_PREVIEW_MAX_BYTES,
  type ResolvedShare,
} from './share-resolve';
import { decideTextPreview, fetchTextPreview } from './text-preview';

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
  const [textPreviewState, setTextPreviewState] = useState<
    'idle' | 'loading' | 'error' | 'too-large' | 'locked' | 'wrong-password'
  >('idle');
  // The password the viewer EXPLICITLY submitted for preview/download via
  // Unlock/Retry — deliberately separate from the live `password` input, so
  // typing never fires a byte request and a corrected password only fetches
  // when the viewer asks for it (fix/qm-drive-share-text-preview).
  const [submittedPassword, setSubmittedPassword] = useState<string | null>(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);

  const previewKind = previewKindFor(file.mimeType);
  const expiresLabel = formatDate(file.expiresAt);

  const handleDownload = useCallback(() => {
    if (file.requiresPassword && !password) {
      setPasswordHint('Enter the link password to download this file.');
      return;
    }
    setPasswordHint(null);
    window.location.href = downloadUrlFor(token, password || undefined);
  }, [file.requiresPassword, password, token]);

  // Unlock/Retry for previews: submit the current password input and bump the
  // attempt counter so the effect below refetches with the corrected value.
  // This is the wrong-password → corrected-password retry path: the previous
  // effect run is aborted, the new one fetches with the new password.
  const submitPreviewPassword = useCallback(() => {
    // Non-password files retry with no password at all; password files need
    // the current input submitted explicitly (never the half-typed value).
    if (file.requiresPassword && !password) {
      setPasswordHint('Enter the link password to load the preview.');
      return;
    }
    setPasswordHint(null);
    setSubmittedPassword(file.requiresPassword ? password : null);
    setPreviewAttempt((n) => n + 1);
  }, [file.requiresPassword, password]);

  // Deferred text-preview lifecycle (fix/qm-drive-share-text-preview):
  // this effect NEVER depends on `textPreviewState` — the state it sets —
  // so setting 'loading' cannot re-run the effect and cancel its own fetch
  // (the old self-cancel that hung text shares on "Loading preview…").
  // It depends only on the gate inputs (kind, size, token, submitted
  // password, attempt counter). While the gate says 'locked' no byte
  // request fires at all; every unlock/retry aborts the previous fetch.
  useEffect(() => {
    if (previewKind !== 'text') return;
    const decision = decideTextPreview({
      previewKind,
      requiresPassword: file.requiresPassword,
      submittedPassword,
      size: file.size,
      maxBytes: TEXT_PREVIEW_MAX_BYTES,
    });
    if (decision === 'too-large') {
      setTextPreviewState('too-large');
      return;
    }
    if (decision === 'locked') {
      setTextPreview(null);
      setTextPreviewState('locked');
      return;
    }
    if (decision === 'not-text') return;
    const controller = new AbortController();
    let cancelled = false;
    setTextPreviewState('loading');
    fetchTextPreview(downloadUrlFor(token, submittedPassword ?? undefined), {
      signal: controller.signal,
      maxBytes: TEXT_PREVIEW_MAX_BYTES,
    })
      .then((result) => {
        if (cancelled || controller.signal.aborted) return;
        if (result.status === 'ok') {
          setTextPreview(result.truncated ? `${result.text}\n… (truncated)` : result.text);
          setTextPreviewState('idle');
        } else if (result.status === 'too-large') {
          setTextPreviewState('too-large');
        } else if (result.status === 'wrong-password') {
          setTextPreviewState('wrong-password');
        } else if (result.status !== 'aborted') {
          setTextPreviewState('error');
        }
      })
      .catch(() => {
        if (!cancelled && !controller.signal.aborted) setTextPreviewState('error');
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [previewKind, file.requiresPassword, file.size, token, submittedPassword, previewAttempt]);

  // Previews (image/pdf/text) never request bytes before unlock: for a
  // password-protected file the preview URL only carries a submitted
  // password, and media blocks render only once a password was submitted.
  const previewUnlocked = !file.requiresPassword || submittedPassword !== null;
  const previewUrl = downloadUrlFor(token, submittedPassword ?? undefined);

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

      {previewKind === 'image' && previewUnlocked && (
        <div className="mt-5 overflow-hidden rounded-xl bg-black">
          {/* Real bytes from the backend download endpoint — not a placeholder. */}
          <img src={previewUrl} alt={file.name} className="max-h-[60vh] w-full object-contain" />
        </div>
      )}
      {previewKind === 'pdf' && previewUnlocked && (
        <div className="mt-5 overflow-hidden rounded-xl bg-black">
          <iframe
            src={previewUrl}
            title={file.name}
            className="h-[60vh] w-full"
            sandbox="allow-same-origin"
          />
        </div>
      )}
      {previewKind !== null && previewKind !== 'text' && !previewUnlocked && (
        <div className="mt-5 overflow-hidden rounded-xl bg-black p-4 text-center">
          <p className="text-xs text-[var(--quant-muted-foreground)]">
            This preview is password protected — enter the password above, then unlock it.
          </p>
          <div className="mt-3">
            <Button
              variant="primary"
              fullWidth
              onClick={submitPreviewPassword}
              className="bg-[var(--app-accent,var(--quant-success))] border-[var(--app-accent,var(--quant-success))] text-black"
            >
              Unlock preview
            </Button>
          </div>
        </div>
      )}
      {previewKind === 'text' && (
        <div className="mt-5 overflow-hidden rounded-xl bg-black p-4">
          {textPreviewState === 'loading' && <Skeleton variant="rect" width="100%" height="120px" />}
          {textPreviewState === 'locked' && (
            <div className="text-center">
              <p className="text-xs text-[var(--quant-muted-foreground)]">
                This preview is password protected — enter the password above, then unlock it.
              </p>
              <div className="mt-3">
                <Button
                  variant="primary"
                  fullWidth
                  onClick={submitPreviewPassword}
                  className="bg-[var(--app-accent,var(--quant-success))] border-[var(--app-accent,var(--quant-success))] text-black"
                >
                  Unlock preview
                </Button>
              </div>
            </div>
          )}
          {textPreviewState === 'wrong-password' && (
            <div className="text-center">
              <p className="text-xs text-amber-400">
                That password didn&apos;t unlock this file — check it and try again.
              </p>
              <div className="mt-3">
                <Button
                  variant="primary"
                  fullWidth
                  onClick={submitPreviewPassword}
                  className="bg-[var(--app-accent,var(--quant-success))] border-[var(--app-accent,var(--quant-success))] text-black"
                >
                  Retry preview
                </Button>
              </div>
            </div>
          )}
          {textPreviewState === 'error' && (
            <div className="text-center">
              <p className="text-xs text-[var(--quant-muted-foreground)]">
                Preview failed to load — download the file to read it, or try again.
              </p>
              <div className="mt-3">
                <Button
                  variant="primary"
                  fullWidth
                  onClick={submitPreviewPassword}
                  className="bg-[var(--app-accent,var(--quant-success))] border-[var(--app-accent,var(--quant-success))] text-black"
                >
                  Retry preview
                </Button>
              </div>
            </div>
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
          className="bg-[var(--app-accent,var(--quant-success))] border-[var(--app-accent,var(--quant-success))] text-black"
        >
          Download file
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
