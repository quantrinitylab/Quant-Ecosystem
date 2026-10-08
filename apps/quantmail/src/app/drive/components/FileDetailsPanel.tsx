'use client';

// ============================================================================
// FileDetailsPanel — QM-M39-007 (M39 screen 24: file details panel)
// ============================================================================
//
// A right slide-over panel showing a file's identity: name, type, owner,
// modified time, location breadcrumb, sharing state, scan state (QM-M39-009
// model), and version context.
//
// FILE IDENTITY RULE (standing user rule): every field comes from the
// aggregated backend endpoint GET /api/drive/files/:id/details. Nothing is
// fabricated — when a value is absent the panel says so ("Never opened",
// "Only you have access") instead of inventing one.

import React, { useEffect, useState } from 'react';
import { apiFetchRaw } from '@quant/api-client';
import { FileScanDetail } from './FileScanBadge';

export interface FileDetailsLocation {
  id: string;
  name: string;
}

export interface FileDetailsResponse {
  id: string;
  name: string;
  type: 'file' | 'folder';
  mimeType: string;
  size: number;
  owner: { name: string; email: string };
  isOwner: boolean;
  modifiedAt: string | null;
  createdAt: string | null;
  lastOpenedAt: string | null;
  location: FileDetailsLocation[];
  sharing: {
    people: { email: string; permission: string }[] | null;
    peopleCount: number;
    linkCount: number;
    links: { role: string; expiresAt: string | null; createdAt: string }[] | null;
  };
  scan: { status: string; reason: string | null; scannedAt: string | null } | null;
  versions: { count: number; latest: { version: number; size: number; date: string } | null } | null;
}

export interface FileDetailsPanelProps {
  /** The item to describe. The panel fetches its own identity from the backend. */
  item: { id: string; name: string } | null;
  onClose: () => void;
  /** Open the version history modal for the current file. */
  onOpenVersionHistory?: (id: string, name: string) => void;
  /** Jump to a folder in the breadcrumb. */
  onNavigateToFolder?: (folderId: string | null, folderName?: string) => void;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** Human-readable type label derived from the real mimeType — never invented. */
export function humanType(mimeType: string, type: 'file' | 'folder'): string {
  if (type === 'folder') return 'Folder';
  const m = (mimeType || '').toLowerCase();
  if (m === 'application/pdf') return 'PDF document';
  if (m.startsWith('image/')) return 'Image';
  if (m.startsWith('video/')) return 'Video';
  if (m.startsWith('audio/')) return 'Audio';
  if (m.includes('zip') || m.includes('tar') || m.includes('archive') || m.includes('gzip'))
    return 'Archive';
  if (m.startsWith('text/') || m.includes('document') || m.includes('word')) return 'Document';
  if (m.includes('sheet') || m.includes('excel') || m.includes('csv')) return 'Spreadsheet';
  if (m.includes('presentation') || m.includes('powerpoint')) return 'Presentation';
  if (m.includes('json') || m.includes('javascript') || m.includes('typescript') || m.includes('python'))
    return 'Code file';
  return mimeType || 'File';
}

/** Pure presentational body of the panel — no fetching, fully testable. */
export function FileDetailsView({
  details,
  onOpenVersionHistory,
  onNavigateToFolder,
}: {
  details: FileDetailsResponse;
  onOpenVersionHistory?: (id: string, name: string) => void;
  onNavigateToFolder?: (folderId: string | null, folderName?: string) => void;
}) {
  const ownerName = details?.owner?.name || details?.owner?.email || '';
  const shared =
    (details?.sharing.peopleCount ?? 0) > 0 || (details?.sharing.linkCount ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* Identity */}
      <section aria-label="File information">
        <SectionLabel>Information</SectionLabel>
        <div className="mt-1">
          <DetailRow label="Type">{humanType(details.mimeType, details.type)}</DetailRow>
          {details.type === 'file' && (
            <DetailRow label="Size">{formatBytes(details.size)}</DetailRow>
          )}
          <DetailRow label="Owner">
            {ownerName ? (
              <span title={details.owner.email}>
                {ownerName}
                {details.owner.name && details.owner.email && details.owner.name !== details.owner.email ? (
                  <span className="block text-[#94A3B8]">{details.owner.email}</span>
                ) : null}
              </span>
            ) : (
              <span className="text-[#64748B]">Unknown</span>
            )}
          </DetailRow>
          <DetailRow label="Modified">
            {details.modifiedAt ? formatDateTime(details.modifiedAt) : (
              <span className="text-[#64748B]">Unknown</span>
            )}
          </DetailRow>
          {details.createdAt && (
            <DetailRow label="Created">{formatDateTime(details.createdAt)}</DetailRow>
          )}
          <DetailRow label="Last opened">
            {details.lastOpenedAt ? (
              formatDateTime(details.lastOpenedAt)
            ) : (
              <span className="text-[#64748B]">Never opened</span>
            )}
          </DetailRow>
        </div>
      </section>

      {/* Location */}
      <section aria-label="Location">
        <SectionLabel>Location</SectionLabel>
        <nav aria-label="File location" className="mt-2 flex flex-wrap items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => onNavigateToFolder?.(null, 'My Drive')}
            className="text-[#38BDF8] hover:underline"
          >
            My Drive
          </button>
          {details.location.map((crumb) => (
            <React.Fragment key={crumb.id}>
              <span className="text-[#64748B]" aria-hidden="true">/</span>
              <button
                type="button"
                onClick={() => onNavigateToFolder?.(crumb.id, crumb.name)}
                className="text-[#38BDF8] hover:underline truncate max-w-[140px]"
                title={crumb.name}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
          <span className="text-[#64748B]" aria-hidden="true">/</span>
          <span className="text-[#F1F5F9] truncate max-w-[160px] font-medium" title={details.name}>
            {details.name}
          </span>
        </nav>
      </section>

      {/* Sharing */}
      <section aria-label="Sharing">
        <SectionLabel>Sharing</SectionLabel>
        <div className="mt-2">
          {!shared && (
            <p className="text-xs text-[#94A3B8]">
              {details.isOwner
                ? 'Only you have access to this item.'
                : `Shared with you by ${ownerName || 'the owner'}.`}
            </p>
          )}
          {shared && (
            <div className="space-y-2">
              {details.sharing.peopleCount > 0 && (
                <div>
                  <p className="text-xs text-[#F1F5F9] font-medium">
                    Shared with {details.sharing.peopleCount}{' '}
                    {details.sharing.peopleCount === 1 ? 'person' : 'people'}
                  </p>
                  {details.sharing.people && details.sharing.people.length > 0 ? (
                    <ul className="mt-1.5 space-y-1">
                      {details.sharing.people.map((p) => (
                        <li
                          key={p.email}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="text-[#94A3B8] truncate" title={p.email}>
                            {p.email || 'Unknown address'}
                          </span>
                          <span className="text-[#64748B] capitalize shrink-0">{p.permission}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-[#64748B] mt-1">
                      Recipient list is visible to the owner.
                    </p>
                  )}
                </div>
              )}
              {details.sharing.linkCount > 0 && (
                <div>
                  <p className="text-xs text-[#F1F5F9] font-medium">
                    {details.sharing.linkCount} active{' '}
                    {details.sharing.linkCount === 1 ? 'share link' : 'share links'}
                  </p>
                  {details.sharing.links && details.sharing.links.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {details.sharing.links.map((l, i) => (
                        <li key={i} className="text-[11px] text-[#94A3B8]">
                          {l.role === 'editor' ? 'Anyone with the link can edit' : 'Anyone with the link can view'}
                          {l.expiresAt ? ` · expires ${formatDateTime(l.expiresAt)}` : ' · never expires'}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Security — QM-M39-009 scan-state model. Folders have no scan state. */}
      {details.scan && (
        <section aria-label="Security">
          <div className="rounded-xl bg-[var(--quant-surface)] px-4 py-3 shadow-[inset_0_0_0_1px_var(--quant-surface-elevated)]">
            <FileScanDetail status={details.scan.status} reason={details.scan.reason} />
            {details.scan.scannedAt && (
              <p className="text-[11px] text-[#64748B] mt-1.5">
                Scanned {formatDateTime(details.scan.scannedAt)}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Versions — files only */}
      {details.versions && (
        <section aria-label="Version history">
          <SectionLabel>Versions</SectionLabel>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-[#94A3B8]">
              {details.versions.count === 0
                ? 'No versions recorded for this file.'
                : `${details.versions.count} ${details.versions.count === 1 ? 'version' : 'versions'}${
                    details.versions.latest
                      ? ` · latest ${formatDateTime(details.versions.latest.date)} (${formatBytes(details.versions.latest.size)})`
                      : ''
                  }`}
            </p>
            {details.versions.count > 0 && onOpenVersionHistory && (
              <button
                type="button"
                onClick={() => onOpenVersionHistory(details.id, details.name)}
                className="px-3 py-1.5 rounded-lg bg-[var(--quant-surface-elevated)] text-xs font-medium text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#334155] transition-colors shrink-0"
              >
                View history
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">{children}</p>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--quant-surface-elevated)] last:border-0">
      <span className="text-xs text-[#94A3B8] shrink-0">{label}</span>
      <span className="text-xs text-[#F1F5F9] text-right break-all min-w-0">{children}</span>
    </div>
  );
}

export function FileDetailsPanel({
  item,
  onClose,
  onOpenVersionHistory,
  onNavigateToFolder,
}: FileDetailsPanelProps) {
  const [details, setDetails] = useState<FileDetailsResponse | null>(null);
  // Start loading when an item is already selected on first render, so the
  // first paint shows the honest skeleton rather than a blank panel.
  const [loading, setLoading] = useState(item !== null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) {
      setDetails(null);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setDetails(null);
    apiFetchRaw(`/api/drive/files/${encodeURIComponent(item.id)}/details`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            data?.message || `Could not load file details (${res.status})`,
          );
        }
        setDetails(data as FileDetailsResponse);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Could not load file details.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [item]);

  // Esc closes the panel.
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  if (!item) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`File details: ${item.name}`}
      className="fixed inset-0 z-[110]"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <aside className="absolute right-0 top-0 h-full w-full max-w-sm bg-[var(--quant-surface-subtle)] border-l border-[#232938] shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-[#232938] shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
              Details
            </p>
            <h2 className="text-sm font-bold text-[#F8FAFC] truncate mt-0.5" title={item.name}>
              {details?.name ?? item.name}
            </h2>
            {details && (
              <p className="text-[11px] text-[#94A3B8] mt-0.5">
                {humanType(details.mimeType, details.type)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details panel"
            className="p-2 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[var(--quant-surface-elevated)] transition-colors shrink-0"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {loading && (
            <div className="space-y-3" aria-label="Loading file details">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-8 rounded-lg bg-[var(--quant-surface-elevated)]/60 animate-pulse" />
              ))}
            </div>
          )}

          {error && !loading && (
            <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
              <p className="text-xs font-semibold text-rose-300">Could not load details</p>
              <p className="text-xs text-[#94A3B8] mt-1">{error}</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-3 px-3 py-1.5 rounded-lg bg-[var(--quant-surface-elevated)] text-xs text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
              >
                Close
              </button>
            </div>
          )}

          {details && !loading && (
            <FileDetailsView
              details={details}
              onOpenVersionHistory={onOpenVersionHistory}
              onNavigateToFolder={onNavigateToFolder}
            />
          )}
        </div>
      </aside>
    </div>
  );
}
