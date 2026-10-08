'use client';

// ============================================================================
// QM-M39-003 — Drive upload center (M39 screen 15).
// A real, visible upload queue: per-file progress, distinct states
// (queued → uploading → scanning → available → failed), retry on failure.
//
// HONESTY CONTRACT (standing user rule):
// - Progress bars show ONLY real XHR upload bytes (loaded/total). No timers,
//   no animation, no interpolated values — ever.
// - The 'scanning' state appears only while the backend's real scanStatus is
//   pending/scanning. An unscanned file ('unknown') goes straight to
//   'available' — it is never shown as scanned.
// - Every visible word is an instruction or a provable truth.
// ============================================================================

import { useState } from 'react';
import {
  IconCheckCircle,
  IconChevronDown,
  IconClock,
  IconRefresh,
  IconShield,
  IconUpload,
  IconWarning,
  IconX,
} from '../../../components/icons';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { formatBytes } from '../../../lib/format-bytes';
import type { UploadCenterStatus, UploadProgress } from '../../../hooks/useDrive';

interface UploadCenterProps {
  uploads: UploadProgress[];
  onRetry: (uploadId: string) => void;
  onCancel: (uploadId: string) => void;
  onDismiss: (uploadId: string) => void;
  onClearFinished: () => void;
}

const STATUS_LABEL: Record<UploadCenterStatus, string> = {
  queued: 'Queued',
  uploading: 'Uploading',
  scanning: 'Scanning',
  available: 'Available',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const TERMINAL: UploadCenterStatus[] = ['available', 'failed', 'cancelled'];

function StatusIcon({ status }: { status: UploadCenterStatus }) {
  const cls = 'shrink-0';
  switch (status) {
    case 'queued':
      return <IconClock size={16} className={`${cls} text-[#A1A4AC]`} />;
    case 'uploading':
      return <IconUpload size={16} className={`${cls} text-[#FF8C42]`} />;
    case 'scanning':
      return <IconShield size={16} className={`${cls} text-[#7CC4FF]`} />;
    case 'available':
      return <IconCheckCircle size={16} className={`${cls} text-[#4ADE80]`} />;
    case 'failed':
      return <IconWarning size={16} className={`${cls} text-[#F87171]`} />;
    case 'cancelled':
      return <IconX size={16} className={`${cls} text-[#A1A4AC]`} />;
  }
}

function UploadRow({
  entry,
  onRetry,
  onCancel,
  onDismiss,
}: {
  entry: UploadProgress;
  onRetry: (uploadId: string) => void;
  onCancel: (uploadId: string) => void;
  onDismiss: (uploadId: string) => void;
}) {
  const isActive = entry.status === 'uploading' || entry.status === 'scanning';
  const isTerminal = TERMINAL.includes(entry.status);
  const quarantined = entry.scanStatus === 'quarantined';

  // Detail line: real numbers and the real backend message only.
  let detail: string;
  if (entry.status === 'uploading') {
    detail =
      entry.bytesUploaded > 0 && entry.fileSize > 0
        ? `${formatBytes(entry.bytesUploaded)} of ${formatBytes(entry.fileSize)}`
        : `${entry.progress}%`;
  } else if (entry.status === 'scanning') {
    detail = 'Security scan in progress';
  } else if (entry.status === 'queued') {
    detail = 'Waiting to start';
  } else if (entry.status === 'failed') {
    detail = quarantined ? 'Blocked — quarantined' : 'Failed';
  } else if (entry.status === 'cancelled') {
    detail = 'Cancelled';
  } else {
    detail = entry.scanStatus === 'unknown' ? 'Available · not scanned' : 'Available';
  }

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 border-b border-[var(--quant-border)] last:border-b-0"
      data-testid={`upload-row-${entry.status}`}
      data-upload-id={entry.fileId}
    >
      <div className="mt-0.5">
        <StatusIcon status={entry.status} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs font-medium text-white truncate" title={entry.fileName}>
            {entry.fileName}
          </p>
          <span className="text-[10px] text-[#A1A4AC] shrink-0">{formatBytes(entry.fileSize)}</span>
        </div>
        <p className="text-[11px] text-[#A1A4AC] mt-0.5">
          {STATUS_LABEL[entry.status]}
          {entry.status === 'uploading' ? ` · ${entry.progress}%` : ''}
          {entry.attempts > 1 ? ` · attempt ${entry.attempts}` : ''} · {detail}
        </p>
        {/* Progress bar: width comes only from real XHR byte counts. */}
        {(entry.status === 'uploading' || entry.status === 'scanning') && (
          <div
            className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden"
            role="progressbar"
            aria-valuenow={entry.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Upload progress for ${entry.fileName}`}
          >
            <div
              className={`h-full rounded-full ${entry.status === 'scanning' ? 'bg-[#7CC4FF]' : 'bg-[#FF8C42]'}`}
              style={{ width: `${entry.progress}%` }}
            />
          </div>
        )}
        {entry.status === 'failed' && entry.error && (
          <p className="text-[11px] text-[#F87171] mt-1 break-words">{entry.error}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          {isActive && (
            <button
              type="button"
              onClick={() => onCancel(entry.fileId)}
              className="text-[11px] text-[#A1A4AC] hover:text-white underline underline-offset-2"
              aria-label={`Cancel upload of ${entry.fileName}`}
            >
              Cancel
            </button>
          )}
          {entry.status === 'failed' && !entry.blocked && (
            <button
              type="button"
              onClick={() => onRetry(entry.fileId)}
              className="inline-flex items-center gap-1 text-[11px] text-[#FF8C42] hover:text-white"
              aria-label={`Retry upload of ${entry.fileName}`}
            >
              <IconRefresh size={12} />
              Retry
            </button>
          )}
          {isTerminal && (
            <button
              type="button"
              onClick={() => onDismiss(entry.fileId)}
              className="text-[11px] text-[#A1A4AC] hover:text-white underline underline-offset-2"
              aria-label={`Dismiss ${entry.fileName} from the upload list`}
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function UploadCenter({
  uploads,
  onRetry,
  onCancel,
  onDismiss,
  onClearFinished,
}: UploadCenterProps) {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);

  if (uploads.length === 0) return null;

  const done = uploads.filter((u) => u.status === 'available').length;
  const hasFinished = uploads.some((u) => TERMINAL.includes(u.status));

  return (
    <section
      aria-label="Uploads"
      data-testid="upload-center"
      className={
        isMobile
          ? 'fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-[var(--quant-border)] bg-[#111318]/95 backdrop-blur shadow-2xl overflow-hidden'
          : 'fixed bottom-6 right-6 z-50 w-[380px] rounded-2xl border border-[var(--quant-border)] bg-[#111318]/95 backdrop-blur shadow-2xl overflow-hidden'
      }
    >
      <header className="flex items-center gap-2 px-4 py-3">
        <IconUpload size={15} className="text-[#FF8C42] shrink-0" />
        <h2 className="text-xs font-semibold text-white">Uploads</h2>
        <span className="text-[11px] text-[#A1A4AC]">
          {done} of {uploads.length} complete
        </span>
        <div className="ml-auto flex items-center gap-1">
          {hasFinished && (
            <button
              type="button"
              onClick={onClearFinished}
              className="text-[11px] text-[#A1A4AC] hover:text-white px-2 py-1"
            >
              Clear finished
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="p-1.5 text-[#A1A4AC] hover:text-white"
            aria-label={collapsed ? 'Expand upload list' : 'Collapse upload list'}
            aria-expanded={!collapsed}
          >
            <span className={`inline-block transition-transform ${collapsed ? '' : 'rotate-180'}`}>
              <IconChevronDown size={14} />
            </span>
          </button>
        </div>
      </header>
      {!collapsed && (
        <div className="max-h-[46vh] overflow-y-auto border-t border-[var(--quant-border)]">
          {uploads.map((entry) => (
            <UploadRow
              key={entry.fileId}
              entry={entry}
              onRetry={onRetry}
              onCancel={onCancel}
              onDismiss={onDismiss}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default UploadCenter;
