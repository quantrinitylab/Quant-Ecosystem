'use client';

// ============================================================================
// MoveConversationSheet — Slice 2 (thread view), spec section 5.
// ============================================================================
// "Move Conversation" sheet, Outlook behaviour rebuilt in QuantMail's own
// code: a Search field, Favourites (Inbox, Sent), the folder list, and
// "+ Create Folder". Tapping a folder moves the conversation there; the
// caller owns the move call and the Moved/Undo toast. Creating a folder
// only creates it (and refreshes the list) — it does not silently move
// the conversation into a folder the user has not tapped.

import { useMemo, useState } from 'react';
import type { EmailFolder } from '../services/api-client';
import { groupMoveFolders } from '../lib/thread-overflow';

interface MoveConversationSheetProps {
  open: boolean;
  onClose: () => void;
  folders: EmailFolder[];
  foldersLoading: boolean;
  currentFolderId?: string | null;
  onMove: (folderId: string, folderName: string) => void;
  onCreateFolder: (name: string) => Promise<boolean>;
}

export function MoveConversationSheet({
  open,
  onClose,
  folders,
  foldersLoading,
  currentFolderId,
  onMove,
  onCreateFolder,
}: MoveConversationSheetProps) {
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const grouped = useMemo(() => groupMoveFolders(folders, query), [folders, query]);

  if (!open) return null;

  const renderFolderButton = (folder: EmailFolder) => {
    const isCurrent = currentFolderId != null && folder.id === currentFolderId;
    return (
      <button
        key={folder.id}
        type="button"
        disabled={isCurrent}
        onClick={() => onMove(folder.id, folder.name)}
        className="flex w-full min-h-[44px] items-center justify-between gap-3 px-3.5 text-left text-[13px] font-medium text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-surface-elevated)] focus-visible:outline-none focus-visible:bg-[var(--quant-surface-elevated)] disabled:cursor-default disabled:opacity-50"
      >
        <span className="flex items-center gap-3 min-w-0">
          <span
            className="size-3 shrink-0 rounded-full"
            style={{ backgroundColor: folder.color || 'var(--quant-muted-foreground)' }}
            aria-hidden="true"
          />
          <span className="truncate">{folder.name}</span>
        </span>
        {isCurrent && <span className="text-xs text-[var(--quant-muted-foreground)]">Current</span>}
      </button>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Move conversation"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-t-3xl bg-[var(--quant-surface-elevated)] shadow-2xl sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-base font-semibold text-[var(--quant-foreground)]">
            Move Conversation
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close move sheet"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]"
          >
            ✕
          </button>
        </div>

        <div className="px-4 pb-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search folders"
            aria-label="Search folders"
            className="w-full rounded-xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-background)] px-3.5 py-2.5 text-sm text-[var(--quant-foreground)] placeholder:text-[var(--quant-muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-1">
          {foldersLoading ? (
            <div className="px-4 py-3 text-[13px] text-[var(--quant-muted-foreground)]">
              Loading folders…
            </div>
          ) : (
            <>
              {grouped.favourites.length > 0 && (
                <>
                  <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--quant-muted-foreground)]">
                    Favourites
                  </p>
                  {grouped.favourites.map(renderFolderButton)}
                </>
              )}
              <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--quant-muted-foreground)]">
                Folders
              </p>
              {grouped.folders.length === 0 && grouped.favourites.length === 0 ? (
                <div className="px-4 py-3 text-[13px] text-[var(--quant-muted-foreground)]">
                  No folders match.
                </div>
              ) : (
                grouped.folders.map(renderFolderButton)
              )}
            </>
          )}
        </div>

        <div className="border-t border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="New folder name"
              aria-label="New folder name"
              className="min-w-0 flex-1 rounded-xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-background)] px-3.5 py-2.5 text-sm text-[var(--quant-foreground)] placeholder:text-[var(--quant-muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
            />
            <button
              type="button"
              disabled={creating || newName.trim().length === 0}
              onClick={async () => {
                const name = newName.trim();
                if (!name) return;
                setCreating(true);
                try {
                  if (await onCreateFolder(name)) setNewName('');
                } finally {
                  setCreating(false);
                }
              }}
              className="shrink-0 rounded-xl bg-[var(--quant-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {creating ? 'Creating…' : '+ Create Folder'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
