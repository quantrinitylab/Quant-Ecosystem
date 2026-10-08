'use client';

// ============================================================================
// QuantDrive — File Permissions / Access Viewer (QM-M39-005, M39 screen 21)
// A READ-ONLY view of who currently has access to a file: collaborators with
// their roles, and public link shares with scope, audience, and expiry — all
// from real backend data. This is deliberately separate from FileShareModal:
// that modal is where access CHANGES are proposed; this viewer only shows what
// access EXISTS right now.
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Modal } from '@quant/shared-ui';
import {
  fetchFileAccess,
  type FileAccessData,
  type FileLinkEntry,
  type FileShareEntry,
} from './file-access-api';

const PERMISSION_LABEL: Record<string, string> = {
  view: 'Can view',
  edit: 'Can edit',
  admin: 'Admin',
};

function formatDate(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

function PermissionBadge({ permission }: { permission: string }) {
  return (
    <span className="text-[11px] font-medium text-[#8B949E]">
      {PERMISSION_LABEL[permission] ?? permission}
    </span>
  );
}

function ShareRow({ share }: { share: FileShareEntry }) {
  return (
    <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-[#0D1117] border border-[#21262D]">
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          aria-hidden="true"
          className="w-7 h-7 shrink-0 rounded-full bg-[#38BDF8]/15 border border-[#38BDF8]/30 text-[#38BDF8] flex items-center justify-center text-[11px] font-bold"
        >
          {(share.email[0] || '?').toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-[#F0F6FC] truncate">{share.email}</p>
          <p className="text-[11px] text-[#6E7681]">
            {share.status === 'pending'
              ? 'Invite sent — not accepted yet'
              : `Added ${formatDate(share.createdAt)}`}
          </p>
        </div>
      </div>
      <PermissionBadge permission={share.permission} />
    </div>
  );
}

function LinkRow({ link }: { link: FileLinkEntry }) {
  return (
    <div className="p-3 rounded-lg bg-[#0D1117] border border-[#21262D] space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            aria-hidden="true"
            className="w-7 h-7 shrink-0 rounded-lg bg-[#38BDF8]/10 border border-[#38BDF8]/30 flex items-center justify-center text-[#38BDF8]"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-[#F0F6FC]">Anyone with the link</p>
            <p className="text-[11px] text-[#6E7681]">Created {formatDate(link.createdAt)}</p>
          </div>
        </div>
        <span className="text-[11px] font-medium text-[#8B949E] shrink-0">
          {link.role === 'editor' ? 'Can edit' : 'Can view'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {link.expired ? (
          <span className="text-[11px] px-2 py-0.5 rounded font-medium border border-[#F85149]/40 bg-[#F85149]/10 text-[#FF7B72]">
            Expired
          </span>
        ) : link.expiresAt ? (
          <span className="text-[11px] px-2 py-0.5 rounded font-medium border border-[#30363D] bg-[var(--quant-surface-elevated)] text-[#8B949E]">
            Expires {formatDate(link.expiresAt)}
          </span>
        ) : (
          <span className="text-[11px] px-2 py-0.5 rounded font-medium border border-[#30363D] bg-[var(--quant-surface-elevated)] text-[#8B949E]">
            No expiry set
          </span>
        )}
        {link.requiresPassword && (
          <span className="text-[11px] px-2 py-0.5 rounded font-medium border border-[#D29922]/40 bg-[#D29922]/10 text-[#E3B341]">
            Password protected
          </span>
        )}
      </div>
    </div>
  );
}

export interface FileAccessViewProps {
  fileName: string;
  data: FileAccessData | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onManageSharing: () => void;
}

/**
 * Presentational access view — renders whatever data it is given and never
 * fetches. Exported for tests.
 */
export function FileAccessView({
  fileName,
  data,
  loading,
  error,
  onRetry,
  onManageSharing,
}: FileAccessViewProps) {
  return (
    <div className="space-y-6 pt-1">
      <p className="text-[11px] text-[#8B949E]">
        Current access for this file. To grant or remove access, use Manage sharing.
      </p>

      {loading && (
        <div className="py-10 text-center" role="status" aria-live="polite">
          <p className="text-xs text-[#8B949E]">Loading access information…</p>
        </div>
      )}

      {!loading && error && (
        <div
          className="p-4 rounded-xl border border-[#F85149]/40 bg-[#F85149]/5 text-center space-y-3"
          role="alert"
        >
          <p className="text-xs text-[#FF7B72]">{error}</p>
          <Button variant="secondary" onClick={onRetry} className="text-xs">
            Try again
          </Button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* People with access */}
          <section aria-label="People with access">
            <h3 className="text-xs font-semibold text-[#8B949E] mb-2.5">People with access</h3>
            {data.shares.length > 0 ? (
              <div className="space-y-1.5">
                {data.shares.map((share) => (
                  <ShareRow key={share.id} share={share} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#6E7681] p-3 rounded-lg bg-[#0D1117] border border-[#21262D]">
                No one else has access to &ldquo;{fileName}&rdquo;.
              </p>
            )}
          </section>

          {/* Link access */}
          <section aria-label="Link access">
            <h3 className="text-xs font-semibold text-[#8B949E] mb-2.5">Link access</h3>
            {data.links.length > 0 ? (
              <div className="space-y-1.5">
                {data.links.map((link) => (
                  <LinkRow key={link.id} link={link} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#6E7681] p-3 rounded-lg bg-[#0D1117] border border-[#21262D]">
                No share links for &ldquo;{fileName}&rdquo;.
              </p>
            )}
          </section>
        </>
      )}

      {/* Footer — the viewer never changes access; changes live in FileShareModal */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#30363D]">
        <p className="text-[11px] text-[#6E7681]">Only the file owner can change sharing.</p>
        <Button variant="secondary" onClick={onManageSharing} className="text-xs whitespace-nowrap">
          Manage sharing
        </Button>
      </div>
    </div>
  );
}

export interface FilePermissionsViewerProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
  onManageSharing: () => void;
}

export const FilePermissionsViewer: React.FC<FilePermissionsViewerProps> = ({
  isOpen,
  onClose,
  fileId,
  fileName,
  onManageSharing,
}) => {
  const [data, setData] = useState<FileAccessData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const access = await fetchFileAccess(fileId);
      setData(access);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Could not load access information.');
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    if (isOpen) {
      setData(null);
      void load();
    }
  }, [isOpen, load]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Access — "${fileName}"`} size="md">
      <FileAccessView
        fileName={fileName}
        data={data}
        loading={loading}
        error={error}
        onRetry={load}
        onManageSharing={onManageSharing}
      />
    </Modal>
  );
};
