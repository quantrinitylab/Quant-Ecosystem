'use client';

// ============================================================================
// QuantAI — Central File Library Modal ('Upload once, use anytime')
// Task W39-A05
//
// Cross-chat file library allowing users to access, filter, search,
// and attach files uploaded across past chats and workflows into the
// current chat without re-uploading.
// ============================================================================

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { formatBytes } from '../../backend/services/file-library.service';

export type FileCategoryFilter = 'ALL' | 'DOCUMENTS' | 'CODE' | 'MEDIA' | 'DATA';

export interface LibraryFileItem {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  category: 'DOCUMENTS' | 'CODE' | 'MEDIA' | 'DATA';
  storageKey?: string;
  sourceChatId?: string;
  attachedChatIds?: string[];
  createdAt: string;
  lastUsedAt: string;
  usageCount: number;
  tags?: string[];
}

export interface CentralFileLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentChatId?: string;
  onAttachToChat?: (file: LibraryFileItem) => void | Promise<void>;
  initialCategory?: FileCategoryFilter;
  initialFiles?: LibraryFileItem[];
  storageQuotaBytes?: number; // Defaults to 50 MB
  apiEndpoint?: string;
}

// Default demonstration library files for instant presentation when initialFiles not provided
export const DEFAULT_LIBRARY_FILES: LibraryFileItem[] = [
  {
    id: 'file-doc-01',
    name: 'QuantAI-Architecture-v3.pdf',
    sizeBytes: 4_850_000,
    mimeType: 'application/pdf',
    category: 'DOCUMENTS',
    sourceChatId: 'chat-alpha-01',
    attachedChatIds: ['chat-alpha-01', 'chat-beta-02'],
    createdAt: '2026-09-20T10:15:00.000Z',
    lastUsedAt: '2026-09-24T18:30:00.000Z',
    usageCount: 4,
    tags: ['specs', 'architecture'],
  },
  {
    id: 'file-doc-02',
    name: 'Executive-Summary-Q3.docx',
    sizeBytes: 1_240_000,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    category: 'DOCUMENTS',
    sourceChatId: 'chat-leadership',
    attachedChatIds: ['chat-leadership'],
    createdAt: '2026-09-21T14:20:00.000Z',
    lastUsedAt: '2026-09-22T09:12:00.000Z',
    usageCount: 2,
    tags: ['quarterly', 'strategy'],
  },
  {
    id: 'file-code-01',
    name: 'market-depth-orderbook.ts',
    sizeBytes: 145_000,
    mimeType: 'text/typescript',
    category: 'CODE',
    sourceChatId: 'chat-dev-quant',
    attachedChatIds: ['chat-dev-quant', 'chat-bot-test', 'chat-parity-w39'],
    createdAt: '2026-09-22T08:00:00.000Z',
    lastUsedAt: '2026-09-24T22:45:00.000Z',
    usageCount: 6,
    tags: ['typescript', 'trading'],
  },
  {
    id: 'file-code-02',
    name: 'schema-migrations-v2.sql',
    sizeBytes: 82_000,
    mimeType: 'text/x-sql',
    category: 'CODE',
    sourceChatId: 'chat-db-migration',
    attachedChatIds: ['chat-db-migration'],
    createdAt: '2026-09-18T16:40:00.000Z',
    lastUsedAt: '2026-09-19T11:20:00.000Z',
    usageCount: 1,
    tags: ['postgres', 'migrations'],
  },
  {
    id: 'file-media-01',
    name: 'quant-studio-hero-mockup.png',
    sizeBytes: 3_420_000,
    mimeType: 'image/png',
    category: 'MEDIA',
    sourceChatId: 'chat-design-sprint',
    attachedChatIds: ['chat-design-sprint', 'chat-landing-review'],
    createdAt: '2026-09-23T11:00:00.000Z',
    lastUsedAt: '2026-09-24T20:15:00.000Z',
    usageCount: 3,
    tags: ['ui', 'mockup'],
  },
  {
    id: 'file-media-02',
    name: 'agent-avatar-astra.webp',
    sizeBytes: 680_000,
    mimeType: 'image/webp',
    category: 'MEDIA',
    sourceChatId: 'chat-astra-avatar',
    attachedChatIds: ['chat-astra-avatar'],
    createdAt: '2026-09-19T12:00:00.000Z',
    lastUsedAt: '2026-09-20T15:45:00.000Z',
    usageCount: 1,
    tags: ['avatar', 'agent'],
  },
  {
    id: 'file-data-01',
    name: 'nasdaq-ticks-2026-09.csv',
    sizeBytes: 1_850_000,
    mimeType: 'text/csv',
    category: 'DATA',
    sourceChatId: 'chat-algo-backtest',
    attachedChatIds: ['chat-algo-backtest', 'chat-model-eval'],
    createdAt: '2026-09-21T09:30:00.000Z',
    lastUsedAt: '2026-09-24T19:00:00.000Z',
    usageCount: 5,
    tags: ['dataset', 'stocks'],
  },
  {
    id: 'file-data-02',
    name: 'customer-retention-cohorts.xlsx',
    sizeBytes: 135_000,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    category: 'DATA',
    sourceChatId: 'chat-analytics-bi',
    attachedChatIds: ['chat-analytics-bi'],
    createdAt: '2026-09-22T17:10:00.000Z',
    lastUsedAt: '2026-09-23T10:00:00.000Z',
    usageCount: 2,
    tags: ['cohorts', 'metrics'],
  },
];

const CATEGORY_TABS: Array<{ id: FileCategoryFilter; label: string; icon: string }> = [
  { id: 'ALL', label: 'All', icon: '📁' },
  { id: 'DOCUMENTS', label: 'Documents', icon: '📄' },
  { id: 'CODE', label: 'Code', icon: '💻' },
  { id: 'MEDIA', label: 'Images & Media', icon: '🖼️' },
  { id: 'DATA', label: 'Data/CSVs', icon: '📊' },
];

export function CentralFileLibraryModal({
  isOpen,
  onClose,
  currentChatId = 'current-active-chat',
  onAttachToChat,
  initialCategory = 'ALL',
  initialFiles,
  storageQuotaBytes = 50 * 1024 * 1024, // 50 MB
  apiEndpoint = '/files/library',
}: CentralFileLibraryModalProps) {
  const [files, setFiles] = useState<LibraryFileItem[]>(initialFiles ?? DEFAULT_LIBRARY_FILES);
  const [selectedCategory, setSelectedCategory] = useState<FileCategoryFilter>(initialCategory);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [attachingFileIds, setAttachingFileIds] = useState<Set<string>>(new Set());
  const [attachedFileIds, setAttachedFileIds] = useState<Set<string>>(new Set());

  // Sync initialFiles if provided externally
  useEffect(() => {
    if (initialFiles) {
      setFiles(initialFiles);
    }
  }, [initialFiles]);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Filtered files calculation
  const filteredFiles = useMemo(() => {
    return files.filter((file) => {
      // Category filter
      if (selectedCategory !== 'ALL' && file.category !== selectedCategory) {
        return false;
      }
      // Search query filter
      if (searchQuery.trim().length > 0) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = file.name.toLowerCase().includes(query);
        const matchesMime = file.mimeType.toLowerCase().includes(query);
        const matchesTags = file.tags?.some((t) => t.toLowerCase().includes(query)) ?? false;
        if (!matchesName && !matchesMime && !matchesTags) {
          return false;
        }
      }
      return true;
    });
  }, [files, selectedCategory, searchQuery]);

  // Overall statistics
  const stats = useMemo(() => {
    const totalFiles = files.length;
    const totalSizeBytes = files.reduce((acc, f) => acc + f.sizeBytes, 0);
    const quotaUsedPercent = Math.min(
      100,
      storageQuotaBytes > 0 ? (totalSizeBytes / storageQuotaBytes) * 100 : 0,
    );

    const countsByCategory: Record<FileCategoryFilter, number> = {
      ALL: totalFiles,
      DOCUMENTS: files.filter((f) => f.category === 'DOCUMENTS').length,
      CODE: files.filter((f) => f.category === 'CODE').length,
      MEDIA: files.filter((f) => f.category === 'MEDIA').length,
      DATA: files.filter((f) => f.category === 'DATA').length,
    };

    return {
      totalFiles,
      totalSizeBytes,
      formattedTotalSize: formatBytes(totalSizeBytes),
      formattedQuota: formatBytes(storageQuotaBytes),
      quotaUsedPercent: Number(quotaUsedPercent.toFixed(1)),
      countsByCategory,
    };
  }, [files, storageQuotaBytes]);

  // Handle "Add to current chat" action
  const handleAttach = useCallback(
    async (file: LibraryFileItem) => {
      if (attachingFileIds.has(file.id) || attachedFileIds.has(file.id)) {
        return;
      }

      setAttachingFileIds((prev) => new Set(prev).add(file.id));

      try {
        if (onAttachToChat) {
          await Promise.resolve(onAttachToChat(file));
        } else if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
          // Fallback to real API call if no direct callback passed
          await fetch(`${apiEndpoint}/attach`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId: file.id, targetChatId: currentChatId }),
          }).catch(() => {});
        }

        // Update local file usage metadata
        setFiles((prev) =>
          prev.map((f) => {
            if (f.id === file.id) {
              const chatSet = new Set(f.attachedChatIds ?? []);
              chatSet.add(currentChatId);
              return {
                ...f,
                usageCount: f.usageCount + 1,
                lastUsedAt: new Date().toISOString(),
                attachedChatIds: Array.from(chatSet),
              };
            }
            return f;
          }),
        );

        setAttachedFileIds((prev) => new Set(prev).add(file.id));
      } finally {
        setAttachingFileIds((prev) => {
          const next = new Set(prev);
          next.delete(file.id);
          return next;
        });
      }
    },
    [attachingFileIds, attachedFileIds, onAttachToChat, apiEndpoint, currentChatId],
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md transition-all animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[90vh] flex flex-col bg-zinc-950/95 border border-zinc-800/90 rounded-2xl shadow-2xl overflow-hidden text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800/80 bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center text-xl text-emerald-400">
              🗄️
            </div>
            <div>
              <h2
                id="library-modal-title"
                className="text-lg font-semibold tracking-tight text-white flex items-center gap-2"
              >
                Central File Library
                <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  Upload once, use anytime
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Access files across past chats and attach them directly to your current
                conversation.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Switcher */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-xs">
              <button
                type="button"
                aria-label="Grid view"
                onClick={() => setViewMode('grid')}
                className={`px-2.5 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-zinc-800 text-white font-medium shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>⊞</span> Grid
              </button>
              <button
                type="button"
                aria-label="List view"
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${
                  viewMode === 'list'
                    ? 'bg-zinc-800 text-white font-medium shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>☰</span> List
              </button>
            </div>

            {/* Close Button */}
            <button
              type="button"
              aria-label="Close modal"
              onClick={onClose}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Search Bar & Storage Stats Widget */}
        <div className="px-6 py-4 border-b border-zinc-800/70 bg-zinc-900/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Search Input */}
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">
              🔍
            </span>
            <input
              type="text"
              aria-label="Search files"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files by name, type, or tag..."
              className="w-full bg-zinc-900/90 border border-zinc-800 rounded-xl pl-10 pr-9 py-2 text-sm placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all text-zinc-100"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 text-xs w-4 h-4 rounded-full bg-zinc-800 flex items-center justify-center"
              >
                ✕
              </button>
            )}
          </div>

          {/* Storage Usage Bar & Stats Widget */}
          <div
            data-testid="storage-stats-widget"
            className="flex items-center gap-4 px-4 py-2 bg-zinc-900/80 border border-zinc-800/80 rounded-xl text-xs shrink-0"
          >
            <div className="flex flex-col gap-1 min-w-[140px]">
              <div className="flex justify-between items-center text-zinc-300">
                <span className="font-medium text-white">
                  {stats.totalFiles} files • {stats.formattedTotalSize}
                </span>
                <span className="text-[11px] text-zinc-400">{stats.quotaUsedPercent}%</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    stats.quotaUsedPercent > 85
                      ? 'bg-rose-500'
                      : stats.quotaUsedPercent > 60
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(stats.quotaUsedPercent, 100)}%` }}
                />
              </div>
            </div>
            <span className="text-[10px] text-zinc-500 border-l border-zinc-800 pl-3">
              Quota: {stats.formattedQuota}
            </span>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="px-6 py-3 border-b border-zinc-800/70 bg-zinc-950 flex items-center gap-2 overflow-x-auto scrollbar-none">
          {CATEGORY_TABS.map((tab) => {
            const count = stats.countsByCategory[tab.id];
            const isSelected = selectedCategory === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedCategory(tab.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 shadow-sm'
                    : 'bg-zinc-900/60 border border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    isSelected ? 'bg-emerald-500/30 text-emerald-200' : 'bg-zinc-800 text-zinc-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* File Content Area */}
        <div className="flex-1 overflow-y-auto p-6 min-h-[320px]">
          {filteredFiles.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-2xl text-zinc-500 mb-3">
                📂
              </div>
              <h3 className="text-sm font-medium text-zinc-300 mb-1">No files match your filter</h3>
              <p className="text-xs text-zinc-500 max-w-sm">
                Try searching with a different keyword or switch to another category filter.
              </p>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-3 text-xs text-emerald-400 hover:underline"
                >
                  Clear search query
                </button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredFiles.map((file) => {
                const isAttaching = attachingFileIds.has(file.id);
                const isAttached = attachedFileIds.has(file.id);
                const formattedSize = formatBytes(file.sizeBytes);

                return (
                  <div
                    key={file.id}
                    className="group relative flex flex-col justify-between p-4 rounded-xl bg-zinc-900/70 border border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900 transition-all shadow-sm"
                  >
                    <div>
                      {/* Category Badge & Usage Count */}
                      <div className="flex items-center justify-between text-[11px] mb-3">
                        <span className="px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700/60 text-zinc-300 font-mono text-[10px]">
                          {file.category}
                        </span>
                        <span className="text-zinc-500 text-[10px] flex items-center gap-1">
                          🔄 {file.usageCount} {file.usageCount === 1 ? 'chat' : 'chats'}
                        </span>
                      </div>

                      {/* File Icon & Filename */}
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-zinc-800/90 border border-zinc-700/50 flex items-center justify-center text-lg shrink-0 group-hover:scale-105 transition-transform">
                          {file.category === 'DOCUMENTS'
                            ? '📄'
                            : file.category === 'CODE'
                              ? '💻'
                              : file.category === 'MEDIA'
                                ? '🖼️'
                                : '📊'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className="text-xs font-semibold text-zinc-100 truncate group-hover:text-emerald-400 transition-colors"
                            title={file.name}
                          >
                            {file.name}
                          </p>
                          <p className="text-[11px] text-zinc-500 mt-0.5">{formattedSize}</p>
                        </div>
                      </div>

                      {/* Tags */}
                      {file.tags && file.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {file.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800/50 text-zinc-400"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Action Button: Add to current chat */}
                    <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between gap-2 mt-2">
                      <span className="text-[10px] text-zinc-500">
                        {new Date(file.lastUsedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>

                      <button
                        type="button"
                        aria-label={`Add ${file.name} to current chat`}
                        disabled={isAttaching || isAttached}
                        onClick={() => handleAttach(file)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                          isAttached
                            ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 cursor-default'
                            : isAttaching
                              ? 'bg-zinc-800 text-zinc-400 cursor-wait'
                              : 'bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-sm'
                        }`}
                      >
                        {isAttached ? (
                          <>
                            <span>✓</span>
                            <span>Added</span>
                          </>
                        ) : isAttaching ? (
                          <>
                            <span className="animate-spin text-[10px]">⏳</span>
                            <span>Adding...</span>
                          </>
                        ) : (
                          <>
                            <span>📎</span>
                            <span>Add to chat</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* List View */
            <div className="flex flex-col divide-y divide-zinc-800/60 border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-900/40">
              {filteredFiles.map((file) => {
                const isAttaching = attachingFileIds.has(file.id);
                const isAttached = attachedFileIds.has(file.id);
                const formattedSize = formatBytes(file.sizeBytes);

                return (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3.5 hover:bg-zinc-900/80 transition-colors gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-xl shrink-0">
                        {file.category === 'DOCUMENTS'
                          ? '📄'
                          : file.category === 'CODE'
                            ? '💻'
                            : file.category === 'MEDIA'
                              ? '🖼️'
                              : '📊'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-xs font-semibold text-zinc-100 truncate"
                          title={file.name}
                        >
                          {file.name}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-0.5">
                          <span className="font-mono text-zinc-400">{formattedSize}</span>
                          <span>•</span>
                          <span>{file.category}</span>
                          <span>•</span>
                          <span>Used in {file.usageCount} chats</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[10px] text-zinc-500 hidden sm:inline">
                        {new Date(file.lastUsedAt).toLocaleDateString()}
                      </span>
                      <button
                        type="button"
                        aria-label={`Add ${file.name} to current chat`}
                        disabled={isAttaching || isAttached}
                        onClick={() => handleAttach(file)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                          isAttached
                            ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 cursor-default'
                            : isAttaching
                              ? 'bg-zinc-800 text-zinc-400 cursor-wait'
                              : 'bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-sm'
                        }`}
                      >
                        {isAttached ? (
                          <>
                            <span>✓</span>
                            <span>Added</span>
                          </>
                        ) : isAttaching ? (
                          <>
                            <span className="animate-spin text-[10px]">⏳</span>
                            <span>Adding...</span>
                          </>
                        ) : (
                          <>
                            <span>📎</span>
                            <span>Add to chat</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800/80 bg-zinc-900/60 text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="text-zinc-200">{filteredFiles.length}</strong> of{' '}
              {files.length} library items
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
export default CentralFileLibraryModal;
