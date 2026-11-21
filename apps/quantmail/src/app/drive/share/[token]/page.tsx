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
import {
  SHARE_ERROR_COPY,
  ShareResolveError,
  resolveShareToken,
  type ResolvedShare,
} from './share-resolve';
import { DriveFileCard, DRIVE_GREEN, FileGlyph, formatDate } from './drive-file-card';

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
