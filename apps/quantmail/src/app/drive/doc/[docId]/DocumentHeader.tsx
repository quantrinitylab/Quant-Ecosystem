// ============================================================================
// QuantDrive Document Editor — Document Header Component
// Header bar with live editable title, sync indicator, presence, and action buttons
// ============================================================================

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import type { SyncStatus, DocumentCollaborator } from './types';
import { ShareModal } from './ShareModal';

interface DocumentHeaderProps {
  docId: string;
  title: string;
  onTitleChange: (newTitle: string) => void;
  syncStatus: SyncStatus;
  lastSaved: Date | null;
  collaborators: DocumentCollaborator[];
  isPublic: boolean;
  onTogglePublic: (isPublic: boolean) => void;
  onExportMarkdown: () => void;
  onImportMarkdown: (file: File) => void;
  onDeleteDocument?: () => void;
  onDuplicateDocument?: () => void;
  fullWidth?: boolean;
  onToggleFullWidth?: () => void;
  wordCount?: number;
}

export const DocumentHeader: React.FC<DocumentHeaderProps> = ({
  docId,
  title,
  onTitleChange,
  syncStatus,
  lastSaved,
  collaborators,
  isPublic,
  onTogglePublic,
  onExportMarkdown,
  onImportMarkdown,
  onDeleteDocument,
  onDuplicateDocument,
  fullWidth,
  onToggleFullWidth,
  wordCount = 0,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [showMoreMenu, setShowMoreMenu] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportMarkdown(file);
      e.target.value = '';
    }
  };

  const readingTime = Math.ceil(wordCount / 200);

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-[#30363D] bg-[#0D1117]/95 px-4 backdrop-blur-md">
        {/* Left Cluster: Back to Drive & Breadcrumb */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/drive"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#8B949E] hover:text-[#FF8C42] hover:bg-[#161B22] transition-colors shrink-0"
            title="Back to QuantDrive"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            <span className="hidden sm:inline">← Back to Drive</span>
            <span className="sm:hidden">Drive</span>
          </Link>

          <span className="text-[#30363D] select-none">/</span>

          {/* Editable Document Title */}
          <div className="min-w-0 max-w-[180px] sm:max-w-xs md:max-w-md">
            {isEditingTitle ? (
              <input
                type="text"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                onBlur={() => setIsEditingTitle(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setIsEditingTitle(false);
                }}
                autoFocus
                className="w-full bg-[#161B22] border border-[#FF8C42] rounded px-2 py-0.5 text-xs font-semibold text-[#F0F6FC] focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingTitle(true)}
                className="truncate text-left text-xs font-semibold text-[#F0F6FC] hover:text-[#FF8C42] hover:bg-[#161B22] px-2 py-1 rounded transition-colors block w-full"
                title="Click to rename"
              >
                {title || 'Untitled Document'}
              </button>
            )}
          </div>
        </div>

        {/* Right Cluster: Sync Status, Presence, and Actions */}
        <div className="flex items-center gap-2">
          {/* Connection & Sync Status Indicator */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#161B22] border border-[#30363D] text-[11px]">
            {syncStatus === 'connected' && (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3FB950] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#3FB950]" />
                </span>
                <span className="text-[#3FB950] font-medium hidden md:inline">● Live Sync</span>
              </>
            )}
            {syncStatus === 'saving' && (
              <>
                <span className="h-2 w-2 rounded-full bg-[#D29922] animate-pulse" />
                <span className="text-[#D29922] font-medium hidden md:inline">○ Saving...</span>
              </>
            )}
            {syncStatus === 'saved' && (
              <>
                <span className="h-2 w-2 rounded-full bg-[#3FB950]" />
                <span className="text-[#8B949E] font-medium hidden md:inline">✓ Saved</span>
              </>
            )}
            {syncStatus === 'offline' && (
              <>
                <span className="h-2 w-2 rounded-full bg-[#8B949E]" />
                <span className="text-[#8B949E] font-medium hidden md:inline">Offline</span>
              </>
            )}
          </div>

          {/* Collaborator Presence Avatars */}
          {collaborators.length > 0 && (
            <div className="flex items-center -space-x-1.5 overflow-hidden px-1">
              {collaborators.slice(0, 4).map((collab) => (
                <div
                  key={collab.clientId}
                  title={`${collab.name} is actively editing`}
                  className="w-6 h-6 rounded-full border-2 border-[#0D1117] flex items-center justify-center text-[10px] font-bold text-white shadow-sm"
                  style={{ backgroundColor: collab.color }}
                >
                  {collab.name[0].toUpperCase()}
                </div>
              ))}
              {collaborators.length > 4 && (
                <div className="w-6 h-6 rounded-full border-2 border-[#0D1117] bg-[#21262D] text-[#8B949E] flex items-center justify-center text-[9px] font-semibold">
                  +{collaborators.length - 4}
                </div>
              )}
            </div>
          )}

          {/* Share Button */}
          <button
            type="button"
            onClick={() => setShowShareModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#30363D] bg-[#161B22] hover:bg-[#21262D] text-xs font-medium text-[#F0F6FC] transition-colors"
          >
            <svg
              className="w-3.5 h-3.5 text-[#FF8C42]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
            <span>Share</span>
          </button>

          {/* Export Markdown Button */}
          <button
            type="button"
            onClick={onExportMarkdown}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#30363D] bg-[#161B22] hover:bg-[#21262D] text-xs font-medium text-[#C9D1D9] hover:text-[#F0F6FC] transition-colors"
            title="Download as Markdown (.md)"
          >
            <svg
              className="w-3.5 h-3.5 text-[#8B949E]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            <span>Export MD</span>
          </button>

          {/* Hidden File Input for Import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.markdown,.txt"
            onChange={handleFileInput}
            className="hidden"
          />

          {/* More Actions Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="p-1.5 rounded-lg border border-[#30363D] bg-[#161B22] hover:bg-[#21262D] text-[#8B949E] hover:text-[#F0F6FC] transition-colors"
              title="More actions"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="6" cy="12" r="1.5" />
                <circle cx="18" cy="12" r="1.5" />
              </svg>
            </button>

            {showMoreMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-52 rounded-xl border border-[#30363D] bg-[#161B22] p-1.5 shadow-2xl z-50 space-y-1">
                <div className="px-2.5 py-1.5 border-b border-[#21262D] text-[11px] text-[#8B949E]">
                  <p>
                    {wordCount} words • {readingTime} min read
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    fileInputRef.current?.click();
                    setShowMoreMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-[#C9D1D9] hover:bg-[#21262D] hover:text-[#F0F6FC] transition-colors text-left"
                >
                  <svg
                    className="w-3.5 h-3.5 text-[#8B949E]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12"
                    />
                  </svg>
                  <span>Import Markdown...</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onExportMarkdown();
                    setShowMoreMenu(false);
                  }}
                  className="sm:hidden w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-[#C9D1D9] hover:bg-[#21262D] hover:text-[#F0F6FC] transition-colors text-left"
                >
                  <svg
                    className="w-3.5 h-3.5 text-[#8B949E]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  <span>Export Markdown</span>
                </button>

                {onToggleFullWidth && (
                  <button
                    type="button"
                    onClick={() => {
                      onToggleFullWidth();
                      setShowMoreMenu(false);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-[#C9D1D9] hover:bg-[#21262D] hover:text-[#F0F6FC] transition-colors text-left"
                  >
                    <span>Full Width</span>
                    <span className="text-[11px] text-[#8B949E]">{fullWidth ? 'On' : 'Off'}</span>
                  </button>
                )}

                {onDuplicateDocument && (
                  <button
                    type="button"
                    onClick={() => {
                      onDuplicateDocument();
                      setShowMoreMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-[#C9D1D9] hover:bg-[#21262D] hover:text-[#F0F6FC] transition-colors text-left"
                  >
                    <span>Duplicate</span>
                  </button>
                )}

                {onDeleteDocument && (
                  <div className="border-t border-[#21262D] pt-1 mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteDocument();
                        setShowMoreMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-[#F85149] hover:bg-[#F85149]/10 transition-colors text-left"
                    >
                      <span>Delete Document</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Share Modal Dialog */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        docId={docId}
        docTitle={title}
        isPublic={isPublic}
        onTogglePublic={onTogglePublic}
      />
    </>
  );
};
