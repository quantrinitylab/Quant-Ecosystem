'use client';

/**
 * MobileFolderAndEmailActionsSuite — Batch 4 Mobile-First (390×844) Flows:
 * - Flow #28: Creating a subfolder (Folder Edit Sheet + New Folder Modal + Created Toast)
 * - Flow #30: Deleted folder & Empty Deleted state ("Nothing in Deleted")
 * - Flow #31: Deleting a folder (Move to Deleted + Permanently delete folder alert)
 * - Flow #32: Deleting an email (Email Detail delete + Inbox "Deleted | Undo" toast)
 * - Flow #33: Deleting emails permanently (Empty Folder confirmation sheet)
 * - Flow #43: Favoriting folders (Search folders & people + Golden star Favourites section)
 * - Flow #58: Marking an email as flagged (Email Detail + Flagged HUD overlay + red flag)
 * - Flow #60: Moving a folder (Move Folder sheet)
 * - Flow #61: Moving an email (15-item Email Actions Sheet + Move Conversation sheet)
 * - Flow #67: Pinning an email (Email Detail + Pinned HUD overlay + blue pin)
 * - Flow #92: Snoozing an email (Snooze modal card + Create "Snoozed" Folder alert)
 *
 * Supports both White (Light Mode) and Black (Dark Mode) 1:1.
 */

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { MobileAssignCategoryModal } from './MobileContactsAndTasksSuite';

export interface MobileFolderItem {
  id: string;
  name: string;
  icon: 'inbox' | 'archive' | 'drafts' | 'sent' | 'deleted' | 'folder' | 'junk';
  parentId: string | null;
  favorite: boolean;
  messageCount?: number;
  isCustom?: boolean;
}

export const INITIAL_MOBILE_FOLDERS: readonly MobileFolderItem[] = [
  { id: 'inbox', name: 'Inbox', icon: 'inbox', parentId: null, favorite: false, messageCount: 6 },
  { id: 'archive', name: 'Archive', icon: 'archive', parentId: null, favorite: false },
  { id: 'drafts', name: 'Drafts', icon: 'drafts', parentId: null, favorite: false, messageCount: 2 },
  { id: 'sent', name: 'Sent', icon: 'sent', parentId: null, favorite: false },
  { id: 'deleted', name: 'Deleted', icon: 'deleted', parentId: null, favorite: false, messageCount: 2 },
  { id: 'conv-history', name: 'Conversation History', icon: 'folder', parentId: null, favorite: false },
  { id: 'junk', name: 'Junk', icon: 'junk', parentId: null, favorite: false },
];

export function FolderLineIcon({
  icon,
  activeBlue = false,
}: {
  icon: MobileFolderItem['icon'];
  activeBlue?: boolean;
}) {
  const colorClass = activeBlue ? 'text-[#0078D4]' : 'text-[var(--quant-muted-foreground)]';
  switch (icon) {
    case 'inbox':
      return (
        <svg className={`size-5 ${colorClass}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect width="18" height="18" x="3" y="3" rx="3" />
          <path d="M3 13h5l2 3h4l2-3h5" />
        </svg>
      );
    case 'archive':
      return (
        <svg className={`size-5 ${colorClass}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect width="20" height="5" x="2" y="3" rx="1" />
          <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
          <path d="M10 12h4" />
        </svg>
      );
    case 'drafts':
      return (
        <svg className={`size-5 ${colorClass}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="M4 6h7M4 10h5" />
        </svg>
      );
    case 'sent':
      return (
        <svg className={`size-5 ${colorClass}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="m22 2-7 20-4-9-9-4Z" />
          <path d="M22 2 11 13" />
        </svg>
      );
    case 'deleted':
      return (
        <svg className={`size-5 ${colorClass}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          <line x1="10" x2="10" y1="11" y2="17" />
          <line x1="14" x2="14" y1="11" y2="17" />
        </svg>
      );
    case 'junk':
      return (
        <svg className={`size-5 ${colorClass}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 7v11a2 2 0 0 0 2 2h9" />
          <path d="M21 11V9a2 2 0 0 0-2-2h-7l-2-2H5a2 2 0 0 0-2 2" />
          <circle cx="18" cy="17" r="3.5" />
          <line x1="15.5" x2="20.5" y1="14.5" y2="19.5" />
        </svg>
      );
    default:
      return (
        <svg className={`size-5 ${colorClass}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
        </svg>
      );
  }
}

// ─── Shared line icons (SVG, stroke=currentColor) used across Batch 4 screens ──
export type MobileLineIconName =
  | 'move' | 'move_other' | 'flag' | 'categorise' | 'pin' | 'snooze' | 'create_task'
  | 'report_junk' | 'report_phishing' | 'block' | 'ignore' | 'print' | 'light_mode'
  | 'reply' | 'reply_all' | 'bell' | 'search' | 'mail' | 'calendar' | 'apps'
  | 'mark_unread' | 'trash' | 'archive' | 'more' | 'moon' | 'sofa' | 'next_week'
  | 'chevron_down';

const LINE_ICON_PATHS: Record<MobileLineIconName, React.ReactNode> = {
  move: (<><path d="M3 7v11a2 2 0 0 0 2 2h7" /><path d="M21 11V9a2 2 0 0 0-2-2h-7l-2-2H5a2 2 0 0 0-2 2" /><circle cx="18" cy="17" r="4" /><path d="M16.5 17h3M18.5 15.5 20 17l-1.5 1.5" /></>),
  move_other: (<><rect x="3" y="5" width="15" height="15" rx="3" /><path d="M3 14h4l2 2.5h3l2-2.5h4" /><circle cx="18" cy="6" r="4" /><path d="M16.5 6h3M18.5 4.5 20 6l-1.5 1.5" /></>),
  flag: (<><path d="M5 21V4h13l-3 4.5 3 4.5H5" /></>),
  categorise: (<><path d="M12 2H2v10l9.29 9.29a2.4 2.4 0 0 0 3.42 0l6.58-6.58a2.4 2.4 0 0 0 0-3.42Z" /><circle cx="7" cy="7" r="1.2" /></>),
  pin: (<><path d="m15 4 5 5-3 1-4 4 .5 4.5L12 20 4 12l1.5-1.5L10 11l4-4z" /><path d="m4 20 4.5-4.5" /></>),
  snooze: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5h4" /></>),
  create_task: (<><path d="m4 12 5 5L20 6" /></>),
  report_junk: (<><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></>),
  report_phishing: (<><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="M12 8v5M12 16h.01" /></>),
  block: (<><circle cx="10" cy="7" r="4" /><path d="M3 21v-1a6 6 0 0 1 9-5.2" /><circle cx="18" cy="18" r="4" /><path d="m15.2 20.8 5.6-5.6" /></>),
  ignore: (<><path d="M4 9v6h4l5 4V5L8 9z" /><path d="m17 9 4 6M21 9l-4 6" /></>),
  print: (<><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></>),
  light_mode: (<><circle cx="12" cy="12" r="9" /><path d="M12 3v18a9 9 0 0 1 0-18Z" fill="currentColor" /></>),
  reply: (<><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 6 6v5" /></>),
  reply_all: (<><path d="M7 14 2 9l5-5" /><path d="M12 14 7 9l5-5" /><path d="M7 9h8a6 6 0 0 1 6 6v5" /></>),
  bell: (<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>),
  search: (<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>),
  mail: (<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>),
  calendar: (<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>),
  apps: (<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>),
  mark_unread: (<><path d="M14 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-7" /><path d="m2 7 10 6 5-3" /><circle cx="19" cy="5" r="2.5" fill="currentColor" /></>),
  trash: (<><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M10 11v6M14 11v6" /></>),
  archive: (<><rect x="2" y="3" width="20" height="5" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></>),
  more: (<><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></>),
  moon: (<><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></>),
  sofa: (<><path d="M4 11V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3" /><path d="M2 13a2 2 0 0 1 4 0v1h12v-1a2 2 0 0 1 4 0v4H2z" /><path d="M5 17v2M19 17v2" /></>),
  next_week: (<><circle cx="12" cy="5" r="2.5" /><circle cx="5.5" cy="18" r="2.5" /><circle cx="18.5" cy="18" r="2.5" /><path d="M12 7.5v3M12 10.5 6.5 15.7M12 10.5l5.5 5.2" /></>),
  chevron_down: (<><path d="m6 9 6 6 6-6" /></>),
};

export function MobileLineIcon({
  name,
  className = 'size-5',
}: {
  name: MobileLineIconName;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {LINE_ICON_PATHS[name]}
    </svg>
  );
}

// ─── 1. FOLDER EDIT, SUBFOLDER CREATION, FAVORITING, MOVING & DELETING ────────
export function MobileFolderEditSheet({
  onClose,
}: {
  onClose: () => void;
}) {
  const [folders, setFolders] = useState<MobileFolderItem[]>(() => [...INITIAL_MOBILE_FOLDERS]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({
    inbox: true,
    deleted: true,
  });
  const [toastText, setToastText] = useState<string | null>(null);
  const [showToastUndo, setShowToastUndo] = useState(false);
  const [movingFolderId, setMovingFolderId] = useState<string | null>(null);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);

  const favoriteFolders = useMemo(() => folders.filter((f) => f.favorite), [folders]);
  const topLevelFolders = useMemo(() => folders.filter((f) => f.parentId === null), [folders]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return folders.filter((f) => f.name.toLowerCase().includes(q));
  }, [folders, searchQuery]);

  const handleToggleFavorite = (folderId: string) => {
    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, favorite: !f.favorite } : f)),
    );
  };

  const handleCreateSubfolder = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    const newItem: MobileFolderItem = {
      id: `custom-${trimmed.toLowerCase().replace(/\s+/g, '-')}`,
      name: trimmed,
      icon: 'folder',
      parentId: 'inbox',
      favorite: false,
      isCustom: true,
    };
    setFolders((prev) => [...prev, newItem]);
    setNewFolderName('');
    setShowNewFolderModal(false);
    setExpandedParents((prev) => ({ ...prev, inbox: true }));
    setToastText('Created');
    setShowToastUndo(false);
  };

  const handleMoveFolderToTarget = (targetParentId: string) => {
    if (!movingFolderId) return;
    setFolders((prev) =>
      prev.map((f) => (f.id === movingFolderId ? { ...f, parentId: targetParentId } : f)),
    );
    setExpandedParents((prev) => ({ ...prev, [targetParentId]: true }));
    setMovingFolderId(null);
    if (targetParentId === 'deleted') {
      setToastText('Deleted');
      setShowToastUndo(true);
    } else {
      setToastText('Moved');
      setShowToastUndo(false);
    }
  };

  const handleConfirmDeleteFolder = () => {
    if (!deletingFolderId) return;
    setFolders((prev) => prev.filter((f) => f.id !== deletingFolderId));
    setDeletingFolderId(null);
    setToastText('Deleted');
    setShowToastUndo(false);
  };

  // ─── FLOW #60: Move Folder Sheet ──────────────────────────────────────────
  if (movingFolderId) {
    return (
      <div
        data-testid="move-folder-sheet"
        className="fixed inset-0 z-50 flex flex-col bg-black/50 pt-4 text-[var(--quant-foreground)]"
      >
        <div className="flex flex-1 flex-col overflow-hidden rounded-t-2xl bg-[var(--quant-card)] dark:bg-[#1C1C1E]">
          {/* Header */}
          <div className="relative flex flex-col items-center border-b border-[var(--quant-border)] px-4 py-3">
            <button
              type="button"
              aria-label="Cancel move folder"
              onClick={() => setMovingFolderId(null)}
              className="absolute left-4 top-3.5 text-lg text-[var(--quant-muted-foreground)]"
            >
              ✕
            </button>
            <h2 className="text-base font-semibold text-[var(--quant-foreground)]">Move Folder</h2>
            <p className="text-xs text-[var(--quant-muted-foreground)]">
              samlee.mobbin01@quantrinity.in
            </p>
          </div>

          {/* Search bar */}
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 rounded-xl bg-[var(--quant-surface)] px-3 py-2 text-sm text-[var(--quant-muted-foreground)]">
              <MobileLineIcon name="search" className="size-4" />
              <span>Search</span>
            </div>
          </div>

          {/* Folders header + Create Folder */}
          <div className="flex items-center justify-between px-4 py-2 text-sm">
            <span className="font-medium text-[var(--quant-muted-foreground)]">Folders</span>
            <button
              type="button"
              onClick={() => setShowNewFolderModal(true)}
              className="inline-flex items-center gap-1.5 font-medium text-[#0078D4]"
            >
              <span className="text-lg leading-none">+</span>
              <span>Create Folder</span>
            </button>
          </div>

          {/* Folder Tree */}
          <div className="flex-1 overflow-y-auto px-4 py-1 space-y-1">
            {topLevelFolders.map((folder) => {
              const children = folders.filter((c) => c.parentId === folder.id);
              return (
                <div key={folder.id}>
                  <button
                    type="button"
                    data-testid={`move-folder-dest-${folder.id}`}
                    onClick={() => handleMoveFolderToTarget(folder.id)}
                    className="flex w-full items-center justify-between rounded-xl py-2.5 text-left text-sm text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
                  >
                    <div className="flex items-center gap-3.5">
                      <FolderLineIcon icon={folder.icon} />
                      <span>{folder.name}</span>
                    </div>
                    {children.length > 0 && (
                      <span className="text-xs text-[#0078D4]">⌄</span>
                    )}
                  </button>
                  {children.map((child) => (
                    <div
                      key={child.id}
                      className="flex items-center gap-3.5 py-2 pl-6 text-sm text-[var(--quant-muted-foreground)] opacity-55"
                    >
                      <FolderLineIcon icon="folder" />
                      <span>{child.name}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="mobile-folder-edit-sheet"
      className="fixed inset-0 z-50 flex flex-col bg-[#005A9E] dark:bg-black pt-3 text-[var(--quant-foreground)]"
    >
      <div className="flex flex-1 flex-col overflow-hidden rounded-t-2xl bg-[var(--quant-card)] dark:bg-[#1C1C1E]">
        {/* Top Edit Header */}
        <div className="relative flex items-center justify-center px-4 pb-2 pt-3.5">
          <h1 className="text-base font-semibold text-[var(--quant-foreground)]">Edit</h1>
          <button
            type="button"
            data-testid="folder-edit-done-btn"
            aria-label="Done editing folders"
            onClick={onClose}
            className="absolute right-4 inline-flex size-8 items-center justify-center text-lg font-medium text-[#0078D4]"
          >
            ✓
          </button>
        </div>

        {/* Search Folders & People Bar */}
        <div className="flex items-center gap-3 border-b border-[var(--quant-border)] px-4 pb-3 pt-1">
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-[var(--quant-surface)] px-3 py-2">
            <svg
              className="size-4 text-[var(--quant-muted-foreground)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              data-testid="folder-edit-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Folders & People"
              className="w-full bg-transparent text-sm text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear folder search"
                onClick={() => setSearchQuery('')}
                className="grid size-4 place-items-center rounded-full bg-[var(--quant-muted-foreground)]/40 text-[10px] text-white"
              >
                ✕
              </button>
            )}
          </div>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-sm font-medium text-[#0078D4]"
            >
              Cancel
            </button>
          )}
        </div>

        {/* Search Results Mode (Flow #43 Screen 3) */}
        {searchQuery.trim() !== '' ? (
          <div
            data-testid="folder-search-results"
            className="flex-1 overflow-y-auto divide-y divide-[var(--quant-border)] px-4"
          >
            {searchResults.map((folder) => (
              <div
                key={folder.id}
                className="flex items-center justify-between py-3"
              >
                <div className="flex items-center gap-3.5">
                  <FolderLineIcon icon={folder.icon} />
                  <div>
                    <p className="text-sm font-normal text-[var(--quant-foreground)]">
                      {folder.name}
                    </p>
                    {folder.messageCount !== undefined && folder.id === 'drafts' && (
                      <p className="text-xs text-[var(--quant-muted-foreground)]">
                        {folder.messageCount} Messages
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  data-testid={`search-favorite-star-${folder.id}`}
                  aria-label={`Favorite ${folder.name}`}
                  onClick={() => handleToggleFavorite(folder.id)}
                  className={`text-lg ${
                    folder.favorite ? 'text-[#EAB308]' : 'text-[var(--quant-muted-foreground)]'
                  }`}
                >
                  {folder.favorite ? '★' : '☆'}
                </button>
              </div>
            ))}
          </div>
        ) : (
          /* Standard Favourites + Folders List */
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {/* Favourites Section */}
            <div>
              <h2 className="text-xs font-medium text-[var(--quant-muted-foreground)]">
                Favourites
              </h2>
              {favoriteFolders.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--quant-muted-foreground)]">
                  Tap on a ☆ to add a favorite
                </p>
              ) : (
                <div data-testid="favorite-folders-list" className="mt-2 space-y-1">
                  {favoriteFolders.map((fav) => (
                    <div
                      key={`fav-${fav.id}`}
                      className="flex items-center justify-between py-2"
                    >
                      <div className="flex items-center gap-3.5">
                        <button
                          type="button"
                          onClick={() => handleToggleFavorite(fav.id)}
                          className="text-lg text-[#EAB308]"
                        >
                          ★
                        </button>
                        <FolderLineIcon icon={fav.icon} />
                        <span className="text-sm text-[var(--quant-foreground)]">{fav.name}</span>
                      </div>
                      <span className="text-base text-[var(--quant-muted-foreground)]/60">≡</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Folders Section Header + Create Folder */}
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-medium text-[var(--quant-muted-foreground)]">
                  Folders
                </h2>
                <button
                  type="button"
                  data-testid="create-folder-btn"
                  onClick={() => setShowNewFolderModal(true)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0078D4]"
                >
                  <span className="text-lg leading-none">+</span>
                  <span>Create Folder</span>
                </button>
              </div>

              <div className="mt-2 space-y-1">
                {topLevelFolders.map((folder) => {
                  const subfolders = folders.filter((c) => c.parentId === folder.id);
                  const isExpanded = Boolean(expandedParents[folder.id]);
                  return (
                    <div key={folder.id}>
                      <div className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-3.5">
                          <button
                            type="button"
                            data-testid={`favorite-folder-toggle-${folder.id}`}
                            aria-label={`Toggle favorite ${folder.name}`}
                            onClick={() => handleToggleFavorite(folder.id)}
                            className={`text-lg ${
                              folder.favorite
                                ? 'text-[#EAB308]'
                                : 'text-[var(--quant-muted-foreground)]'
                            }`}
                          >
                            {folder.favorite ? '★' : '☆'}
                          </button>
                          <FolderLineIcon icon={folder.icon} />
                          <span className="text-sm text-[var(--quant-foreground)]">
                            {folder.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          {subfolders.length > 0 && (
                            <button
                              type="button"
                              data-testid={`toggle-subfolders-${folder.id}`}
                              onClick={() =>
                                setExpandedParents((prev) => ({
                                  ...prev,
                                  [folder.id]: !prev[folder.id],
                                }))
                              }
                              className="text-xs font-bold text-[#0078D4]"
                            >
                              {isExpanded ? '⌄' : '›'}
                            </button>
                          )}
                          <span className="text-base text-[var(--quant-muted-foreground)]/60">
                            ≡
                          </span>
                        </div>
                      </div>

                      {/* Subfolders (e.g. Work under Inbox or Deleted) */}
                      {isExpanded &&
                        subfolders.map((sub) => (
                          <div
                            key={sub.id}
                            data-testid={`subfolder-row-${sub.id}`}
                            className="flex items-center justify-between py-2 pl-4"
                          >
                            <div className="flex items-center gap-3.5">
                              <button
                                type="button"
                                onClick={() => handleToggleFavorite(sub.id)}
                                className={`text-lg ${
                                  sub.favorite
                                    ? 'text-[#EAB308]'
                                    : 'text-[var(--quant-muted-foreground)]'
                                }`}
                              >
                                {sub.favorite ? '★' : '☆'}
                              </button>
                              <FolderLineIcon icon="folder" />
                              <span className="text-sm text-[var(--quant-foreground)]">
                                {sub.name}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                data-testid={`move-subfolder-btn-${sub.id}`}
                                onClick={() => setMovingFolderId(sub.id)}
                                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[#0078D4] hover:bg-[#0078D4]/10"
                              >
                                Move
                              </button>
                              <button
                                type="button"
                                data-testid={`delete-subfolder-btn-${sub.id}`}
                                onClick={() => setDeletingFolderId(sub.id)}
                                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-red-500 hover:bg-red-500/10"
                              >
                                Delete
                              </button>
                              <span className="text-base text-[var(--quant-muted-foreground)]/60">
                                ≡
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Bottom Toast Banner ("Created" or "Deleted | Undo") */}
        {toastText && (
          <div
            data-testid="folder-toast-banner"
            className="mx-3 mb-4 flex items-center justify-between rounded-xl bg-[#DCEAF7] dark:bg-[#1E293B] px-4 py-3 text-sm font-medium text-[#004578] dark:text-[#60A5FA]"
          >
            <span>{toastText}</span>
            {showToastUndo && (
              <button
                type="button"
                onClick={() => setToastText(null)}
                className="font-semibold text-[#004578] dark:text-[#60A5FA]"
              >
                Undo
              </button>
            )}
          </div>
        )}
      </div>

      {/* Centered New Folder Modal (Flow #28 Screen 2) */}
      {showNewFolderModal && (
        <div
          data-testid="new-folder-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-8"
        >
          <div className="w-full max-w-[270px] overflow-hidden rounded-2xl bg-[#F2F2F2] dark:bg-[#1C1C1E] text-center shadow-2xl">
            <div className="px-4 pb-4 pt-5">
              <h3 className="text-base font-semibold text-[var(--quant-foreground)]">New Folder</h3>
              <input
                type="text"
                data-testid="new-folder-name-input"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name"
                className="mt-3 w-full rounded-lg border border-[var(--quant-border)] bg-[var(--quant-background)] px-3 py-1.5 text-sm text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:border-[#0078D4] focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 divide-x divide-[var(--quant-border)] border-t border-[var(--quant-border)] text-sm">
              <button
                type="button"
                onClick={() => {
                  setNewFolderName('');
                  setShowNewFolderModal(false);
                }}
                className="py-3 font-medium text-[#0078D4]"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="new-folder-create-confirm"
                disabled={!newFolderName.trim()}
                onClick={handleCreateSubfolder}
                className={`py-3 font-semibold ${
                  newFolderName.trim()
                    ? 'text-[#0078D4]'
                    : 'text-[var(--quant-muted-foreground)] opacity-50'
                }`}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Centered Permanently Delete Folder Confirmation Modal (Flow #31 Screen 3) */}
      {deletingFolderId && (
        <div
          data-testid="delete-folder-confirm-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-8"
        >
          <div className="w-full max-w-[270px] overflow-hidden rounded-2xl bg-[#F2F2F2] dark:bg-[#1C1C1E] text-center shadow-2xl">
            <div className="px-5 pb-5 pt-6">
              <p className="text-sm font-semibold leading-snug text-[var(--quant-foreground)]">
                Are you sure you want to permanently delete the selected folder?
              </p>
            </div>
            <div className="grid grid-cols-2 divide-x divide-[var(--quant-border)] border-t border-[var(--quant-border)] text-sm">
              <button
                type="button"
                onClick={() => setDeletingFolderId(null)}
                className="py-3 font-semibold text-[#0078D4]"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="confirm-delete-folder-btn"
                onClick={handleConfirmDeleteFolder}
                className="py-3 font-medium text-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 2. DELETED FOLDER & EMPTY FOLDER PERMANENT DELETE (Flows #30 & #33) ─────
export function MobileDeletedFolderView({
  onGoToInbox,
}: {
  onGoToInbox: () => void;
}) {
  const [isEmptied, setIsEmptied] = useState(false);
  const [showConfirmSheet, setShowConfirmSheet] = useState(false);

  return (
    <div
      data-testid="mobile-deleted-folder-view"
      className="fixed inset-0 z-50 flex flex-col justify-between bg-[var(--quant-card)] text-[var(--quant-foreground)]"
    >
      {/* Top Deleted Header */}
      <header className="bg-[#0078D4] dark:bg-[#0B0F17] px-4 pb-3 pt-3 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="deleted-back-to-inbox-btn"
              onClick={onGoToInbox}
              className="grid size-8 place-items-center rounded-full bg-[#EC4899] text-xs font-semibold text-white"
            >
              SL
            </button>
            <h1 className="text-xl font-bold tracking-tight text-white">Deleted</h1>
          </div>
          <div className="flex items-center gap-3">
            <MobileLineIcon name="bell" className="size-5 text-white/90" />
            <MobileLineIcon name="search" className="size-5 text-white/90" />
          </div>
        </div>

        {/* Sub-bar: Empty Folder | Filter */}
        <div className="mt-3 flex items-center justify-between text-xs font-medium text-white">
          <button
            type="button"
            data-testid="empty-deleted-folder-btn"
            onClick={() => setShowConfirmSheet(true)}
            className="inline-flex items-center gap-2 hover:opacity-90"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            <span>Empty Folder</span>
          </button>

          <button type="button" className="inline-flex items-center gap-1.5">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="4" x2="20" y1="6" y2="6" />
              <line x1="7" x2="17" y1="12" y2="12" />
              <line x1="10" x2="14" y1="18" y2="18" />
            </svg>
            <span>Filter</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      {isEmptied ? (
        <div
          data-testid="deleted-folder-empty-state"
          className="flex flex-1 flex-col items-center justify-center px-6 text-center"
        >
          {/* Trash Bin with Yellow Envelope Illustration (Flow #30 Screen 1) */}
          <svg viewBox="0 0 180 180" className="size-40">
            {/* Tilted Blue Bin Lid */}
            <g transform="rotate(18 95 45)">
              <rect x="78" y="26" width="28" height="10" rx="3" fill="none" stroke="#2563EB" strokeWidth="4" />
              <rect x="52" y="36" width="80" height="8" rx="4" fill="#2563EB" />
            </g>
            {/* Yellow Envelope */}
            <g transform="rotate(-14 75 68)">
              <rect x="46" y="48" width="54" height="36" rx="3" fill="#FDE68A" />
              <path d="M46 48 L73 68 L100 48" fill="#FCD34D" />
            </g>
            {/* Turquoise Bin Body */}
            <g transform="rotate(-8 95 110)">
              <path d="M62 74 H128 L120 144 C119 149 115 152 110 152 H80 C75 152 71 149 70 144 Z" fill="#67E8F9" />
              <rect x="78" y="88" width="6" height="48" rx="3" fill="#22D3EE" />
              <rect x="92" y="88" width="6" height="48" rx="3" fill="#22D3EE" />
              <rect x="106" y="88" width="6" height="48" rx="3" fill="#22D3EE" />
            </g>
          </svg>
          <h2 className="mt-3 text-base font-semibold text-[var(--quant-foreground)]">
            Nothing in Deleted
          </h2>
          <p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">
            Looks empty over here.
          </p>
          <button
            type="button"
            data-testid="deleted-go-to-inbox-btn"
            onClick={onGoToInbox}
            className="mt-4 text-sm font-medium text-[#0078D4]"
          >
            Go to Inbox
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-[var(--quant-border)] px-4 py-2 text-xs font-medium text-[var(--quant-muted-foreground)]">
            Yesterday
          </div>
          <div className="divide-y divide-[var(--quant-border)]">
            <div className="flex items-start gap-3 px-4 py-3.5">
              <span className="grid size-10 flex-none place-items-center rounded-full bg-[#15803D] text-xs font-semibold text-white">
                A
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-[var(--quant-foreground)]">Amazon</p>
                  <span className="text-xs text-[var(--quant-muted-foreground)]">Tuesday</span>
                </div>
                <p className="text-xs text-[var(--quant-foreground)]">
                  Verify your new Amazon account
                </p>
                <p className="line-clamp-2 text-xs text-[var(--quant-muted-foreground)]">
                  Verify your new Amazon account To verify your email address, please use the followin...
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 px-4 py-3.5">
              <span className="grid size-10 flex-none place-items-center rounded-full bg-[#991B1B] text-xs font-semibold text-white">
                R
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-[var(--quant-foreground)]">
                    <span className="text-red-500">[Draft]</span> (no recipients)
                  </p>
                  <span className="text-xs text-[var(--quant-muted-foreground)]">Tuesday</span>
                </div>
                <p className="text-xs text-[var(--quant-foreground)]">Project Update</p>
                <p className="text-xs text-[var(--quant-muted-foreground)]">Get QuantMail for iOS</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Tab Bar */}
      <nav className="flex items-center justify-around border-t border-[var(--quant-border)] bg-[var(--quant-card)] py-2 text-[11px]">
        <button
          type="button"
          onClick={onGoToInbox}
          className="flex flex-col items-center gap-0.5 font-medium text-[#0078D4]"
        >
          <MobileLineIcon name="mail" />
          <span>Email</span>
        </button>
        <Link href="/calendar" className="flex flex-col items-center gap-0.5 text-[var(--quant-muted-foreground)]">
          <MobileLineIcon name="calendar" />
          <span>Calendar</span>
        </Link>
        <Link href="/contacts" className="flex flex-col items-center gap-0.5 text-[var(--quant-muted-foreground)]">
          <MobileLineIcon name="apps" />
          <span>Apps</span>
        </Link>
      </nav>

      {/* Permanently Delete Bottom Sheet (Flow #33 Screen 1) */}
      {showConfirmSheet && (
        <div
          data-testid="permanently-delete-sheet"
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/45 p-3"
        >
          <button
            type="button"
            data-testid="confirm-permanently-delete-btn"
            onClick={() => {
              setIsEmptied(true);
              setShowConfirmSheet(false);
            }}
            className="w-full rounded-2xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] py-3.5 text-center text-base font-medium text-red-500 shadow-xl"
          >
            Permanently Delete
          </button>
          <button
            type="button"
            onClick={() => setShowConfirmSheet(false)}
            className="mt-2 w-full rounded-2xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] py-3.5 text-center text-base font-semibold text-[#0078D4] shadow-xl"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 3. EMAIL DETAIL VIEW: FLAG, PIN, MOVE, SNOOZE, DELETE (Flows #32, #58, #61, #67, #92)
export function MobileEmailDetailView({
  onBack,
  onDeleteEmail,
  onOpenReply,
  onOpenPrint,
  onOpenReport,
  onOpenPhishing,
}: {
  onBack: () => void;
  onDeleteEmail: () => void;
  onOpenReply?: () => void;
  onOpenPrint?: () => void;
  onOpenReport?: () => void;
  onOpenPhishing?: () => void;
}) {
  const [flagged, setFlagged] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [hudOverlay, setHudOverlay] = useState<'flagged' | 'pinned' | null>(null);
  const [showActionsSheet, setShowActionsSheet] = useState(false);
  const [showMoveConversationSheet, setShowMoveConversationSheet] = useState(false);
  const [showSnoozeModal, setShowSnoozeModal] = useState(false);
  const [showCreateSnoozedFolderAlert, setShowCreateSnoozedFolderAlert] = useState(false);
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [assignedCategory, setAssignedCategory] = useState<string | null>(null);
  const [showCreateTaskPrompt, setShowCreateTaskPrompt] = useState(false);
  const [taskTitle, setTaskTitle] = useState('Follow-Up on Work');
  const [taskCreatedToast, setTaskCreatedToast] = useState(false);

  const actionRows = [
    { id: 'move' as MobileLineIconName, label: 'Move', icon: 'move' as MobileLineIconName },
    { id: 'move_other' as MobileLineIconName, label: 'Move to Other', icon: 'move_other' as MobileLineIconName },
    { id: 'flag' as MobileLineIconName, label: 'Flag', icon: 'flag' as MobileLineIconName },
    { id: 'categorise' as MobileLineIconName, label: 'Categorise', icon: 'categorise' as MobileLineIconName },
    { id: 'pin' as MobileLineIconName, label: 'Pin', icon: 'pin' as MobileLineIconName },
    { id: 'snooze' as MobileLineIconName, label: 'Snooze', icon: 'snooze' as MobileLineIconName },
    { id: 'create_task' as MobileLineIconName, label: 'Create a Task', icon: 'create_task' as MobileLineIconName },
    { id: 'report_junk' as MobileLineIconName, label: 'Report Junk', icon: 'report_junk' as MobileLineIconName },
    { id: 'report_phishing' as MobileLineIconName, label: 'Report Phishing', icon: 'report_phishing' as MobileLineIconName },
    { id: 'block' as MobileLineIconName, label: 'Block', icon: 'block' as MobileLineIconName },
    { id: 'ignore' as MobileLineIconName, label: 'Ignore', icon: 'ignore' as MobileLineIconName },
    { id: 'print' as MobileLineIconName, label: 'Print', icon: 'print' as MobileLineIconName },
    { id: 'light_mode' as MobileLineIconName, label: 'View in Light Mode', icon: 'light_mode' as MobileLineIconName, muted: true },
    { id: 'reply' as MobileLineIconName, label: 'Reply', icon: 'reply' as MobileLineIconName },
    { id: 'reply_all' as MobileLineIconName, label: 'Reply All', icon: 'reply_all' as MobileLineIconName, muted: true },
  ];

  const handleActionSelect = (id: string) => {
    setShowActionsSheet(false);
    if (id === 'flag') {
      setFlagged(true);
      setHudOverlay('flagged');
    } else if (id === 'pin') {
      setPinned(true);
      setHudOverlay('pinned');
    } else if (id === 'move') {
      setShowMoveConversationSheet(true);
    } else if (id === 'snooze') {
      setShowSnoozeModal(true);
    } else if (id === 'categorise') {
      setShowCategorySheet(true);
    } else if (id === 'create_task') {
      setShowCreateTaskPrompt(true);
    } else if (id === 'print' && onOpenPrint) {
      onOpenPrint();
    } else if (id === 'report_junk' && onOpenReport) {
      onOpenReport();
    } else if (id === 'report_phishing' && onOpenPhishing) {
      onOpenPhishing();
    } else if ((id === 'reply' || id === 'reply_all') && onOpenReply) {
      onOpenReply();
    }
  };

  // ─── FLOW #61 (Screen 2): Move Conversation Sheet ─────────────────────────
  if (showMoveConversationSheet) {
    return (
      <div
        data-testid="move-conversation-sheet"
        className="fixed inset-0 z-50 flex flex-col bg-black/50 pt-4 text-[var(--quant-foreground)]"
      >
        <div className="flex flex-1 flex-col overflow-hidden rounded-t-2xl bg-[var(--quant-card)] dark:bg-[#1C1C1E]">
          <div className="relative flex flex-col items-center border-b border-[var(--quant-border)] px-4 py-3">
            <button
              type="button"
              aria-label="Close Move Conversation"
              onClick={() => setShowMoveConversationSheet(false)}
              className="absolute left-4 top-3.5 text-lg text-[var(--quant-muted-foreground)]"
            >
              ✕
            </button>
            <h2 className="text-base font-semibold text-[var(--quant-foreground)]">
              Move Conversation
            </h2>
            <p className="text-xs text-[var(--quant-muted-foreground)]">
              alexsmith@quantrinity.in
            </p>
          </div>

          <div className="px-4 py-3">
            <div className="flex items-center gap-2 rounded-xl bg-[var(--quant-surface)] px-3 py-2 text-sm text-[var(--quant-muted-foreground)]">
              <MobileLineIcon name="search" className="size-4" />
              <span>Search</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 space-y-4">
            <div>
              <h3 className="text-xs font-medium text-[var(--quant-muted-foreground)]">
                Favourites
              </h3>
              <div className="mt-2 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowMoveConversationSheet(false);
                    onBack();
                  }}
                  className="flex w-full items-center gap-3.5 py-2 text-sm font-medium text-[#0078D4]"
                >
                  <FolderLineIcon icon="inbox" activeBlue />
                  <span>Inbox</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMoveConversationSheet(false);
                    onBack();
                  }}
                  className="flex w-full items-center gap-3.5 py-2 text-sm text-[var(--quant-foreground)]"
                >
                  <FolderLineIcon icon="sent" />
                  <span>Sent</span>
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-[var(--quant-muted-foreground)]">
                  Folders
                </h3>
                <span className="text-sm font-medium text-[#0078D4]">+ Create Folder</span>
              </div>
              <div className="mt-2 space-y-1">
                {[
                  { id: 'inbox', name: 'Inbox', icon: 'inbox' as const, active: true },
                  { id: 'archive', name: 'Archive', icon: 'archive' as const, active: false },
                  { id: 'sent', name: 'Sent', icon: 'sent' as const, active: false },
                  { id: 'deleted', name: 'Deleted', icon: 'deleted' as const, active: false },
                  { id: 'conv', name: 'Conversation History', icon: 'folder' as const, active: false },
                  { id: 'junk', name: 'Junk', icon: 'junk' as const, active: false },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    data-testid={`move-conv-dest-${f.id}`}
                    onClick={() => {
                      setShowMoveConversationSheet(false);
                      onBack();
                    }}
                    className={`flex w-full items-center gap-3.5 py-2.5 text-sm ${
                      f.active ? 'font-medium text-[#0078D4]' : 'text-[var(--quant-foreground)]'
                    }`}
                  >
                    <FolderLineIcon icon={f.icon} activeBlue={f.active} />
                    <span>{f.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="mobile-email-detail-view"
      className="fixed inset-0 z-50 flex flex-col justify-between bg-[var(--quant-card)] text-[var(--quant-foreground)]"
    >
      {/* Top Bar */}
      <div>
        <div className="flex items-center border-b border-[var(--quant-border)] px-4 py-3">
          <button
            type="button"
            data-testid="email-detail-back-btn"
            aria-label="Back to Inbox"
            onClick={onBack}
            className="inline-flex size-8 items-center justify-center text-[var(--quant-muted-foreground)]"
          >
            <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        </div>

        {/* Subject Bar */}
        <div className="border-b border-[var(--quant-border)] bg-[var(--quant-surface)]/40 px-4 py-3">
          <h1 className="text-base font-semibold text-[var(--quant-foreground)]">
            Follow-Up on Work
          </h1>
          {assignedCategory && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <span
                data-testid="email-detail-category-badge"
                style={{
                  backgroundColor:
                    assignedCategory.includes('Orange') ? '#F97316' :
                    assignedCategory.includes('Red') ? '#EF4444' :
                    assignedCategory.includes('Green') ? '#10B981' :
                    assignedCategory.includes('Blue') ? '#0078D4' :
                    assignedCategory.includes('Purple') ? '#8B5CF6' :
                    assignedCategory.includes('Yellow') ? '#EAB308' : '#6366F1'
                }}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white shadow-sm"
              >
                <span className="size-1.5 rounded-full bg-white/80" />
                {assignedCategory}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Message Body */}
      <div className="relative flex-1 overflow-y-auto px-4 pt-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-[#D97706] text-sm font-semibold text-white">
              A
            </span>
            <div>
              <p className="text-sm font-semibold text-[var(--quant-foreground)]">Alex</p>
              <p className="text-xs text-[var(--quant-muted-foreground)]">To You</p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 text-xs text-[var(--quant-muted-foreground)]">
            <span>{pinned ? 'Yesterday' : '25 Feb'}</span>
            <div className="flex items-center gap-2">
              {flagged && (
                <span data-testid="email-detail-flag-badge" className="text-[#E3242B]">
                  <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M5 22V3h14l-3.5 5 3.5 5H7v9z" />
                  </svg>
                </span>
              )}
              {pinned && (
                <span data-testid="email-detail-pin-badge" className="text-[#0078D4]">
                  <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="m15 3 6 6-3.5 1.2-4 4 .6 4.8L12 21 3 12l2-2 4.8.6 4-4z" />
                    <path d="m3 21 5-5" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </span>
              )}
              <button
                type="button"
                aria-label="Message header actions"
                onClick={() => setShowActionsSheet(true)}
                className="text-[var(--quant-muted-foreground)]"
              >
                <MobileLineIcon name="more" className="size-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-5 text-[15px] leading-relaxed text-[var(--quant-foreground)]">
          <p>Hi Sam,</p>
          <p>
            I wanted to follow up regarding our recent work discussion. Please let me know if you
            have any updates or if there&apos;s anything else needed from my side.
          </p>
          <p>Best regards,</p>
          <p>Alex Smith</p>
        </div>

        {/* Centered Dark Translucent HUD Overlay: Flagged (Flow #58) or Pinned (Flow #67) */}
        {hudOverlay && (
          <button
            type="button"
            data-testid={`hud-overlay-${hudOverlay}`}
            onClick={() => setHudOverlay(null)}
            className="absolute left-1/2 top-1/2 flex size-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-2.5 rounded-2xl bg-[#333333]/95 text-white shadow-2xl"
          >
            {hudOverlay === 'flagged' ? (
              <svg className="size-10 text-[#0078D4]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 15h14l-3-5 3-5H4v16" />
              </svg>
            ) : (
              <svg className="size-10 text-[#0078D4]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" x2="12" y1="17" y2="22" />
                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
              </svg>
            )}
            <span className="text-sm font-medium">
              {hudOverlay === 'flagged' ? 'Flagged' : 'Pinned'}
            </span>
          </button>
        )}
      </div>

      {/* Bottom Smart Replies + Floating Reply Pill + Tab Bar */}
      <div className="bg-[var(--quant-surface)]/50 pt-3">
        <div className="flex gap-2 overflow-x-auto px-4 pb-3">
          <button
            type="button"
            data-testid="smart-reply-chip-1"
            onClick={onOpenReply}
            className="flex-none rounded-full bg-[var(--quant-card)] px-4 py-2 text-xs font-medium text-[#0078D4] shadow-xs hover:bg-[var(--quant-card)]/80 transition-colors"
          >
            Not at this time. Thank you.
          </button>
          <button
            type="button"
            data-testid="smart-reply-chip-2"
            onClick={onOpenReply}
            className="flex-none rounded-full bg-[var(--quant-card)] px-4 py-2 text-xs font-medium text-[#0078D4] shadow-xs hover:bg-[var(--quant-card)]/80 transition-colors"
          >
            Thank you, I will let you know.
          </button>
        </div>

        {/* Floating Pill Action Bar */}
        <div className="mx-3 mb-3 flex items-center justify-between rounded-full border border-[var(--quant-border)] bg-[var(--quant-card)] px-4 py-2.5 shadow-lg">
          <button
            type="button"
            data-testid="email-detail-reply-btn"
            onClick={onOpenReply}
            className="inline-flex items-center gap-2 text-sm text-[var(--quant-muted-foreground)] hover:text-[#0078D4] transition-colors"
          >
            <MobileLineIcon name="reply" className="size-5" />
            <MobileLineIcon name="chevron_down" className="size-3.5" />
            <span>Reply</span>
          </button>

          <div className="flex items-center gap-4 text-[var(--quant-muted-foreground)]">
            <button
              type="button"
              aria-label="Mark unread"
              onClick={() => {
                setFlagged(true);
                setHudOverlay('flagged');
              }}
              data-testid="quick-trigger-flag-hud"
            >
              <MobileLineIcon name="mark_unread" className="size-[22px]" />
            </button>
            <button
              type="button"
              data-testid="email-detail-delete-btn"
              aria-label="Delete email"
              onClick={onDeleteEmail}
            >
              <MobileLineIcon name="trash" className="size-[22px]" />
            </button>
            <button
              type="button"
              aria-label="Archive or pin email"
              onClick={() => {
                setPinned(true);
                setHudOverlay('pinned');
              }}
              data-testid="quick-trigger-pin-hud"
            >
              <MobileLineIcon name="archive" className="size-[22px]" />
            </button>
            <button
              type="button"
              data-testid="email-detail-more-btn"
              aria-label="More email actions"
              onClick={() => setShowActionsSheet(true)}
            >
              <MobileLineIcon name="more" className="size-[22px]" />
            </button>
          </div>
        </div>

        {/* Bottom 3-Tab Navigation */}
        <nav className="flex items-center justify-around border-t border-[var(--quant-border)] bg-[var(--quant-card)] py-2 text-[11px]">
          <button
            type="button"
            onClick={onBack}
            className="flex flex-col items-center gap-0.5 font-medium text-[#0078D4]"
          >
            <MobileLineIcon name="mail" />
            <span>Email</span>
          </button>
          <Link href="/calendar" className="flex flex-col items-center gap-0.5 text-[var(--quant-muted-foreground)]">
            <MobileLineIcon name="calendar" />
            <span>Calendar</span>
          </Link>
          <Link href="/contacts" className="flex flex-col items-center gap-0.5 text-[var(--quant-muted-foreground)]">
            <MobileLineIcon name="apps" />
            <span>Apps</span>
          </Link>
        </nav>
      </div>

      {/* 15-Item Email Actions Bottom Sheet (Flow #61 Screen 1) */}
      {showActionsSheet && (
        <div
          data-testid="email-actions-bottom-sheet"
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 pt-6"
          onClick={() => setShowActionsSheet(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[88vh] flex-col rounded-t-2xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] px-5 pb-4 pt-2 shadow-2xl"
          >
            <div className="mx-auto h-1 w-9 rounded-full bg-[var(--quant-muted-foreground)]/30" />
            <div className="flex justify-end py-1">
              <button type="button" className="text-sm font-medium text-[#0078D4]">
                Reorder
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1">
              {actionRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  data-testid={`email-action-${row.id}`}
                  onClick={() => handleActionSelect(row.id)}
                  className={`flex w-full items-center gap-4 py-2.5 text-left text-sm ${
                    row.muted
                      ? 'text-[var(--quant-muted-foreground)] opacity-50'
                      : 'text-[var(--quant-foreground)]'
                  }`}
                >
                  <span
                    className={`grid w-6 place-items-center ${
                      row.id === 'create_task' ? 'text-[#0078D4]' : 'text-[var(--quant-muted-foreground)]'
                    }`}
                  >
                    <MobileLineIcon name={row.icon} className="size-[22px]" />
                  </span>
                  <span>{row.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Centered Snooze Modal Card (Flow #92 Screen 1) */}
      {showSnoozeModal && (
        <div
          data-testid="snooze-modal-card"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-6"
        >
          <div className="w-full max-w-[330px] overflow-hidden rounded-2xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] shadow-2xl">
            <div className="border-b border-[var(--quant-border)] py-3.5 text-center">
              <h3 className="text-base font-semibold text-[var(--quant-foreground)]">Snooze</h3>
            </div>
            <div className="divide-y divide-[var(--quant-border)]">
              {[
                { id: 'later_today', label: 'Later Today', time: '3:00 AM', icon: 'snooze' as MobileLineIconName },
                { id: 'this_evening', label: 'This Evening', time: '6:00 PM', icon: 'moon' as MobileLineIconName },
                { id: 'this_weekend', label: 'This Weekend', time: 'Sat. 10:00 AM', icon: 'sofa' as MobileLineIconName },
                { id: 'next_week', label: 'Next Week', time: 'Mon. 8:00 AM', icon: 'next_week' as MobileLineIconName },
                { id: 'choose_time', label: 'Choose a Time', time: '›', icon: 'calendar' as MobileLineIconName },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`snooze-option-${opt.id}`}
                  onClick={() => {
                    setShowSnoozeModal(false);
                    setShowCreateSnoozedFolderAlert(true);
                  }}
                  className="flex w-full items-center justify-between px-4 py-3.5 text-sm text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[#0078D4]"><MobileLineIcon name={opt.icon} className="size-[22px]" /></span>
                    <span>{opt.label}</span>
                  </div>
                  <span className="text-xs text-[var(--quant-muted-foreground)]">{opt.time}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create "Snoozed" Folder Alert (Flow #92 Screen 2) */}
      {showCreateSnoozedFolderAlert && (
        <div
          data-testid="create-snoozed-folder-alert"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-8"
        >
          <div className="w-full max-w-[270px] overflow-hidden rounded-2xl bg-[#F2F2F2] dark:bg-[#1C1C1E] text-center shadow-2xl">
            <div className="px-4 pb-4 pt-5">
              <h3 className="text-base font-semibold text-[var(--quant-foreground)]">
                Create &quot;Snoozed&quot; Folder
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
                We need a folder to store your scheduled emails
              </p>
            </div>
            <div className="divide-y divide-[var(--quant-border)] border-t border-[var(--quant-border)] text-sm">
              <button
                type="button"
                onClick={() => setShowCreateSnoozedFolderAlert(false)}
                className="w-full py-3 font-medium text-[#0078D4]"
              >
                Choose Folder
              </button>
              <button
                type="button"
                data-testid="confirm-create-snoozed-folder-btn"
                onClick={() => {
                  setShowCreateSnoozedFolderAlert(false);
                  onBack();
                }}
                className="w-full py-3 font-medium text-[#0078D4]"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowCreateSnoozedFolderAlert(false)}
                className="w-full py-3 font-semibold text-[#0078D4]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flow #25: Task Creation Prompt Sheet */}
      {showCreateTaskPrompt && (
        <div
          data-testid="create-task-sheet"
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50"
        >
          <div className="rounded-t-2xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] p-4 shadow-2xl border-t border-[var(--quant-border)]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--quant-muted-foreground)]">
                Create a Task
              </span>
              <button
                type="button"
                data-testid="close-task-sheet-btn"
                onClick={() => setShowCreateTaskPrompt(false)}
                className="text-sm text-[var(--quant-muted-foreground)]"
              >
                ✕
              </button>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)]/50 px-3 py-2">
              <span className="text-[#0078D4]">✓</span>
              <input
                type="text"
                data-testid="task-title-input"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Task title"
                className="flex-1 bg-transparent text-sm font-medium outline-none text-[var(--quant-foreground)]"
                autoFocus
              />
              <button
                type="button"
                data-testid="submit-task-btn"
                onClick={() => {
                  setShowCreateTaskPrompt(false);
                  setTaskCreatedToast(true);
                  setTimeout(() => setTaskCreatedToast(false), 4000);
                }}
                className="rounded-lg bg-[#0078D4] px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-[#006abc]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flow #25 Screen 2: Task Created Toast with View in Quant Tasks */}
      {taskCreatedToast && (
        <div
          data-testid="task-created-toast"
          className="fixed bottom-20 left-4 right-4 z-50 flex items-center justify-between rounded-xl bg-[#252525] px-4 py-3 text-sm text-white shadow-xl animate-fade-in"
        >
          <span>Task created</span>
          <button
            type="button"
            data-testid="view-in-tasks-btn"
            onClick={() => setTaskCreatedToast(false)}
            className="font-semibold text-[#0078D4] hover:underline"
          >
            View in Quant Tasks
          </button>
        </div>
      )}

      {/* Flow #14: Assign Category Modal */}
      {showCategorySheet && (
        <MobileAssignCategoryModal
          onClose={() => setShowCategorySheet(false)}
          onSaveCategories={(cats) => {
            setAssignedCategory(cats[0] || null);
            setShowCategorySheet(false);
          }}
        />
      )}
    </div>
  );
}
