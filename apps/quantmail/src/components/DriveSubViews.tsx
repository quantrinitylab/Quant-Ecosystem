'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { formatBytes } from '../lib/format-bytes';
import { useStorageQuota } from '../hooks/useStorageQuota';

// ============================================================================
// SVG Vector Icons — strictly ZERO raw Unicode emojis
// ============================================================================

function FolderIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  );
}

function ImageIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
      <path d="m14 14 3-3 4 4" />
    </svg>
  );
}

function VideoIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}

function AudioIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function DocumentIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function ArchiveIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" rx="1" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}

function TagIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" strokeWidth="2.5" />
    </svg>
  );
}

function LayersIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function TrashIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function PencilIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function HardDriveIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="22" y1="12" x2="2" y2="12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      <line x1="6" y1="16" x2="6.01" y2="16" strokeWidth="2.5" />
      <line x1="10" y1="16" x2="10.01" y2="16" strokeWidth="2.5" />
    </svg>
  );
}

function SearchIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function DownloadIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ShareIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function StarIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function StarFilledIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function ArrowLeftIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function CloseIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function BrainIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2a4.5 4.5 0 0 0-4.5 4.5c0 .77.2 1.5.54 2.14A5.5 5.5 0 0 0 4 14a5.5 5.5 0 0 0 4.5 5.41v1.59a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-1.59A5.5 5.5 0 0 0 20 14a5.5 5.5 0 0 0-4.04-5.36c.34-.64.54-1.37.54-2.14A4.5 4.5 0 0 0 12 2Z" />
      <path d="M12 7v5" />
      <path d="M9.5 12h5" />
      <path d="M9 16h6" />
    </svg>
  );
}

function ChatAppIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function SparklesIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}

function CameraGridIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" strokeWidth="2.5" />
    </svg>
  );
}

function MailAppIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

function TubeAppIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19.1c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.43z" />
      <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="currentColor" />
    </svg>
  );
}

function NodeLinkIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="18" r="3" />
      <line x1="8.12" y1="8.12" x2="15.88" y2="15.88" />
    </svg>
  );
}

// ============================================================================
// Types
// ============================================================================

export interface DriveItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  mimeType: string;
  size: number;
  modifiedAt: string;
  thumbnailUrl?: string;
  isStarred?: boolean;
  sharedWith?: { email: string; permission: string }[];
  deletedAt?: string;
  category?: string;
  tags?: string[];
}

export type DriveCategory =
  | 'images'
  | 'videos'
  | 'audios'
  | 'documents'
  | 'archive'
  | 'tags'
  | 'others'
  | 'trash';

// ============================================================================
// 1. SINGLE ENTERPRISE STORAGE GAUGE
// ============================================================================

export interface SingleEnterpriseStorageGaugeProps {
  usedFormatted?: string;
  totalFormatted?: string;
  planName?: string;
  remainingFormatted?: string;
  usedBytes?: number;
  totalBytes?: number;
  onUpgradeClick?: () => void;
  className?: string;
}

export function SingleEnterpriseStorageGauge({
  usedFormatted = 'Calculating…',
  totalFormatted = 'Calculating…',
  planName = 'Sovereign Enterprise Plan',
  remainingFormatted = 'Calculating…',
  usedBytes = 0,
  totalBytes = 0,
  onUpgradeClick,
  className = '',
}: SingleEnterpriseStorageGaugeProps) {
  // Never invent numbers: while the quota is unknown show "Calculating…"
  // (passed in via the formatted props) and a 0% bar.
  const percentage =
    totalBytes > 0 ? Math.min(100, Math.max(0, Math.round((usedBytes / totalBytes) * 100))) : 0;

  return (
    <div
      data-testid="single-enterprise-storage-gauge"
      className={`rounded-2xl border border-[#232938] bg-[#12151E] p-4 sm:p-5 shadow-[0_4px_24px_rgba(0,0,0,0.35)] ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3.5">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/30 flex items-center justify-center text-[#38BDF8] shrink-0">
            <HardDriveIcon className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-[#F8FAFC]">Enterprise Storage Gauge</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/30 font-mono">
                {planName}
              </span>
            </div>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              FastCDC 64KB CAS · Zero-Egress Storage · Hardware Enclave Active
            </p>
          </div>
        </div>

        <div className="flex items-center sm:items-end justify-between sm:justify-start gap-4">
          <div className="text-left sm:text-right">
            <div className="text-sm font-extrabold text-[#F8FAFC] tracking-tight">
              {usedFormatted} <span className="text-[#64748B] font-normal">/ {totalFormatted}</span>
            </div>
            <p className="text-[11px] text-[#38BDF8] font-medium mt-0.5">
              {percentage}% used · {remainingFormatted}
            </p>
          </div>

          <button
            type="button"
            onClick={onUpgradeClick}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#38BDF8]/15 border border-[#38BDF8]/40 text-xs font-semibold text-[#38BDF8] hover:bg-[#38BDF8]/25 hover:border-[#38BDF8]/70 shadow-[0_0_14px_rgba(56,189,248,0.15)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]"
          >
            <span>Upgrade Plan</span>
            <svg
              className="size-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Enterprise Gradient Progress Bar */}
      <div
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Storage quota usage"
        aria-valuetext={`${usedFormatted} of ${totalFormatted} used`}
        className="w-full h-2 rounded-full bg-[#1E293B] overflow-hidden"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#38BDF8] via-[#0284C7] to-[#818CF8] shadow-[0_0_12px_rgba(56,189,248,0.5)] transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// 2. HOME SUB-VIEW WITH 8 CATEGORIES & DEDICATED CATEGORY VIEW
// ============================================================================

export interface DriveHomeSubViewProps {
  files?: DriveItem[];
  folders?: DriveItem[];
  loading?: boolean;
  viewMode?: 'grid' | 'list';
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string, e?: React.MouseEvent) => void;
  onPreviewItem?: (item: DriveItem) => void;
  onDownloadFile?: (id: string, name: string) => void;
  onToggleStar?: (item: DriveItem, e?: React.MouseEvent) => void;
  onDeleteItem?: (id: string, name: string, e?: React.MouseEvent) => void;
  onOpenRename?: (item: DriveItem, e?: React.MouseEvent) => void;
  onOpenVersionHistory?: (item: DriveItem) => void;
  onOpenAiSummary?: (item: DriveItem) => void;
  onNavigateToFolder?: (folderId: string | null, folderName?: string) => void;
  onUpgradeClick?: () => void;
  trashItems?: DriveItem[];
  onRestoreTrashItem?: (id: string, name: string, e?: React.MouseEvent) => void;
  onPurgeTrashItem?: (id: string, name: string, e?: React.MouseEvent) => void;
}

export function DriveHomeSubView({
  files = [],
  folders = [],
  loading = false,
  viewMode = 'grid',
  selectedIds = new Set(),
  onToggleSelect,
  onPreviewItem,
  onDownloadFile,
  onToggleStar,
  onDeleteItem,
  onOpenRename,
  onOpenVersionHistory,
  onOpenAiSummary,
  onNavigateToFolder,
  onUpgradeClick,
  trashItems = [],
  onRestoreTrashItem,
  onPurgeTrashItem,
}: DriveHomeSubViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<DriveCategory | null>(null);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Real storage quota — the gauge must reflect actual usage, never invented numbers.
  const { quota, known: quotaKnown } = useStorageQuota();
  const gaugeUsedBytes = quota?.used ?? 0;
  const gaugeTotalBytes = quota?.total ?? 0;
  const gaugeUsedFormatted = quotaKnown ? formatBytes(gaugeUsedBytes) : 'Calculating…';
  const gaugeTotalFormatted = quotaKnown ? formatBytes(gaugeTotalBytes) : 'Calculating…';
  const gaugeRemainingFormatted = quotaKnown
    ? `${formatBytes(Math.max(0, gaugeTotalBytes - gaugeUsedBytes))} remaining`
    : 'Calculating…';

  // Available tags for the Tags category
  const availableTags = useMemo(
    () => [
      '#Architecture',
      '#Q3-Roadmap',
      '#FastCDC',
      '#SovereignCloud',
      '#Designs',
      '#AuditReports',
      '#Financial',
      '#AudioLogs',
    ],
    [],
  );

  // Compute live item counts from actual files only — no fabricated seeds.
  // Previously this hardcoded base counts (1420 images, 892 documents, etc.)
  // which showed phantom stats contradicting the actual file list.
  const categoryStats = useMemo(() => {
    let imagesCount = 0;
    let imagesSize = 0;

    let videosCount = 0;
    let videosSize = 0;

    let audiosCount = 0;
    let audiosSize = 0;

    let documentsCount = 0;
    let documentsSize = 0;

    let archiveCount = 0;
    let archiveSize = 0;

    let tagsCount = 0;
    let tagsSize = 0;

    let othersCount = 0;
    let othersSize = 0;

    // Trash uses the real trash items — no fallback to a fake "14".
    const trashCount = trashItems.length;
    const trashSize = trashItems.reduce((sum, t) => sum + (t.size || 0), 0);

    // Tally live uploaded files
    files.forEach((f) => {
      const m = (f.mimeType || '').toLowerCase();
      const n = (f.name || '').toLowerCase();

      if (m.startsWith('image/') || /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(n)) {
        imagesCount++;
        imagesSize += f.size || 0;
      } else if (m.startsWith('video/') || /\.(mp4|mov|mkv|webm|avi)$/i.test(n)) {
        videosCount++;
        videosSize += f.size || 0;
      } else if (m.startsWith('audio/') || /\.(mp3|wav|flac|m4a|aac|ogg)$/i.test(n)) {
        audiosCount++;
        audiosSize += f.size || 0;
      } else if (
        m.includes('pdf') ||
        m.includes('word') ||
        m.includes('sheet') ||
        m.includes('presentation') ||
        /\.(pdf|docx?|xlsx?|pptx?|txt|md|csv)$/i.test(n)
      ) {
        documentsCount++;
        documentsSize += f.size || 0;
      } else if (m.includes('zip') || m.includes('tar') || /\.(zip|tar|gz|7z|rar)$/i.test(n)) {
        archiveCount++;
        archiveSize += f.size || 0;
      } else {
        othersCount++;
        othersSize += f.size || 0;
      }
    });

    return {
      images: { count: imagesCount, size: imagesSize, formattedSize: formatBytes(imagesSize) },
      videos: { count: videosCount, size: videosSize, formattedSize: formatBytes(videosSize) },
      audios: { count: audiosCount, size: audiosSize, formattedSize: formatBytes(audiosSize) },
      documents: {
        count: documentsCount,
        size: documentsSize,
        formattedSize: formatBytes(documentsSize),
      },
      archive: { count: archiveCount, size: archiveSize, formattedSize: formatBytes(archiveSize) },
      tags: { count: tagsCount, size: tagsSize, formattedSize: formatBytes(tagsSize) },
      others: { count: othersCount, size: othersSize, formattedSize: formatBytes(othersSize) },
      trash: { count: trashCount, size: trashSize, formattedSize: formatBytes(trashSize) },
    };
  }, [files, trashItems]);

  // 8 Category Card Definitions
  const categoriesList = useMemo(
    () => [
      {
        id: 'images' as DriveCategory,
        label: 'Images',
        count: categoryStats.images.count,
        formattedSize: categoryStats.images.formattedSize,
        icon: ImageIcon,
        accentColor: '#38BDF8',
        containerStyle:
          'hover:border-[#38BDF8]/60 hover:bg-[#38BDF8]/5 hover:shadow-[0_0_20px_rgba(56,189,248,0.12)]',
        badgeBg: 'bg-[#38BDF8]/15 text-[#38BDF8] border-[#38BDF8]/30',
      },
      {
        id: 'videos' as DriveCategory,
        label: 'Videos',
        count: categoryStats.videos.count,
        formattedSize: categoryStats.videos.formattedSize,
        icon: VideoIcon,
        accentColor: '#EC4899',
        containerStyle:
          'hover:border-[#EC4899]/60 hover:bg-[#EC4899]/5 hover:shadow-[0_0_20px_rgba(236,72,153,0.12)]',
        badgeBg: 'bg-[#EC4899]/15 text-[#EC4899] border-[#EC4899]/30',
      },
      {
        id: 'audios' as DriveCategory,
        label: 'Audios',
        count: categoryStats.audios.count,
        formattedSize: categoryStats.audios.formattedSize,
        icon: AudioIcon,
        accentColor: '#14B8A6',
        containerStyle:
          'hover:border-[#14B8A6]/60 hover:bg-[#14B8A6]/5 hover:shadow-[0_0_20px_rgba(20,184,166,0.12)]',
        badgeBg: 'bg-[#14B8A6]/15 text-[#14B8A6] border-[#14B8A6]/30',
      },
      {
        id: 'documents' as DriveCategory,
        label: 'Documents',
        count: categoryStats.documents.count,
        formattedSize: categoryStats.documents.formattedSize,
        icon: DocumentIcon,
        accentColor: '#F59E0B',
        containerStyle:
          'hover:border-[#F59E0B]/60 hover:bg-[#F59E0B]/5 hover:shadow-[0_0_20px_rgba(245,158,11,0.12)]',
        badgeBg: 'bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30',
      },
      {
        id: 'archive' as DriveCategory,
        label: 'Archive',
        count: categoryStats.archive.count,
        formattedSize: categoryStats.archive.formattedSize,
        icon: ArchiveIcon,
        accentColor: '#8B5CF6',
        containerStyle:
          'hover:border-[#8B5CF6]/60 hover:bg-[#8B5CF6]/5 hover:shadow-[0_0_20px_rgba(139,92,246,0.12)]',
        badgeBg: 'bg-[#8B5CF6]/15 text-[#8B5CF6] border-[#8B5CF6]/30',
      },
      {
        id: 'tags' as DriveCategory,
        label: 'Tags',
        count: categoryStats.tags.count,
        formattedSize: categoryStats.tags.formattedSize,
        icon: TagIcon,
        accentColor: '#6366F1',
        containerStyle:
          'hover:border-[#6366F1]/60 hover:bg-[#6366F1]/5 hover:shadow-[0_0_20px_rgba(99,102,241,0.12)]',
        badgeBg: 'bg-[#6366F1]/15 text-[#6366F1] border-[#6366F1]/30',
      },
      {
        id: 'others' as DriveCategory,
        label: 'Others',
        count: categoryStats.others.count,
        formattedSize: categoryStats.others.formattedSize,
        icon: LayersIcon,
        accentColor: '#94A3B8',
        containerStyle:
          'hover:border-[#94A3B8]/60 hover:bg-[#94A3B8]/5 hover:shadow-[0_0_20px_rgba(148,163,184,0.12)]',
        badgeBg: 'bg-[#94A3B8]/15 text-[#94A3B8] border-[#94A3B8]/30',
      },
      {
        id: 'trash' as DriveCategory,
        label: 'Trash',
        count: categoryStats.trash.count,
        formattedSize: categoryStats.trash.formattedSize,
        icon: TrashIcon,
        accentColor: '#F43F5E',
        containerStyle:
          'hover:border-[#F43F5E]/60 hover:bg-[#F43F5E]/5 hover:shadow-[0_0_20px_rgba(244,63,94,0.12)]',
        badgeBg: 'bg-[#F43F5E]/15 text-[#F43F5E] border-[#F43F5E]/30',
      },
    ],
    [categoryStats],
  );

  // Filter items in dedicated category view
  const categoryItems = useMemo(() => {
    if (!selectedCategory) return [];

    if (selectedCategory === 'trash') {
      if (trashItems.length > 0) return trashItems;
      return [
        {
          id: 'trash-1',
          name: 'Deprecated_Keyring_v1.pem',
          type: 'file' as const,
          mimeType: 'text/plain',
          size: 4096,
          modifiedAt: '2026-09-24T12:00:00Z',
          deletedAt: '2026-10-02T10:00:00Z',
        },
        {
          id: 'trash-2',
          name: 'Old_Architecture_Draft_2025.pdf',
          type: 'file' as const,
          mimeType: 'application/pdf',
          size: 18400000,
          modifiedAt: '2025-11-15T08:00:00Z',
          deletedAt: '2026-10-01T15:30:00Z',
        },
      ];
    }

    // Filter live files matching category
    const matchingLive = files.filter((f) => {
      const m = (f.mimeType || '').toLowerCase();
      const n = (f.name || '').toLowerCase();

      if (selectedCategory === 'images') {
        return m.startsWith('image/') || /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(n);
      }
      if (selectedCategory === 'videos') {
        return m.startsWith('video/') || /\.(mp4|mov|mkv|webm|avi)$/i.test(n);
      }
      if (selectedCategory === 'audios') {
        return m.startsWith('audio/') || /\.(mp3|wav|flac|m4a|aac|ogg)$/i.test(n);
      }
      if (selectedCategory === 'documents') {
        return (
          m.includes('pdf') ||
          m.includes('word') ||
          m.includes('sheet') ||
          m.includes('presentation') ||
          /\.(pdf|docx?|xlsx?|pptx?|txt|md|csv)$/i.test(n)
        );
      }
      if (selectedCategory === 'archive') {
        return m.includes('zip') || m.includes('tar') || /\.(zip|tar|gz|7z|rar)$/i.test(n);
      }
      if (selectedCategory === 'tags') {
        if (selectedTag) {
          return f.tags?.includes(selectedTag) || n.toLowerCase().includes(selectedTag.replace('#', '').toLowerCase());
        }
        return true;
      }
      if (selectedCategory === 'others') {
        return (
          !m.startsWith('image/') &&
          !m.startsWith('video/') &&
          !m.startsWith('audio/') &&
          !m.includes('pdf') &&
          !m.includes('word') &&
          !m.includes('sheet') &&
          !m.includes('zip')
        );
      }
      return true;
    });

    if (categorySearchQuery.trim()) {
      const query = categorySearchQuery.toLowerCase();
      return matchingLive.filter((item) => item.name.toLowerCase().includes(query));
    }

    return matchingLive;
  }, [selectedCategory, files, trashItems, categorySearchQuery, selectedTag]);

  return (
    <div id="drive-panel-home" role="tabpanel" aria-labelledby="drive-tab-home" className="space-y-6">
      {/* If category is NOT selected: Render 8 Category Cards + Folders & Files */}
      {selectedCategory === null ? (
        <>
          {/* Header section with categories title */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-extrabold text-[#F8FAFC] tracking-tight">Categories</h2>
              <p className="text-xs text-[#94A3B8] mt-0.5">
                Organized storage with real-time FastCDC indexing &amp; instant search
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-[#38BDF8] bg-[#38BDF8]/10 border border-[#38BDF8]/25 px-2.5 py-1 rounded-lg">
              <span>8 Categories Active</span>
            </div>
          </div>

          {/* 8 Category Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {categoriesList.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  type="button"
                  data-testid={`category-card-${cat.id}`}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`group text-left rounded-2xl p-4 border border-[#232938] bg-[#12151E] transition-all duration-200 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${cat.containerStyle}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div
                      className="size-10 rounded-xl flex items-center justify-center shrink-0 border transition-transform duration-200 group-hover:scale-105"
                      style={{
                        backgroundColor: `${cat.accentColor}18`,
                        borderColor: `${cat.accentColor}40`,
                        color: cat.accentColor,
                      }}
                    >
                      <Icon className="size-5" />
                    </div>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${cat.badgeBg}`}
                    >
                      {cat.count.toLocaleString()}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-[#F8FAFC] group-hover:text-white transition-colors">
                    {cat.label}
                  </h3>
                  <div className="flex items-center justify-between text-xs text-[#94A3B8] mt-1">
                    <span className="font-mono text-[11px]">{cat.formattedSize}</span>
                    <span className="text-[11px] text-[#64748B] group-hover:text-[#38BDF8] font-medium transition-colors">
                      Open &rarr;
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Folders Section (if folders exist) */}
          {folders.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
                  Folders ({folders.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    className="group relative flex items-center gap-1 p-2 rounded-xl border border-[#232938] bg-[#12151E] hover:border-[#FF8C42]/50 hover:bg-[#FF8C42]/5 transition-all"
                  >
                    {/*
                     * A real <button>: keyboard-focusable, announced as a
                     * button (not a plain text node), Enter/Space opens it.
                     * The previous plain <div onClick> was invisible to
                     * keyboard users and some automation hit-testing.
                     */}
                    <button
                      type="button"
                      onClick={() => onNavigateToFolder?.(folder.id, folder.name)}
                      aria-label={`Open folder ${folder.name}`}
                      title={`Open ${folder.name}`}
                      className="flex flex-1 items-center gap-3 min-w-0 p-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                    >
                      <div className="size-8 rounded-lg bg-[#FF8C42]/15 border border-[#FF8C42]/30 flex items-center justify-center text-[#FF8C42] shrink-0">
                        <FolderIcon className="size-4" />
                      </div>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-[#F8FAFC] truncate group-hover:text-[#FF8C42] transition-colors">
                          {folder.name}
                        </span>
                        <span className="block text-[10px] text-[#64748B]">Folder</span>
                      </span>
                    </button>
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 transition-opacity">
                      {onOpenRename && (
                        <button
                          type="button"
                          aria-label={`Rename folder ${folder.name}`}
                          title="Rename"
                          onClick={(e) => onOpenRename(folder, e)}
                          className="size-7 rounded grid place-items-center text-[#64748B] hover:text-[#F8FAFC] hover:bg-[#21262D] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                        >
                          <PencilIcon className="size-3.5" />
                        </button>
                      )}
                      {onDeleteItem && (
                        <button
                          type="button"
                          aria-label={`Delete folder ${folder.name}`}
                          title="Delete"
                          onClick={(e) => onDeleteItem(folder.id, folder.name, e)}
                          className="size-7 rounded grid place-items-center text-[#64748B] hover:text-rose-300 hover:bg-rose-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                        >
                          <TrashIcon className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Files Quick Strip */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
                Recent Items ({files.length})
              </h3>
            </div>

            {files.length === 0 ? (
              <div className="text-center py-10 rounded-2xl border border-dashed border-[#232938] bg-[#0E1017]">
                <FolderIcon className="size-10 text-[#64748B] mx-auto mb-2" />
                <p className="text-xs font-semibold text-[#F8FAFC]">No files uploaded yet</p>
                <p className="text-[11px] text-[#64748B] mt-0.5">
                  Drag and drop files anywhere or use the upload button
                </p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {files.slice(0, 8).map((file) => (
                  <div
                    key={file.id}
                    onClick={() => onPreviewItem?.(file)}
                    className="group rounded-xl p-3 border border-[#232938] bg-[#12151E] hover:border-[#38BDF8]/50 hover:bg-[#38BDF8]/5 cursor-pointer transition-all flex flex-col justify-between"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="size-8 rounded-lg bg-[#38BDF8]/10 border border-[#38BDF8]/25 flex items-center justify-center text-[#38BDF8] shrink-0">
                        <DocumentIcon className="size-4" />
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleStar?.(file, e);
                        }}
                        className="text-[#64748B] hover:text-amber-400 transition-colors"
                        aria-label="Toggle star"
                      >
                        {file.isStarred ? (
                          <StarFilledIcon className="size-3.5 text-amber-400" />
                        ) : (
                          <StarIcon className="size-3.5" />
                        )}
                      </button>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#F8FAFC] truncate group-hover:text-[#38BDF8] transition-colors">
                        {file.name}
                      </p>
                      <p className="text-[11px] text-[#64748B] mt-0.5 font-mono">
                        {formatBytes(file.size)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-[#232938] bg-[#12151E] overflow-hidden divide-y divide-[#232938]">
                {files.slice(0, 10).map((file) => (
                  <div
                    key={file.id}
                    onClick={() => onPreviewItem?.(file)}
                    className="flex items-center justify-between p-3 hover:bg-[#38BDF8]/5 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="size-7 rounded-lg bg-[#38BDF8]/10 border border-[#38BDF8]/25 flex items-center justify-center text-[#38BDF8] shrink-0">
                        <DocumentIcon className="size-3.5" />
                      </div>
                      <span className="text-xs font-semibold text-[#F8FAFC] truncate">
                        {file.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-xs text-[#94A3B8]">
                      <span className="font-mono text-[11px]">{formatBytes(file.size)}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDownloadFile?.(file.id, file.name);
                        }}
                        className="p-1 rounded text-[#64748B] hover:text-[#38BDF8]"
                      >
                        <DownloadIcon className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SINGLE Enterprise Storage Gauge at the Bottom of Home View */}
          <SingleEnterpriseStorageGauge
            usedFormatted={gaugeUsedFormatted}
            totalFormatted={gaugeTotalFormatted}
            planName="Sovereign Enterprise Plan"
            remainingFormatted={gaugeRemainingFormatted}
            usedBytes={gaugeUsedBytes}
            totalBytes={gaugeTotalBytes}
            onUpgradeClick={onUpgradeClick}
          />
        </>
      ) : (
        /* DEDICATED CATEGORY VIEW */
        <div data-testid={`dedicated-category-view-${selectedCategory}`} className="space-y-5">
          {/* Top back bar and category title */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#232938]">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory(null);
                  setSelectedTag(null);
                  setCategorySearchQuery('');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#232938] bg-[#12151E] text-xs font-semibold text-[#94A3B8] hover:text-white hover:border-[#38BDF8]/50 hover:bg-[#38BDF8]/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]"
              >
                <ArrowLeftIcon className="size-3.5" />
                <span>All Categories</span>
              </button>

              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-[#F8FAFC] capitalize tracking-tight">
                  {selectedCategory}
                </h2>
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/30">
                  {categoryStats[selectedCategory]?.count.toLocaleString()} items
                </span>
                <span className="text-xs text-[#64748B] font-mono">
                  {categoryStats[selectedCategory]?.formattedSize}
                </span>
              </div>
            </div>

            {/* In-category search input */}
            <div className="relative w-full sm:w-64">
              <SearchIcon className="size-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={categorySearchQuery}
                onChange={(e) => setCategorySearchQuery(e.target.value)}
                placeholder={`Search ${selectedCategory}...`}
                className="w-full h-8 pl-8 pr-3 rounded-lg border border-[#232938] bg-[#0E1017] text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#38BDF8] transition-colors"
              />
            </div>
          </div>

          {/* Tags pill row when category is 'tags' */}
          {selectedCategory === 'tags' && (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              <button
                type="button"
                onClick={() => setSelectedTag(null)}
                className={`px-3 py-1 rounded-full text-xs font-mono font-medium transition-all ${
                  selectedTag === null
                    ? 'bg-[#6366F1] text-white shadow-[0_0_12px_rgba(99,102,241,0.3)]'
                    : 'bg-[#12151E] text-[#94A3B8] border border-[#232938] hover:text-white'
                }`}
              >
                #All Tags
              </button>
              {availableTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSelectedTag(selectedTag === t ? null : t)}
                  className={`px-3 py-1 rounded-full text-xs font-mono font-medium transition-all shrink-0 ${
                    selectedTag === t
                      ? 'bg-[#6366F1] text-white shadow-[0_0_12px_rgba(99,102,241,0.3)]'
                      : 'bg-[#12151E] text-[#94A3B8] border border-[#232938] hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {/* Items display */}
          {selectedCategory === 'trash' ? (
            /* Trash Items List */
            <div className="space-y-2">
              {categoryItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-[#232938] bg-[#12151E] hover:border-rose-500/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="size-8 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                      <TrashIcon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-[#F8FAFC] truncate">{item.name}</p>
                      <p className="text-[11px] text-[#64748B] font-mono">
                        {formatBytes(item.size)} · Deleted recently
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => onRestoreTrashItem?.(item.id, item.name, e)}
                      className="px-2.5 py-1 rounded-lg bg-[#38BDF8]/15 border border-[#38BDF8]/30 text-xs font-semibold text-[#38BDF8] hover:bg-[#38BDF8]/25 transition-colors"
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={(e) => onPurgeTrashItem?.(item.id, item.name, e)}
                      className="px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-xs font-semibold text-rose-400 hover:bg-rose-500/25 transition-colors"
                    >
                      Purge
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : categoryItems.length === 0 ? (
            /* Empty category state */
            <div className="text-center py-16 rounded-2xl border border-dashed border-[#232938] bg-[#0E1017]">
              <DocumentIcon className="size-10 text-[#64748B] mx-auto mb-2" />
              <p className="text-sm font-semibold text-[#F8FAFC]">
                No {selectedCategory} found
              </p>
              <p className="text-xs text-[#64748B] mt-0.5">
                Upload items or adjust search filter to display results
              </p>
            </div>
          ) : (
            /* Category files grid */
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {categoryItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onPreviewItem?.(item)}
                  className="group rounded-xl p-3.5 border border-[#232938] bg-[#12151E] hover:border-[#38BDF8]/50 hover:bg-[#38BDF8]/5 cursor-pointer transition-all flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="size-9 rounded-lg bg-[#38BDF8]/10 border border-[#38BDF8]/25 flex items-center justify-center text-[#38BDF8] shrink-0">
                      {selectedCategory === 'images' ? (
                        <ImageIcon className="size-4" />
                      ) : selectedCategory === 'videos' ? (
                        <VideoIcon className="size-4" />
                      ) : selectedCategory === 'audios' ? (
                        <AudioIcon className="size-4" />
                      ) : selectedCategory === 'archive' ? (
                        <ArchiveIcon className="size-4" />
                      ) : (
                        <DocumentIcon className="size-4" />
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDownloadFile?.(item.id, item.name);
                        }}
                        className="p-1 rounded text-[#64748B] hover:text-[#38BDF8] transition-colors"
                        aria-label="Download"
                      >
                        <DownloadIcon className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#F8FAFC] truncate group-hover:text-[#38BDF8] transition-colors">
                      {item.name}
                    </p>
                    <p className="text-[11px] text-[#64748B] mt-0.5 font-mono">
                      {formatBytes(item.size)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Gauge at bottom of category view as well */}
          <SingleEnterpriseStorageGauge
            usedFormatted={gaugeUsedFormatted}
            totalFormatted={gaugeTotalFormatted}
            planName="Sovereign Enterprise Plan"
            remainingFormatted={gaugeRemainingFormatted}
            usedBytes={gaugeUsedBytes}
            totalBytes={gaugeTotalBytes}
            onUpgradeClick={onUpgradeClick}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 3. FEED SUB-VIEW (Google Photos / Visual Chronological Media Feed)
// ============================================================================

export interface DriveFeedItem {
  id: string;
  name: string;
  type: 'image' | 'video' | 'audio';
  mimeType: string;
  size: number;
  dateGroup: 'today' | 'yesterday' | 'last_week' | 'september_2026';
  dateLabel: string;
  dimensions?: string;
  duration?: string;
  previewGradient: string;
  isStarred?: boolean;
}

export interface DriveFeedSubViewProps {
  onPreviewItem?: (item: DriveFeedItem) => void;
  onDownloadFile?: (id: string, name: string) => void;
  onShareItem?: (item: DriveFeedItem) => void;
  className?: string;
  /** Real media files from the Drive. When provided, the feed renders these
   * instead of placeholder content. */
  files?: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
    modifiedAt: string;
    isStarred?: boolean;
  }>;
}

export function DriveFeedSubView({
  onPreviewItem,
  onDownloadFile,
  onShareItem,
  className = '',
  files: realFiles,
}: DriveFeedSubViewProps) {
  const [selectedFeedIds, setSelectedFeedIds] = useState<Set<string>>(new Set());
  const [mediaFilter, setMediaFilter] = useState<'all' | 'image' | 'video' | 'audio'>('all');
  const [lightboxItem, setLightboxItem] = useState<DriveFeedItem | null>(null);

  // Feed items: real media files when available, otherwise empty.
  // Previously this rendered hardcoded sample files (feed-1, feed-2, …) with
  // fake names/sizes that didn't exist in the database, so downloads 404'd.
  const feedItems: DriveFeedItem[] = useMemo(() => {
    if (realFiles && realFiles.length > 0) {
      return realFiles
        .filter((f) => {
          const m = (f.mimeType || '').toLowerCase();
          return m.startsWith('image/') || m.startsWith('video/') || m.startsWith('audio/');
        })
        .map((f) => {
          const m = (f.mimeType || '').toLowerCase();
          const type: DriveFeedItem['type'] = m.startsWith('image/')
            ? 'image'
            : m.startsWith('video/')
              ? 'video'
              : 'audio';
          const d = new Date(f.modifiedAt);
          const today = new Date();
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          const isToday = d.toDateString() === today.toDateString();
          const isYesterday = d.toDateString() === yesterday.toDateString();
          const dateGroup: DriveFeedItem['dateGroup'] = isToday
            ? 'today'
            : isYesterday
              ? 'yesterday'
              : 'last_week';
          return {
            id: f.id,
            name: f.name,
            type,
            mimeType: f.mimeType,
            size: f.size,
            dateGroup,
            dateLabel: d.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            }),
            isStarred: f.isStarred,
          } as DriveFeedItem;
        });
    }
    return [];
  }, [realFiles]);

  const filteredFeed = useMemo(() => {
    if (mediaFilter === 'all') return feedItems;
    return feedItems.filter((i) => i.type === mediaFilter);
  }, [feedItems, mediaFilter]);

  // Group by dateGroup
  const groups: { key: DriveFeedItem['dateGroup']; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'last_week', label: 'Last Week' },
    { key: 'september_2026', label: 'September 2026' },
  ];

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFeedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatchDownload = async () => {
    // Download sequentially with a small gap: firing many downloads at once
    // gets blocked by browsers, which made "Download Batch" appear to do nothing.
    const ids = Array.from(selectedFeedIds);
    for (let i = 0; i < ids.length; i++) {
      const item = feedItems.find((f) => f.id === ids[i]);
      if (item) {
        try {
          await onDownloadFile?.(item.id, item.name);
        } catch {
          // Individual download failures shouldn't stop the batch.
        }
        if (i < ids.length - 1) {
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    }
  };

  return (
    <div
      id="drive-panel-feed"
      role="tabpanel"
      aria-labelledby="drive-tab-feed"
      className={`space-y-6 ${className}`}
    >
      {/* Top Media Bar & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#232938]">
        <div>
          <h2 className="text-base font-extrabold text-[#F8FAFC] tracking-tight">Visual Media Feed</h2>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Chronological high-fidelity timeline of photos, 4K videos, and lossless audio
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {(
            [
              { key: 'all', label: 'All Media' },
              { key: 'image', label: 'Images' },
              { key: 'video', label: 'Videos' },
              { key: 'audio', label: 'Audios' },
            ] as const
          ).map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setMediaFilter(filter.key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                mediaFilter === filter.key
                  ? 'bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/40 shadow-[0_0_12px_rgba(56,189,248,0.15)]'
                  : 'bg-[#12151E] text-[#94A3B8] border border-[#232938] hover:text-white'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Batch Selection Bar (if items selected) */}
      {selectedFeedIds.size > 0 && (
        <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-[#38BDF8]/15 border border-[#38BDF8]/40 text-xs">
          <span className="font-semibold text-white">
            {selectedFeedIds.size} item{selectedFeedIds.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBatchDownload}
              className="px-3 py-1.5 rounded-lg bg-[#12151E] text-white border border-[#232938] hover:bg-[#1E293B] font-semibold flex items-center gap-1.5"
            >
              <DownloadIcon className="size-3.5 text-[#38BDF8]" />
              <span>Download Batch</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedFeedIds(new Set())}
              className="px-2.5 py-1.5 rounded-lg text-[#94A3B8] hover:text-white"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Chronological Date Groups */}
      <div className="space-y-8">
        {groups.map((group) => {
          const itemsInGroup = filteredFeed.filter((i) => i.dateGroup === group.key);
          if (itemsInGroup.length === 0) return null;

          return (
            <section key={group.key} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-[#38BDF8]" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#F8FAFC]">
                  {group.label}
                </h3>
                <span className="text-[11px] font-mono text-[#64748B]">
                  ({itemsInGroup.length})
                </span>
              </div>

              {/* Visual Feed Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {itemsInGroup.map((item) => {
                  const isSelected = selectedFeedIds.has(item.id);

                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        setLightboxItem(item);
                        onPreviewItem?.(item);
                      }}
                      className={`group relative rounded-2xl border overflow-hidden cursor-pointer transition-all duration-200 aspect-[4/3] flex flex-col justify-between p-3 select-none ${
                        isSelected
                          ? 'border-[#38BDF8] ring-2 ring-[#38BDF8]/40 shadow-[0_0_20px_rgba(56,189,248,0.2)]'
                          : 'border-[#232938] hover:border-[#38BDF8]/60 bg-[#12151E]'
                      }`}
                    >
                      {/* Gradient / Image visual simulation */}
                      <div
                        className={`absolute inset-0 bg-gradient-to-br ${item.previewGradient} opacity-70 group-hover:opacity-90 transition-opacity`}
                      />

                      {/* Top Action Strip */}
                      <div className="relative z-10 flex items-center justify-between">
                        {/* Selection Checkbox */}
                        <button
                          type="button"
                          onClick={(e) => toggleSelect(item.id, e)}
                          className={`size-6 rounded-lg flex items-center justify-center border transition-all ${
                            isSelected
                              ? 'bg-[#38BDF8] border-[#38BDF8] text-black'
                              : 'bg-black/40 border-white/20 text-transparent group-hover:border-white/50'
                          }`}
                          aria-label="Select item"
                        >
                          <svg
                            className="size-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </button>

                        {/* Format / Duration Badge */}
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-black/60 backdrop-blur-md text-white border border-white/10 uppercase">
                          {item.type === 'video'
                            ? item.duration || '4K'
                            : item.type === 'audio'
                            ? item.duration || 'FLAC'
                            : item.dimensions || 'RAW'}
                        </span>
                      </div>

                      {/* Center Type Indicator */}
                      <div className="relative z-10 self-center opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all">
                        {item.type === 'video' ? (
                          <div className="size-10 rounded-full bg-black/50 border border-white/20 backdrop-blur-md flex items-center justify-center text-white">
                            <svg className="size-5 fill-current ml-0.5" viewBox="0 0 24 24">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                          </div>
                        ) : item.type === 'audio' ? (
                          <div className="size-10 rounded-full bg-black/50 border border-white/20 backdrop-blur-md flex items-center justify-center text-white">
                            <AudioIcon className="size-5" />
                          </div>
                        ) : null}
                      </div>

                      {/* Bottom Info bar */}
                      <div className="relative z-10 bg-black/70 backdrop-blur-md rounded-xl p-2 border border-white/10">
                        <p className="text-xs font-semibold text-white truncate">{item.name}</p>
                        <div className="flex items-center justify-between text-[10px] text-[#94A3B8] mt-0.5 font-mono">
                          <span>{formatBytes(item.size)}</span>
                          <span className="text-[#38BDF8]">View Lightbox</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Fast Lightbox Launcher Modal */}
      {lightboxItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-lg p-4 sm:p-8"
        >
          <div className="relative w-full max-w-4xl rounded-2xl border border-[#232938] bg-[#0E1017] p-5 shadow-2xl flex flex-col max-h-[90vh]">
            {/* Lightbox Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#232938]">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-white truncate">{lightboxItem.name}</h3>
                <p className="text-xs text-[#94A3B8] font-mono mt-0.5">
                  {lightboxItem.dateLabel} · {formatBytes(lightboxItem.size)}
                  {lightboxItem.dimensions ? ` · ${lightboxItem.dimensions}` : ''}
                  {lightboxItem.duration ? ` · Duration: ${lightboxItem.duration}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onDownloadFile?.(lightboxItem.id, lightboxItem.name)}
                  className="p-2 rounded-xl border border-[#232938] bg-[#12151E] text-[#94A3B8] hover:text-white hover:border-[#38BDF8]"
                  title="Download File"
                >
                  <DownloadIcon className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onShareItem?.(lightboxItem)}
                  className="p-2 rounded-xl border border-[#232938] bg-[#12151E] text-[#94A3B8] hover:text-white hover:border-[#38BDF8]"
                  title="Share File"
                >
                  <ShareIcon className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxItem(null)}
                  className="p-2 rounded-xl border border-[#232938] bg-[#12151E] text-[#94A3B8] hover:text-white hover:border-rose-500"
                  title="Close Lightbox"
                >
                  <CloseIcon className="size-4" />
                </button>
              </div>
            </div>

            {/* Lightbox Preview Stage */}
            <div className="flex-1 my-4 min-h-[300px] rounded-xl overflow-hidden border border-[#232938] bg-black flex items-center justify-center relative">
              <div
                className={`absolute inset-0 bg-gradient-to-br ${lightboxItem.previewGradient} opacity-60`}
              />
              <div className="relative z-10 text-center p-6 space-y-3">
                {lightboxItem.type === 'video' ? (
                  <VideoIcon className="size-16 text-white/80 mx-auto" />
                ) : lightboxItem.type === 'audio' ? (
                  <AudioIcon className="size-16 text-white/80 mx-auto" />
                ) : (
                  <ImageIcon className="size-16 text-white/80 mx-auto" />
                )}
                <div className="text-sm font-mono text-[#38BDF8] bg-black/60 px-3 py-1 rounded-full border border-[#38BDF8]/30 inline-block">
                  Fast Lightbox Full-Resolution View
                </div>
              </div>
            </div>

            {/* Lightbox Footer */}
            <div className="flex items-center justify-between text-xs text-[#94A3B8] pt-2 border-t border-[#232938]">
              <span>FastCDC Content Addressable Media · Zero-Knowledge Sovereign Storage</span>
              <button
                type="button"
                onClick={() => setLightboxItem(null)}
                className="px-3 py-1 rounded-lg bg-[#38BDF8]/15 text-[#38BDF8] font-semibold border border-[#38BDF8]/40 hover:bg-[#38BDF8]/25"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 4. AI MEMORY VAULT SUB-VIEW (Cross-App Relational Memory Index)
// ============================================================================

export type EcosystemApp =
  | 'all'
  | 'QuantMail'
  | 'QuantCalendar'
  | 'QuantDrive'
  | 'QuantContacts'
  | 'QuantGit'
  | 'Shared';

export interface AiMemoryItem {
  id: string;
  app: Exclude<EcosystemApp, 'all'>;
  title: string;
  timestamp: string;
  rawContext: string;
  extractedFacts: string[];
  entityGraphLinks: string[];
  confidenceScore?: number;
  sensitivity?: string;
  explicitness?: string;
  policyVersion?: string;
  provenance?: string;
  sourceObjectId?: string;
}

export interface DriveAiMemorySubViewProps {
  className?: string;
  onRecallInChat?: (memory: AiMemoryItem) => void;
  onForgetMemory?: (memory: AiMemoryItem) => void;
  /** Canonical memory projections supplied by the memory API. No demo records are generated here. */
  memories?: AiMemoryItem[];
}

export function DriveAiMemorySubView({
  className = '',
  onRecallInChat,
  onForgetMemory,
  memories = [],
}: DriveAiMemorySubViewProps) {
  const [selectedApp, setSelectedApp] = useState<EcosystemApp>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // App definitions. The memory surface follows the five QuantMail workspace pillars.
  const appConfigs = useMemo(
    () => ({
      QuantMail: {
        name: 'QuantMail',
        color: '#FF8C42',
        icon: MailAppIcon,
        borderStyle: 'border-[#FF8C42]/40 bg-[#FF8C42]/10 text-[#FF8C42]',
      },
      QuantCalendar: {
        name: 'QuantCalendar',
        color: '#38BDF8',
        icon: DocumentIcon,
        borderStyle: 'border-[#38BDF8]/40 bg-[#38BDF8]/10 text-[#38BDF8]',
      },
      QuantDrive: {
        name: 'QuantDrive',
        color: '#10B981',
        icon: HardDriveIcon,
        borderStyle: 'border-[#10B981]/40 bg-[#10B981]/10 text-[#10B981]',
      },
      QuantContacts: {
        name: 'QuantContacts',
        color: '#EC4899',
        icon: LayersIcon,
        borderStyle: 'border-[#EC4899]/40 bg-[#EC4899]/10 text-[#EC4899]',
      },
      QuantGit: {
        name: 'QuantGit',
        color: '#A78BFA',
        icon: FolderIcon,
        borderStyle: 'border-[#A78BFA]/40 bg-[#A78BFA]/10 text-[#A78BFA]',
      },
      Shared: {
        name: 'Shared context',
        color: '#94A3B8',
        icon: LayersIcon,
        borderStyle: 'border-[#94A3B8]/40 bg-[#94A3B8]/10 text-[#CBD5E1]',
      },
    }),
    [],
  );

  // Memory is a projection of canonical source data. This component never invents
  // memories, confidence scores, people, projects, or conversation facts.
  const memoryItems = memories;

  // Filter items by app and semantic search query
  const filteredMemories = useMemo(() => {
    return memoryItems.filter((item) => {
      const matchesApp = selectedApp === 'all' || item.app === selectedApp;
      if (!matchesApp) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.rawContext.toLowerCase().includes(q) ||
        item.extractedFacts.some((f) => f.toLowerCase().includes(q)) ||
        item.entityGraphLinks.some((l) => l.toLowerCase().includes(q))
      );
    });
  }, [memoryItems, selectedApp, searchQuery]);

  return (
    <div
      id="drive-panel-aimemory"
      role="tabpanel"
      aria-labelledby="drive-tab-aimemory"
      className={`space-y-6 ${className}`}
    >
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#232938]">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-[#38BDF8]/15 border border-[#38BDF8]/30 flex items-center justify-center text-[#38BDF8] shrink-0">
            <BrainIcon className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-[#F8FAFC] tracking-tight">
                AI Memory Vault
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/30">
                L3 Cross-App Relational
              </span>
            </div>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Governed cross-app context with provenance, confidence, privacy scope, and user controls
            </p>
          </div>
        </div>

        {/* Live sync metric */}
        <div className="flex items-center gap-2 text-xs font-mono text-[#10B981] bg-[#10B981]/10 border border-[#10B981]/30 px-3 py-1 rounded-xl">
          <span className="size-2 rounded-full bg-[#10B981] animate-pulse" />
          <span>{memories.length > 0 ? 'Memory sync available' : 'Waiting for memory data'}</span>
        </div>
      </div>

      {/* Semantic Search Input Bar */}
      <div className="relative">
        <SearchIcon className="size-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search memories, facts, conversation context..."
          className="w-full h-11 pl-10 pr-4 rounded-xl border border-[#232938] bg-[#12151E] text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#38BDF8] focus:ring-1 focus:ring-[#38BDF8] transition-all shadow-[0_2px_12px_rgba(0,0,0,0.25)]"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-white"
          >
            <CloseIcon className="size-3.5" />
          </button>
        )}
      </div>

      {/* App Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
        <button
          type="button"
          onClick={() => setSelectedApp('all')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all shrink-0 ${
            selectedApp === 'all'
              ? 'bg-[#38BDF8] text-black shadow-[0_0_14px_rgba(56,189,248,0.25)]'
              : 'bg-[#12151E] text-[#94A3B8] border border-[#232938] hover:text-white'
          }`}
        >
          All Sources
        </button>

        {(
          ['QuantMail', 'QuantCalendar', 'QuantDrive', 'QuantContacts', 'QuantGit'] as const
        ).map((appName) => {
          const cfg = appConfigs[appName];
          const Icon = cfg.icon;
          const isActive = selectedApp === appName;

          return (
            <button
              key={appName}
              type="button"
              onClick={() => setSelectedApp(appName)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all shrink-0 ${
                isActive
                  ? 'bg-white text-black shadow-[0_0_14px_rgba(255,255,255,0.25)]'
                  : 'bg-[#12151E] text-[#94A3B8] border border-[#232938] hover:text-white'
              }`}
            >
              <Icon className="size-3.5" />
              <span>{appName}</span>
            </button>
          );
        })}
      </div>

      {/* Memory Cards Feed */}
      <div className="space-y-4">
        {filteredMemories.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-dashed border-[#232938] bg-[#0E1017]">
            <BrainIcon className="size-10 text-[#64748B] mx-auto mb-2" />
            <p className="text-sm font-semibold text-[#F8FAFC]">No memories found</p>
            <p className="text-xs text-[#64748B] mt-0.5">
              {memories.length === 0
                ? 'Memory records will appear here after an authorized source produces a governed memory projection.'
                : 'Try adjusting your search terms or filter selection.'}
            </p>
          </div>
        ) : (
          filteredMemories.map((mem) => {
            const cfg = appConfigs[mem.app];
            const AppIcon = cfg.icon;

            return (
              <div
                key={mem.id}
                className="rounded-2xl border border-[#232938] bg-[#12151E] p-4 sm:p-5 hover:border-[#38BDF8]/40 transition-all space-y-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
              >
                {/* Card Top: Source App Badge & Timestamp */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold border ${cfg.borderStyle}`}
                    >
                      <AppIcon className="size-3.5" />
                      <span>{mem.app}</span>
                    </span>
                    <span className="text-xs text-[#64748B] font-mono">{mem.timestamp}</span>
                  </div>

                  <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-[#38BDF8]/10 text-[#38BDF8] border border-[#38BDF8]/20">
                    {mem.confidenceScore == null
                      ? 'Confidence not scored'
                      : `${mem.confidenceScore}% Confidence`}
                  </span>
                </div>

                {/* Title & Context */}
                <div>
                  <h3 className="text-sm font-bold text-[#F8FAFC]">{mem.title}</h3>
                  <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed border-l-2 border-[#232938] pl-3 py-0.5 italic">
                    &ldquo;{mem.rawContext}&rdquo;
                  </p>
                </div>

                {/* Facts are shown only when the governed projection actually contains them. */}
                {mem.extractedFacts.length > 0 && (
                  <div className="space-y-1.5 bg-[#090A0E] p-3 rounded-xl border border-[#232938]/80">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#64748B]">
                      Extracted Key Facts
                    </span>
                    <ul className="space-y-1 text-xs text-[#E2E8F0]">
                      {mem.extractedFacts.map((fact, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-[#38BDF8] mt-1 text-[var(--q-type-xs)]">&bull;</span>
                          <span className="flex-1">{fact}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Graph links are shown only when the governed projection provides them. */}
                {mem.entityGraphLinks.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <NodeLinkIcon className="size-3.5 text-[#64748B]" />
                    {mem.entityGraphLinks.map((link, idx) => (
                      <span
                        key={idx}
                        className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-[#1E293B]/70 text-[#94A3B8] border border-[#334155]"
                      >
                        {link}
                      </span>
                    ))}
                  </div>
                )}

                {(mem.sensitivity || mem.explicitness || mem.policyVersion || mem.provenance) && (
                  <div className="flex flex-wrap gap-2 text-[10px] font-mono text-[#94A3B8]">
                    {mem.sensitivity && <span className="px-2 py-1 rounded-md border border-[#334155]">Sensitivity: {mem.sensitivity}</span>}
                    {mem.explicitness && <span className="px-2 py-1 rounded-md border border-[#334155]">Explicitness: {mem.explicitness}</span>}
                    {mem.policyVersion && <span className="px-2 py-1 rounded-md border border-[#334155]">Policy: {mem.policyVersion}</span>}
                    {mem.provenance && <span className="px-2 py-1 rounded-md border border-[#334155]">Source: {mem.provenance}</span>}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#232938]/60">
                  {onForgetMemory && (
                    <button
                      type="button"
                      onClick={() => onForgetMemory(mem)}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-lg border border-[#7F1D1D] text-xs font-semibold text-[#FCA5A5] hover:bg-[#7F1D1D]/20 transition-colors"
                    >
                      Forget
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRecallInChat?.(mem)}
                    disabled={!onRecallInChat}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-[#38BDF8]/15 border border-[#38BDF8]/35 text-xs font-semibold text-[#38BDF8] hover:bg-[#38BDF8]/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>Recall Context</span>
                    <svg
                      className="size-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
