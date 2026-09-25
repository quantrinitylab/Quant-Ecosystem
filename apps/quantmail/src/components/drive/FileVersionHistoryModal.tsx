'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { browserApiRequest } from '../../services/browser-api-request';
import { formatBytes } from '../../lib/format-bytes';

export interface FileVersionItem {
  id: string;
  versionNumber: number;
  size: number;
  createdAt: string;
  author?: { name: string; email: string };
  contentHash?: string;
}

export interface VersionHistoryState {
  versions: FileVersionItem[];
  isLoading: boolean;
  isRestoring: boolean;
  restoringVersionId: string | null;
  error: string | null;
  lastRestoredVersion: FileVersionItem | null;
}

export interface VersionHistoryManagerOptions {
  fileId?: string;
  apiFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  initialVersions?: FileVersionItem[];
}

/**
 * Headless VersionHistoryManager
 * Encapsulates version fetching, restoration, size delta calculations,
 * and state subscription independently of UI components.
 */
export class VersionHistoryManager {
  readonly fileId: string;
  private apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  private listeners = new Set<(state: VersionHistoryState) => void>();
  private state: VersionHistoryState;

  constructor(
    fileIdOrOptions: string | VersionHistoryManagerOptions,
    options?: VersionHistoryManagerOptions,
  ) {
    if (typeof fileIdOrOptions === 'string') {
      this.fileId = fileIdOrOptions;
      this.apiFetch = options?.apiFetch ?? browserApiRequest;
      const initial = options?.initialVersions ?? [];
      this.state = {
        versions: [...initial].sort((a, b) => b.versionNumber - a.versionNumber),
        isLoading: false,
        isRestoring: false,
        restoringVersionId: null,
        error: null,
        lastRestoredVersion: null,
      };
    } else {
      this.fileId = fileIdOrOptions.fileId ?? '';
      this.apiFetch = fileIdOrOptions.apiFetch ?? browserApiRequest;
      const initial = fileIdOrOptions.initialVersions ?? [];
      this.state = {
        versions: [...initial].sort((a, b) => b.versionNumber - a.versionNumber),
        isLoading: false,
        isRestoring: false,
        restoringVersionId: null,
        error: null,
        lastRestoredVersion: null,
      };
    }
  }

  getState(): VersionHistoryState {
    return { ...this.state };
  }

  getVersions(): FileVersionItem[] {
    return [...this.state.versions].sort((a, b) => b.versionNumber - a.versionNumber);
  }

  subscribe(listener: (state: VersionHistoryState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(partial: Partial<VersionHistoryState>) {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      listener(this.getState());
    }
  }

  setVersions(versions: FileVersionItem[]) {
    const sorted = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
    this.setState({ versions: sorted });
  }

  calculateDelta(
    current: FileVersionItem | number,
    previous?: FileVersionItem | number | null,
  ): string {
    const currentSize = typeof current === 'number' ? current : current.size;
    let prevSize: number | null = null;

    if (typeof previous === 'number') {
      prevSize = previous;
    } else if (previous && typeof previous === 'object') {
      prevSize = previous.size;
    } else if (previous === undefined && typeof current === 'object' && current !== null) {
      const sorted = this.getVersions();
      const idx = sorted.findIndex(
        (v) => v.id === current.id || v.versionNumber === current.versionNumber,
      );
      if (idx !== -1 && idx < sorted.length - 1) {
        prevSize = sorted[idx + 1].size;
      } else if (idx === sorted.length - 1) {
        return '0 B';
      }
    }

    if (prevSize === null || prevSize === undefined) {
      return '0 B';
    }

    const diff = currentSize - prevSize;
    if (diff > 0) {
      return `+${formatBytes(diff)}`;
    } else if (diff < 0) {
      return `-${formatBytes(Math.abs(diff))}`;
    } else {
      return '0 B';
    }
  }

  async loadVersions(): Promise<FileVersionItem[]> {
    this.setState({ isLoading: true, error: null });
    try {
      const res = await this.apiFetch(
        `/api/drive/files/${encodeURIComponent(this.fileId)}/versions`,
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const msg =
          errBody.message || errBody.error || `Failed to fetch versions with HTTP ${res.status}`;
        throw new Error(msg);
      }
      const data = await res.json().catch(() => ({}));
      const rawList: FileVersionItem[] = Array.isArray(data)
        ? data
        : Array.isArray(data.versions)
          ? data.versions
          : Array.isArray(data.data)
            ? data.data
            : [];
      const sorted = [...rawList].sort((a, b) => b.versionNumber - a.versionNumber);
      this.setState({ versions: sorted, isLoading: false, error: null });
      return sorted;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch versions';
      this.setState({ isLoading: false, error: msg });
      throw err;
    }
  }

  async restoreVersion(versionId: string): Promise<FileVersionItem> {
    this.setState({ isRestoring: true, restoringVersionId: versionId, error: null });
    try {
      const res = await this.apiFetch(
        `/api/drive/files/${encodeURIComponent(this.fileId)}/versions/${encodeURIComponent(versionId)}/restore`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const msg =
          errBody.message || errBody.error || `Failed to restore version with HTTP ${res.status}`;
        throw new Error(msg);
      }
      const data = await res.json().catch(() => ({}));
      const restored: FileVersionItem = data.version ??
        data.data ??
        this.state.versions.find((v) => v.id === versionId) ?? {
          id: versionId,
          versionNumber: 0,
          size: 0,
          createdAt: new Date().toISOString(),
        };

      this.setState({
        isRestoring: false,
        restoringVersionId: null,
        lastRestoredVersion: restored,
        error: null,
      });
      return restored;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to restore version';
      this.setState({ isRestoring: false, restoringVersionId: null, error: msg });
      throw err;
    }
  }
}

export interface FileVersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
  currentVersionNumber?: number;
  onRestoreSuccess?: (restoredVersion: FileVersionItem) => void;
  manager?: VersionHistoryManager;
  initialVersions?: FileVersionItem[];
}

function formatTimestamp(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

/**
 * FileVersionHistoryModal
 * Modal displaying complete version history and 1-click rollback
 * for files in QuantDrive.
 */
export function FileVersionHistoryModal({
  isOpen,
  onClose,
  fileId,
  fileName,
  currentVersionNumber,
  onRestoreSuccess,
  manager,
  initialVersions,
}: FileVersionHistoryModalProps) {
  const activeManager = useMemo(() => {
    if (manager) return manager;
    return new VersionHistoryManager(fileId, { initialVersions });
  }, [manager, fileId, initialVersions]);

  const [state, setState] = useState<VersionHistoryState>(() => activeManager.getState());

  useEffect(() => {
    const unsubscribe = activeManager.subscribe((next) => {
      setState(next);
    });
    return unsubscribe;
  }, [activeManager]);

  useEffect(() => {
    if (isOpen && activeManager.getVersions().length === 0 && !activeManager.getState().isLoading) {
      activeManager.loadVersions().catch(() => {});
    }
  }, [isOpen, activeManager]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleRestore = async (version: FileVersionItem) => {
    try {
      const restored = await activeManager.restoreVersion(version.id);
      onRestoreSuccess?.(restored);
      onClose();
    } catch {
      // Error is caught and tracked in activeManager state
    }
  };

  if (!isOpen) {
    return null;
  }

  const sortedVersions = activeManager.getVersions();

  return (
    <div
      data-testid="version-history-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Version history for ${fileName}`}
        className="bg-[#16181D] border border-[#282C35] rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col text-[#F5F5F5] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#282C35] flex items-center justify-between gap-3 bg-[#16181D]">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[#F5F5F5] flex items-center gap-2">
              <span>Version History</span>
            </h2>
            <p className="text-xs text-[#9E9E9E] truncate max-w-md mt-0.5" title={fileName}>
              {fileName}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            data-testid="close-version-history-btn"
            onClick={onClose}
            className="p-1.5 rounded-md text-[#9E9E9E] hover:text-[#F5F5F5] hover:bg-[#282C35] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content list */}
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {state.error && (
            <div
              data-testid="version-history-error"
              className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs flex items-center justify-between gap-2"
            >
              <span>{state.error}</span>
              <button
                type="button"
                onClick={() => activeManager.loadVersions().catch(() => {})}
                className="text-xs font-medium underline hover:text-white"
              >
                Retry
              </button>
            </div>
          )}

          {state.isLoading && sortedVersions.length === 0 ? (
            <div
              data-testid="version-history-loading"
              className="py-12 flex flex-col items-center justify-center text-center gap-2 text-[#9E9E9E]"
            >
              <div className="w-6 h-6 border-2 border-[#FF8C42] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">Loading version history...</span>
            </div>
          ) : sortedVersions.length === 0 ? (
            <div
              data-testid="version-history-empty"
              className="py-12 text-center text-xs text-[#9E9E9E]"
            >
              No previous versions recorded for this file.
            </div>
          ) : (
            sortedVersions.map((version, index) => {
              const isCurrent =
                currentVersionNumber !== undefined
                  ? version.versionNumber === currentVersionNumber
                  : index === 0;

              const prevVersion = sortedVersions[index + 1];
              const delta = activeManager.calculateDelta(version, prevVersion);
              const isThisRestoring = state.isRestoring && state.restoringVersionId === version.id;

              return (
                <div
                  key={version.id}
                  data-testid={`version-card-${version.versionNumber}`}
                  className={`p-3.5 rounded-lg border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isCurrent
                      ? 'bg-[#282C35]/60 border-[#FF8C42]/50 shadow-sm'
                      : 'bg-[#1A1D24] border-[#282C35] hover:border-[#383E4A]'
                  }`}
                >
                  <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        data-testid={`version-badge-${version.versionNumber}`}
                        className="px-2 py-0.5 rounded text-xs font-semibold bg-[#282C35] text-[#FF8C42] border border-[#FF8C42]/30"
                      >
                        v{version.versionNumber}
                      </span>
                      {isCurrent && (
                        <span
                          data-testid="current-version-pill"
                          className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FF8C42]/20 text-[#FF8C42] border border-[#FF8C42]/40"
                        >
                          Current
                        </span>
                      )}
                      <span className="text-xs font-medium text-[#F5F5F5]">
                        {formatBytes(version.size)}
                      </span>
                      {delta && (
                        <span
                          data-testid={`version-delta-${version.versionNumber}`}
                          className={`text-xs font-mono font-medium px-1.5 py-0.2 rounded border ${
                            delta.startsWith('+')
                              ? 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40'
                              : delta.startsWith('-')
                                ? 'text-rose-400 bg-rose-950/40 border-rose-800/40'
                                : 'text-[#9E9E9E] bg-[#282C35]/40 border-[#282C35]'
                          }`}
                        >
                          {delta}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-[#9E9E9E] flex-wrap">
                      <span data-testid={`version-date-${version.versionNumber}`}>
                        {formatTimestamp(version.createdAt)}
                      </span>
                      {version.author && (
                        <span
                          data-testid={`version-author-${version.versionNumber}`}
                          className="text-[#A1A4AC]"
                        >
                          by {version.author.name || version.author.email}
                        </span>
                      )}
                      {version.contentHash && (
                        <span
                          className="text-[10px] font-mono text-[#717684]"
                          title={`Content Hash: ${version.contentHash}`}
                        >
                          {version.contentHash.slice(0, 8)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center sm:self-center shrink-0">
                    {!isCurrent ? (
                      <button
                        type="button"
                        data-testid={`restore-button-${version.id}`}
                        data-version-number={version.versionNumber}
                        disabled={state.isRestoring}
                        onClick={() => handleRestore(version)}
                        className="w-full sm:w-auto px-3.5 py-1.5 rounded-md text-xs font-medium bg-[#FF8C42] hover:bg-[#FF8C42]/90 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        {isThisRestoring ? 'Restoring...' : 'Restore this version'}
                      </button>
                    ) : (
                      <span className="text-xs text-[#9E9E9E] italic hidden sm:inline-block">
                        Current version
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#282C35] flex items-center justify-between text-xs text-[#9E9E9E] bg-[#16181D]">
          <span>
            {sortedVersions.length} {sortedVersions.length === 1 ? 'version' : 'versions'}
          </span>
          <button
            type="button"
            data-testid="version-history-footer-close"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-[#282C35] hover:bg-[#383E4A] text-[#F5F5F5] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
