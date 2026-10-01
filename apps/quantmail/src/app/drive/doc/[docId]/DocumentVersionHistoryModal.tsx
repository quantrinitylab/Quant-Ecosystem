'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Skeleton } from '@quant/shared-ui';
import { apiClient } from '../../../../services/api-client';
import { showToast } from '../../../../components/InboxToast';

export interface DocumentVersionItem {
  id: string;
  docId: string;
  title: string;
  createdAt: string;
  content?: string;
}

export interface DocumentVersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  docId: string;
  currentTitle: string;
  onVersionRestored: (newContent: string, newTitle: string) => void;
}

export function DocumentVersionHistoryModal({
  isOpen,
  onClose,
  docId,
  currentTitle,
  onVersionRestored,
}: DocumentVersionHistoryModalProps) {
  const [versions, setVersions] = useState<DocumentVersionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [newSnapshotTitle, setNewSnapshotTitle] = useState('');
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<DocumentVersionItem | null>(null);

  const loadVersions = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.getDocumentVersions(docId);
      if (res.success && res.data) {
        setVersions(res.data);
      } else {
        setVersions([]);
      }
    } catch {
      showToast({ text: 'Failed to load document version history', type: 'error' });
      setVersions([]);
    } finally {
      setIsLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    if (isOpen) {
      loadVersions();
      setPreviewVersion(null);
    }
  }, [isOpen, loadVersions]);

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSnapshotTitle.trim()) return;

    setIsSavingSnapshot(true);
    try {
      const res = await apiClient.createDocumentVersion(docId, newSnapshotTitle.trim());
      if (res.success) {
        showToast({ text: 'Snapshot saved successfully', type: 'success' });
        setNewSnapshotTitle('');
        await loadVersions();
      } else {
        showToast({ text: res.error?.message || 'Failed to save snapshot', type: 'error' });
      }
    } catch {
      showToast({ text: 'Failed to save snapshot', type: 'error' });
    } finally {
      setIsSavingSnapshot(false);
    }
  };

  const handleRestore = async (version: DocumentVersionItem) => {
    const ok = window.confirm(
      `Restore to version "${version.title}" from ${new Date(version.createdAt).toLocaleString()}? A backup of your current document will be created.`,
    );
    if (!ok) return;

    setIsRestoring(true);
    try {
      const res = await apiClient.restoreDocumentVersion(docId, version.id);
      if (res.success && res.data) {
        showToast({ text: `Restored to "${version.title}"`, type: 'success' });
        onVersionRestored(res.data.content || '', res.data.title || currentTitle);
        onClose();
      } else {
        showToast({ text: res.error?.message || 'Failed to restore version', type: 'error' });
      }
    } catch {
      showToast({ text: 'Failed to restore version', type: 'error' });
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Document Version History"
      description="View past checkpoints, name snapshots of your work, and restore previous versions."
      size="xl"
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {/* Create Named Snapshot Form */}
        <form
          onSubmit={handleCreateSnapshot}
          className="flex items-center gap-2 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-3"
        >
          <input
            type="text"
            value={newSnapshotTitle}
            onChange={(e) => setNewSnapshotTitle(e.target.value)}
            placeholder="Name a new checkpoint (e.g. Major draft complete)"
            className="flex-1 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-background)] px-3 py-1.5 text-xs text-[var(--quant-foreground)] placeholder-[var(--quant-text-muted)] focus:outline-none focus:border-[var(--brand-primary)]"
          />
          <Button
            variant="primary"
            size="sm"
            type="submit"
            disabled={isSavingSnapshot || !newSnapshotTitle.trim()}
          >
            {isSavingSnapshot ? 'Saving…' : 'Save Checkpoint'}
          </Button>
        </form>

        {/* Version list & preview */}
        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-16 w-full rounded-xl bg-[var(--quant-surface)]" />
            <Skeleton className="h-16 w-full rounded-xl bg-[var(--quant-surface)]" />
            <Skeleton className="h-16 w-full rounded-xl bg-[var(--quant-surface)]" />
          </div>
        ) : versions.length === 0 ? (
          <div className="py-12 text-center text-[var(--quant-text-muted)]">
            <svg
              className="mx-auto h-8 w-8 text-[#8B949E]/50"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="10" strokeWidth="2" />
              <polyline points="12 6 12 12 16 14" strokeWidth="2" />
            </svg>
            <p className="mt-3 text-xs">No saved versions yet.</p>
            <p className="mt-1 text-[11px] text-[#8B949E]/70">
              Checkpoints are created automatically when editing and can be saved manually above.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {versions.map((ver, index) => {
              const createdDate = new Date(ver.createdAt);
              const isSelectedForPreview = previewVersion?.id === ver.id;
              const byteLen = ver.content ? new Blob([ver.content]).size : 0;

              return (
                <div
                  key={ver.id}
                  className={`rounded-xl border p-3 transition-all ${
                    isSelectedForPreview
                      ? 'border-[var(--brand-primary)] bg-[var(--quant-surface-elevated)]'
                      : 'border-[var(--quant-border)] bg-[var(--quant-surface)] hover:border-[var(--quant-border-strong)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--quant-foreground)]">
                          {ver.title || 'Snapshot'}
                        </span>
                        {index === 0 && (
                          <span className="rounded bg-[#FF8C42]/20 border border-[#FF8C42]/30 px-1.5 py-0.2 text-[9px] font-bold text-[var(--brand-primary)]">
                            LATEST
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--quant-text-muted)]">
                        {createdDate.toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}{' '}
                        at{' '}
                        {createdDate.toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        • {byteLen > 1024 ? `${(byteLen / 1024).toFixed(1)} KB` : `${byteLen} B`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewVersion(isSelectedForPreview ? null : ver)}
                        className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-2.5 py-1 text-[11px] font-medium text-[var(--quant-foreground)] hover:text-[var(--quant-foreground)] transition-colors"
                      >
                        {isSelectedForPreview ? 'Hide Preview' : 'Preview'}
                      </button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleRestore(ver)}
                        disabled={isRestoring}
                      >
                        Restore
                      </Button>
                    </div>
                  </div>

                  {/* Inline Preview */}
                  {isSelectedForPreview && (
                    <div className="mt-3 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-background)] p-3 text-xs text-[var(--quant-foreground)] max-h-48 overflow-y-auto font-mono whitespace-pre-wrap">
                      {ver.content || '(Empty document)'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
