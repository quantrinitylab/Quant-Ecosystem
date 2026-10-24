// ============================================================================
// QuantDrive — public share file card (NOT a route page).
//
// DriveFileCard lives here — NOT in page.tsx — on purpose: Next.js rejects
// any named export from a page file ("<name> is not a valid Page export
// field"), which is exactly how fix/qm-drive-disable-download-4 red-lit
// `next build` on PR #1527 after fixing the PR #1523 type error. Unit tests
// import DriveFileCard from this module; page.tsx only re-uses it.
// ============================================================================
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Skeleton } from '@quant/shared-ui';
import { formatBytes } from '../../../../lib/format-bytes';
import {
  downloadUrlFor,
  previewUrlFor,
  previewKindFor,
  TEXT_PREVIEW_MAX_BYTES,
  type ResolvedShare,
} from './share-resolve';

// Locked Drive accent via app theme var; hex fallback only for standalone public pages.
export const DRIVE_GREEN = 'var(--app-accent, var(--quant-success))';

export function FileGlyph() {
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

export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
}

/** Public share file card: preview + download affordance for one shared file. */
export function DriveFileCard({ share, token }: { share: ResolvedShare & { kind: 'drive-file' }; token: string }) {
  const { file } = share;
  const [password, setPassword] = useState('');
  const [passwordHint, setPasswordHint] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [textPreviewState, setTextPreviewState] = useState<'idle' | 'loading' | 'error' | 'too-large'>(
    'idle',
  );

  const previewKind = previewKindFor(file.mimeType);
  const expiresLabel = formatDate(file.expiresAt);
  const sizeTooLargeForText = typeof file.size === 'number' && file.size > TEXT_PREVIEW_MAX_BYTES;

  // QM-M39-006 (disable-download): the owner blocked downloads for this
  // viewer-role link. The button is never shown — the backend 403s downloads
  // anyway; previews use the read-only preview lane.
  const downloadBlocked = file.role !== 'editor' && file.disableDownload === true;

  const handleDownload = useCallback(() => {
    if (file.requiresPassword && !password) {
      setPasswordHint('Enter the link password to download this file.');
      return;
    }
    setPasswordHint(null);
    window.location.href = downloadUrlFor(token, password || undefined);
  }, [file.requiresPassword, password, token]);

  useEffect(() => {
    if (previewKind !== 'text' || textPreviewState !== 'idle') return;
    if (sizeTooLargeForText) {
      setTextPreviewState('too-large');
      return;
    }
    let cancelled = false;
    setTextPreviewState('loading');
    // QM-M39-006 (disable-download): text previews read through the backend's
    // preview lane, never the download endpoint — the flag stays enforced.
    fetch(previewUrlFor(token, password || undefined), { credentials: 'include' })
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

  const previewUrl = previewUrlFor(token, password || undefined);

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
          {downloadBlocked && <Badge variant="default">Download disabled by owner</Badge>}
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
          <img src={previewUrl} alt={file.name} className="max-h-[60vh] w-full object-contain" />
        </div>
      )}
      {previewKind === 'pdf' && (
        <div className="mt-5 overflow-hidden rounded-xl bg-black">
          <iframe
            src={previewUrl}
            title={file.name}
            className="h-[60vh] w-full"
            sandbox="allow-same-origin"
          />
        </div>
      )}
      {previewKind === 'text' && (
        <div className="mt-5 overflow-hidden rounded-xl bg-black p-4">
          {textPreviewState === 'loading' && <Skeleton variant="rect" width="100%" height="120px" />}
          {textPreviewState === 'error' && (
            <p className="text-xs text-[var(--quant-muted-foreground)]">
              {downloadBlocked
                ? 'Preview failed to load — ask the owner to share the file another way.'
                : 'Preview failed to load — download the file to read it.'}
            </p>
          )}
          {textPreviewState === 'too-large' && (
            <p className="text-xs text-[var(--quant-muted-foreground)]">
              {downloadBlocked
                ? 'This file is too large to preview here — ask the owner for another way to read it.'
                : 'This file is too large to preview here — download it to read it.'}
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
          {downloadBlocked
            ? 'Preview isn\u2019t available for this file type, and the owner disabled downloading — ask the owner for access.'
            : 'Preview isn\u2019t available for this file type — download it to view.'}
        </p>
      )}

      <div className="mt-5">
        {downloadBlocked ? (
          <p className="text-center text-xs text-[var(--quant-muted-foreground)]">
            {previewKind === null
              ? 'The owner disabled downloading for this link — ask the owner for access.'
              : 'The owner disabled downloading for this link — you can preview the file above.'}
          </p>
        ) : (
          <Button
            variant="primary"
            fullWidth
            onClick={handleDownload}
            className="bg-[var(--app-accent,var(--quant-success))] border-[var(--app-accent,var(--quant-success))] text-black"
          >
            Download file
          </Button>
        )}
      </div>
    </Card>
  );
}

