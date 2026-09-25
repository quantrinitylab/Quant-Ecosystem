'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { browserApiRequest } from '../../services/browser-api-request';
import { formatBytes } from '../../lib/format-bytes';

export interface DuplicateFileItem {
  id: string;
  name: string;
  size: number;
  modifiedAt: string;
  path: string;
  contentHash: string;
  isOriginal: boolean;
  selectedForDeletion: boolean;
}

export interface DuplicateGroup {
  hash: string;
  files: DuplicateFileItem[];
  potentialSavings: number;
}

export interface AIDuplicateCleanerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCleanupComplete?: (removedCount: number, savedBytes: number) => void;
  manager?: DuplicateCleanerManager;
}

export interface DuplicateCleanerState {
  groups: DuplicateGroup[];
  isScanning: boolean;
  isCleaning: boolean;
  error: string | null;
  lastCleanedResult: { removedCount: number; savedBytes: number } | null;
}

export interface DuplicateCleanerManagerOptions {
  apiFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  initialGroups?: DuplicateGroup[];
}

/**
 * Designate the original file and duplicate copies in a group:
 * Auto-designates the root-most / cleanest path, non-copy, and newest file as "Original (Keep)"
 * and older or duplicate copies as "Duplicate (Reclaim)" with selectedForDeletion = true.
 */
export function designateOriginalAndDuplicates(
  files: Array<{ id: string; name: string } & Partial<DuplicateFileItem>>,
  groupHash: string,
): DuplicateFileItem[] {
  if (files.length === 0) return [];

  // If already designated (e.g. explicitly defined in tests), preserve existing designations
  const hasPredefined = files.some((f) => typeof f.isOriginal === 'boolean');
  if (hasPredefined) {
    return files.map((f, idx) => ({
      id: f.id,
      name: f.name,
      size: f.size ?? 0,
      modifiedAt: f.modifiedAt || new Date().toISOString(),
      path: f.path || `/${f.name}`,
      contentHash: f.contentHash || groupHash,
      isOriginal: f.isOriginal ?? idx === 0,
      selectedForDeletion: f.selectedForDeletion ?? (f.isOriginal ? false : true),
    }));
  }

  // Auto-designation ranking:
  // 1. Root-level preference (fewer directory levels)
  // 2. Penalize names containing 'copy', 'duplicate', '(1)', etc.
  // 3. Newest modifiedAt date
  const sorted = [...files].sort((a, b) => {
    const depthA = (a.path || '').split('/').filter(Boolean).length;
    const depthB = (b.path || '').split('/').filter(Boolean).length;
    if (depthA !== depthB) {
      return depthA - depthB;
    }

    const isCopyA = /copy|duplicate|\(\d+\)/i.test(a.name);
    const isCopyB = /copy|duplicate|\(\d+\)/i.test(b.name);
    if (isCopyA !== isCopyB) {
      return isCopyA ? 1 : -1;
    }

    const timeA = a.modifiedAt ? new Date(a.modifiedAt).getTime() : 0;
    const timeB = b.modifiedAt ? new Date(b.modifiedAt).getTime() : 0;
    return timeB - timeA;
  });

  return sorted.map((file, index) => {
    const isOriginal = index === 0;
    return {
      id: file.id,
      name: file.name,
      size: file.size ?? 0,
      modifiedAt: file.modifiedAt || new Date().toISOString(),
      path: file.path || `/${file.name}`,
      contentHash: file.contentHash || groupHash,
      isOriginal,
      selectedForDeletion: !isOriginal,
    };
  });
}

/**
 * Headless DuplicateCleanerManager
 * Encapsulates scanning for duplicates via `/api/drive/ai/duplicates`,
 * managing checkbox selection states, computing savings, and executing
 * batch trashing via `/api/drive/files/trash`.
 */
export class DuplicateCleanerManager {
  private apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  private state: DuplicateCleanerState;
  private listeners: Set<(state: DuplicateCleanerState) => void> = new Set();

  constructor(options: DuplicateCleanerManagerOptions = {}) {
    this.apiFetch = options.apiFetch || browserApiRequest;
    const initialGroups = (options.initialGroups || []).map((g) => {
      const files = designateOriginalAndDuplicates(g.files, g.hash);
      const potentialSavings =
        typeof g.potentialSavings === 'number'
          ? g.potentialSavings
          : files.filter((f) => !f.isOriginal).reduce((sum, f) => sum + f.size, 0);
      return {
        ...g,
        files,
        potentialSavings,
      };
    });

    this.state = {
      groups: initialGroups,
      isScanning: false,
      isCleaning: false,
      error: null,
      lastCleanedResult: null,
    };
  }

  public getState(): DuplicateCleanerState {
    return { ...this.state };
  }

  public subscribe(listener: (state: DuplicateCleanerState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.getState());
    }
  }

  private updateState(partial: Partial<DuplicateCleanerState>) {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  public setGroups(groups: DuplicateGroup[]) {
    const processed = groups.map((g) => {
      const files = designateOriginalAndDuplicates(g.files, g.hash);
      const potentialSavings =
        typeof g.potentialSavings === 'number'
          ? g.potentialSavings
          : files.filter((f) => !f.isOriginal).reduce((sum, f) => sum + f.size, 0);
      return {
        ...g,
        files,
        potentialSavings,
      };
    });
    this.updateState({ groups: processed, error: null });
  }

  /**
   * Scans Drive files via `/api/drive/ai/duplicates` (POST `{}`)
   */
  public async scanDuplicates(): Promise<DuplicateGroup[]> {
    this.updateState({ isScanning: true, error: null });
    try {
      const res = await this.apiFetch('/api/drive/ai/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Scan failed with status ${res.status}`);
      }

      const json = await res.json();
      const rawGroups: any[] =
        json.groups || json.data?.groups || json.data || (Array.isArray(json) ? json : []);

      const processedGroups: DuplicateGroup[] = rawGroups.map((g: any) => {
        const hash = g.hash || g.contentHash || 'unknown-hash';
        const rawFiles: any[] = g.files || [];
        const files = designateOriginalAndDuplicates(
          rawFiles.map((rf: any) => ({
            id: rf.id,
            name: rf.name,
            size: rf.size ?? 0,
            modifiedAt: rf.modifiedAt || rf.updatedAt || new Date().toISOString(),
            path: rf.path || `/${rf.name}`,
            contentHash: rf.contentHash || hash,
            isOriginal: rf.isOriginal,
            selectedForDeletion: rf.selectedForDeletion,
          })),
          hash,
        );

        const potentialSavings =
          typeof g.potentialSavings === 'number'
            ? g.potentialSavings
            : files.filter((f) => !f.isOriginal).reduce((sum, f) => sum + f.size, 0);

        return {
          hash,
          files,
          potentialSavings,
        };
      });

      this.updateState({
        groups: processedGroups,
        isScanning: false,
        error: null,
      });

      return processedGroups;
    } catch (err) {
      const message = (err as Error).message || 'Failed to scan duplicate files';
      this.updateState({ isScanning: false, error: message });
      throw err;
    }
  }

  /**
   * Toggles deletion selection for a specific duplicate file
   */
  public toggleSelectFile(fileIdOrGroupId: string, maybeFileId?: string): void {
    const fileId = maybeFileId ?? fileIdOrGroupId;
    const targetGroupId = maybeFileId ? fileIdOrGroupId : undefined;
    let changed = false;
    const updatedGroups = this.state.groups.map((group) => {
      if (targetGroupId && group.hash !== targetGroupId) {
        return group;
      }
      let groupChanged = false;
      const updatedFiles = group.files.map((file) => {
        if (file.id === fileId) {
          // Originals cannot be marked for deletion
          if (file.isOriginal) return file;
          groupChanged = true;
          changed = true;
          return {
            ...file,
            selectedForDeletion: !file.selectedForDeletion,
          };
        }
        return file;
      });

      return groupChanged ? { ...group, files: updatedFiles } : group;
    });

    if (changed) {
      this.updateState({ groups: updatedGroups });
    }
  }

  /**
   * Selects all non-original duplicate files for deletion
   */
  public selectAllDuplicates(): void {
    const updatedGroups = this.state.groups.map((group) => ({
      ...group,
      files: group.files.map((file) =>
        file.isOriginal ? file : { ...file, selectedForDeletion: true },
      ),
    }));
    this.updateState({ groups: updatedGroups });
  }

  /**
   * Deselects all duplicate files
   */
  public deselectAll(): void {
    const updatedGroups = this.state.groups.map((group) => ({
      ...group,
      files: group.files.map((file) => ({ ...file, selectedForDeletion: false })),
    }));
    this.updateState({ groups: updatedGroups });
  }

  /**
   * Alias for deselectAll()
   */
  public deselectAllDuplicates(): void {
    this.deselectAll();
  }

  /**
   * Calculates potential savings across all duplicates (or only selected duplicates)
   */
  public calculateTotalSavings(onlySelected: boolean = false): number {
    return this.state.groups.reduce((total, group) => {
      return (
        total +
        group.files
          .filter((f) => !f.isOriginal && (!onlySelected || f.selectedForDeletion))
          .reduce((sum, f) => sum + f.size, 0)
      );
    }, 0);
  }

  public calculateSelectedSavings(): number {
    return this.calculateTotalSavings(true);
  }

  public getTotalDuplicatesCount(): number {
    return this.state.groups.reduce(
      (count, group) => count + group.files.filter((f) => !f.isOriginal).length,
      0,
    );
  }

  public getSelectedDuplicatesCount(): number {
    return this.state.groups.reduce(
      (count, group) =>
        count + group.files.filter((f) => !f.isOriginal && f.selectedForDeletion).length,
      0,
    );
  }

  public getSelectedFiles(): DuplicateFileItem[] {
    const result: DuplicateFileItem[] = [];
    for (const group of this.state.groups) {
      for (const file of group.files) {
        if (!file.isOriginal && file.selectedForDeletion) {
          result.push(file);
        }
      }
    }
    return result;
  }

  /**
   * Returns list of IDs of duplicate files currently selected for deletion
   */
  public getSelectedFileIds(): string[] {
    return this.getSelectedFiles().map((f) => f.id);
  }

  /**
   * Executes batch cleanup by calling `/api/drive/files/trash` with selected file IDs
   */
  public async executeCleanup(): Promise<{ removedCount: number; savedBytes: number }> {
    const selectedFiles = this.getSelectedFiles();
    if (selectedFiles.length === 0) {
      return { removedCount: 0, savedBytes: 0 };
    }

    const fileIds = selectedFiles.map((f) => f.id);
    const savedBytes = selectedFiles.reduce((sum, f) => sum + f.size, 0);
    const removedCount = fileIds.length;

    this.updateState({ isCleaning: true, error: null });

    try {
      const res = await this.apiFetch('/api/drive/files/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Trash cleanup failed with status ${res.status}`);
      }

      // Filter out trashed files from remaining groups
      const trashedSet = new Set(fileIds);
      const updatedGroups: DuplicateGroup[] = [];

      for (const group of this.state.groups) {
        const remainingFiles = group.files.filter((f) => !trashedSet.has(f.id));
        const remainingDuplicates = remainingFiles.filter((f) => !f.isOriginal);

        // Keep group only if more than 1 file exists and at least one is a duplicate
        if (remainingFiles.length > 1 && remainingDuplicates.length > 0) {
          const potentialSavings = remainingDuplicates.reduce((sum, f) => sum + f.size, 0);
          updatedGroups.push({
            ...group,
            files: remainingFiles,
            potentialSavings,
          });
        }
      }

      const lastCleanedResult = { removedCount, savedBytes };
      this.updateState({
        groups: updatedGroups,
        isCleaning: false,
        lastCleanedResult,
        error: null,
      });

      return lastCleanedResult;
    } catch (err) {
      const message = (err as Error).message || 'Failed to clean duplicates';
      this.updateState({ isCleaning: false, error: message });
      throw err;
    }
  }
}

/**
 * AIDuplicateCleanerModal Component
 * Accessible dialog styled with Quant Studio tokens:
 * `#16181D`, `#282C35`, `#FF8C42`, `#EF4444`, `#22C55E`
 */
export const AIDuplicateCleanerModal: React.FC<AIDuplicateCleanerModalProps> = ({
  isOpen,
  onClose,
  onCleanupComplete,
  manager: managerProp,
}) => {
  const manager = useMemo(() => managerProp || new DuplicateCleanerManager(), [managerProp]);
  const [state, setState] = useState<DuplicateCleanerState>(() => manager.getState());

  useEffect(() => {
    const unsubscribe = manager.subscribe(setState);
    return () => unsubscribe();
  }, [manager]);

  useEffect(() => {
    if (isOpen && state.groups.length === 0 && !state.isScanning && !state.error) {
      manager.scanDuplicates().catch(() => {
        // Error state handled inside manager
      });
    }
  }, [isOpen, manager, state.groups.length, state.isScanning, state.error]);

  // Keyboard accessibility: Escape key closes modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !state.isCleaning) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, state.isCleaning]);

  const totalSavings = manager.calculateTotalSavings();
  const selectedSavings = manager.calculateSelectedSavings();
  const totalDuplicates = manager.getTotalDuplicatesCount();
  const selectedDuplicates = manager.getSelectedDuplicatesCount();

  const handleClean = async () => {
    try {
      const result = await manager.executeCleanup();
      if (result.removedCount > 0) {
        onCleanupComplete?.(result.removedCount, result.savedBytes);
      }
    } catch {
      // Error handled in manager state
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI Duplicate Cleaner"
      aria-labelledby="ai-duplicate-cleaner-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl overflow-hidden shadow-2xl border"
        style={{
          backgroundColor: '#16181D',
          borderColor: '#282C35',
        }}
      >
        {/* Modal Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0"
          style={{
            backgroundColor: '#16181D',
            borderColor: '#282C35',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: 'rgba(255, 140, 66, 0.12)',
                color: '#FF8C42',
              }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
            <div>
              <h2
                id="ai-duplicate-cleaner-title"
                className="text-lg font-semibold text-white tracking-tight"
              >
                AI Duplicate Cleaner
              </h2>
              <p className="text-xs text-[#9CA3AF]">
                Quant AI scanned storage and identified identical duplicate files by hash.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={state.isCleaning}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-white hover:bg-[#282C35] transition-colors disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Potential Savings Summary Banner */}
        {totalDuplicates > 0 && (
          <div
            data-testid="duplicate-summary-banner"
            className="mx-6 mt-4 p-4 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0"
            style={{
              backgroundColor: 'rgba(255, 140, 66, 0.08)',
              borderColor: 'rgba(255, 140, 66, 0.25)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold"
                style={{
                  backgroundColor: 'rgba(255, 140, 66, 0.2)',
                  color: '#FF8C42',
                }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <div>
                <div className="text-sm font-semibold text-white">
                  Reclaim {formatBytes(totalSavings)} across {totalDuplicates}{' '}
                  {totalDuplicates === 1 ? 'duplicate' : 'duplicates'}
                </div>
                <div className="text-xs text-[#9CA3AF]">
                  {selectedDuplicates} of {totalDuplicates} selected for cleanup (
                  {formatBytes(selectedSavings)})
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                type="button"
                data-testid="select-all-duplicates-button"
                onClick={() => manager.selectAllDuplicates()}
                className="px-2.5 py-1 text-xs font-medium rounded text-[#9CA3AF] hover:text-white bg-[#282C35] hover:bg-[#323742] transition-colors"
              >
                Select All
              </button>
              <button
                type="button"
                data-testid="deselect-all-duplicates-button"
                onClick={() => manager.deselectAll()}
                className="px-2.5 py-1 text-xs font-medium rounded text-[#9CA3AF] hover:text-white bg-[#282C35] hover:bg-[#323742] transition-colors"
              >
                Deselect All
              </button>
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Scanning Loader */}
          {state.isScanning && (
            <div
              data-testid="scanning-state"
              className="flex flex-col items-center justify-center py-16 text-center space-y-3"
            >
              <div
                className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: '#FF8C42', borderTopColor: 'transparent' }}
              />
              <p className="text-sm font-medium text-white">
                Scanning Drive files for duplicates...
              </p>
              <p className="text-xs text-[#9CA3AF]">
                Analyzing perceptual and cryptographic content hashes.
              </p>
            </div>
          )}

          {/* Error Message */}
          {state.error && !state.isScanning && (
            <div
              data-testid="cleaner-error-banner"
              className="p-3.5 rounded-lg border flex items-center justify-between text-xs"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderColor: 'rgba(239, 68, 68, 0.3)',
                color: '#EF4444',
              }}
            >
              <span className="font-medium">{state.error}</span>
              <button
                type="button"
                onClick={() => manager.scanDuplicates()}
                className="underline hover:opacity-80 font-semibold ml-3"
              >
                Retry Scan
              </button>
            </div>
          )}

          {/* Last Cleaned Success Notification */}
          {state.lastCleanedResult && !state.error && (
            <div
              data-testid="cleaned-success-banner"
              className="p-3.5 rounded-lg border flex items-center gap-2 text-xs"
              style={{
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                borderColor: 'rgba(34, 197, 94, 0.3)',
                color: '#22C55E',
              }}
            >
              <svg
                className="w-4 h-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span>
                Successfully moved {state.lastCleanedResult.removedCount}{' '}
                {state.lastCleanedResult.removedCount === 1 ? 'file' : 'files'} to Trash, reclaiming{' '}
                {formatBytes(state.lastCleanedResult.savedBytes)}.
              </span>
            </div>
          )}

          {/* Empty State */}
          {!state.isScanning && !state.error && state.groups.length === 0 && (
            <div
              data-testid="no-duplicates-empty-state"
              className="flex flex-col items-center justify-center py-16 text-center space-y-3"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: 'rgba(34, 197, 94, 0.15)',
                  color: '#22C55E',
                }}
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-white">No Duplicate Files Detected</h3>
              <p className="text-xs text-[#9CA3AF] max-w-sm">
                Your QuantDrive storage is fully optimized. Every file in your account is unique.
              </p>
            </div>
          )}

          {/* Duplicate Groups List */}
          {!state.isScanning &&
            state.groups.map((group, groupIndex) => (
              <div
                key={group.hash || groupIndex}
                data-testid={`duplicate-group-${group.hash}`}
                className="rounded-lg border overflow-hidden"
                style={{
                  backgroundColor: '#16181D',
                  borderColor: '#282C35',
                }}
              >
                {/* Group Sub-Header */}
                <div
                  className="px-4 py-2.5 border-b flex items-center justify-between text-xs"
                  style={{
                    backgroundColor: '#1E222A',
                    borderColor: '#282C35',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[#9CA3AF]">
                      SHA-256: {group.hash.slice(0, 12)}...
                    </span>
                    <span className="text-[#6B7280]">•</span>
                    <span className="text-[#9CA3AF]">{group.files.length} identical copies</span>
                  </div>
                  <div className="font-medium" style={{ color: '#FF8C42' }}>
                    {formatBytes(group.potentialSavings)} potential savings
                  </div>
                </div>

                {/* Group Files */}
                <div className="divide-y" style={{ borderColor: '#282C35' }}>
                  {group.files.map((file) => (
                    <div
                      key={file.id}
                      data-testid={`file-row-${file.id}`}
                      className={`px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                        file.selectedForDeletion ? 'bg-red-500/5' : 'hover:bg-[#1E222A]/60'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Checkbox for duplicate or lock icon for original */}
                        {file.isOriginal ? (
                          <div
                            data-testid={`original-lock-${file.id}`}
                            className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                            style={{ color: '#22C55E' }}
                            title="Original file cannot be deleted"
                          >
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                              />
                            </svg>
                          </div>
                        ) : (
                          <input
                            type="checkbox"
                            data-testid={`duplicate-checkbox-${file.id}`}
                            aria-label={`Select duplicate ${file.name} for deletion`}
                            checked={file.selectedForDeletion}
                            onChange={() => manager.toggleSelectFile(file.id)}
                            className="w-4 h-4 rounded cursor-pointer accent-[#EF4444] border-gray-600 bg-gray-800"
                          />
                        )}

                        {/* File Details */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white truncate max-w-xs sm:max-w-md">
                              {file.name}
                            </span>
                            {/* Badges */}
                            {file.isOriginal ? (
                              <span
                                data-testid={`original-badge-${file.id}`}
                                className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider border shrink-0"
                                style={{
                                  backgroundColor: 'rgba(34, 197, 94, 0.15)',
                                  color: '#22C55E',
                                  borderColor: 'rgba(34, 197, 94, 0.3)',
                                }}
                              >
                                Original (Keep)
                              </span>
                            ) : (
                              <span
                                data-testid={`duplicate-badge-${file.id}`}
                                className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider border shrink-0"
                                style={{
                                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                  color: '#EF4444',
                                  borderColor: 'rgba(239, 68, 68, 0.3)',
                                }}
                              >
                                Duplicate (Reclaim)
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mt-0.5 text-xs text-[#9CA3AF]">
                            <span className="truncate max-w-[200px]" title={file.path}>
                              {file.path}
                            </span>
                            <span>•</span>
                            <span>{formatBytes(file.size)}</span>
                            <span>•</span>
                            <span>{new Date(file.modifiedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right indicator */}
                      <div className="shrink-0 text-right">
                        {file.selectedForDeletion && !file.isOriginal ? (
                          <span className="text-xs font-medium" style={{ color: '#EF4444' }}>
                            -{formatBytes(file.size)}
                          </span>
                        ) : (
                          <span className="text-xs text-[#6B7280]">
                            {file.isOriginal ? 'Preserved' : 'Kept'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>

        {/* Modal Footer */}
        <div
          className="flex items-center justify-between px-6 py-4 border-t shrink-0"
          style={{
            backgroundColor: '#16181D',
            borderColor: '#282C35',
          }}
        >
          <div className="text-xs text-[#9CA3AF]">
            {selectedDuplicates > 0 ? (
              <span>
                Ready to reclaim{' '}
                <strong className="text-white">{formatBytes(selectedSavings)}</strong> from{' '}
                {selectedDuplicates} files
              </span>
            ) : (
              <span>No duplicates selected</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="cleaner-cancel-button"
              onClick={onClose}
              disabled={state.isCleaning}
              className="px-4 py-2 text-xs font-medium rounded-lg text-[#9CA3AF] hover:text-white bg-[#282C35] hover:bg-[#323742] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              data-testid="clean-duplicates-button"
              disabled={selectedDuplicates === 0 || state.isCleaning}
              onClick={handleClean}
              className="px-4 py-2 text-xs font-medium rounded-lg text-white transition-all shadow-md flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: '#EF4444',
              }}
            >
              {state.isCleaning && (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              <span>
                {state.isCleaning
                  ? 'Cleaning...'
                  : `Clean Selected Duplicates (${selectedDuplicates})`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
