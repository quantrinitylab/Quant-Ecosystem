'use client';

import { useState, useRef, useEffect } from 'react';
import { Quanty } from './Quanty';
import { showToast } from './InboxToast';

export interface EmailReaderHeaderProps {
  subject?: string;
  senderName?: string;
  senderEmail?: string;
  category?: string;
  isStarred?: boolean;
  isImportant?: boolean;
  onBack: () => void;
  onOpenQuanty: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onToggleStar: () => void;
  onToggleImportant?: () => void;
  onSnooze?: () => void;
  onMarkUnread?: () => void;
  onPrint?: () => void;
}

export function EmailReaderHeader({
  subject = '(No Subject)',
  senderName = '',
  senderEmail = '',
  category = 'Inbox',
  isStarred = false,
  isImportant = false,
  onBack,
  onOpenQuanty,
  onArchive,
  onDelete,
  onToggleStar,
  onToggleImportant,
  onSnooze,
  onMarkUnread,
  onPrint,
}: EmailReaderHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [localImportant, setLocalImportant] = useState(isImportant);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  const handleImportantToggle = () => {
    setLocalImportant(!localImportant);
    onToggleImportant?.();
    showToast({
      text: !localImportant ? 'Marked as High Priority / Important' : 'Removed from Important',
      type: !localImportant ? 'error' : 'info',
    });
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-2 px-3 sm:px-5 py-2.5 border-b border-zinc-800/90 bg-[#0c1017]/95 backdrop-blur-xl shadow-lg">
      {/* Left Section: Back Button + Title/Sender info */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
        <button
          type="button"
          onClick={onBack}
          className="p-2 -ml-1 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/80 active:scale-95 transition-all shrink-0"
          title="Back to Inbox"
          aria-label="Back to Inbox"
        >
          <svg
            className="size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Truncated Subject & Sender Subtitle */}
        <div className="flex flex-col min-w-0 flex-1 pr-1">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-xs sm:text-sm font-bold text-white truncate" title={subject}>
              {subject}
            </h1>
            {localImportant && (
              <span className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-rose-500/15 border border-rose-500/30 text-[9px] font-bold text-rose-400">
                <svg className="size-2.5 fill-current" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span>Urgent</span>
              </span>
            )}
            <span className="shrink-0 hidden md:inline-block px-2 py-0.5 rounded-full bg-blue-600/15 border border-blue-500/30 text-[9px] font-semibold text-blue-400">
              {category}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-mono truncate">
            <span className="truncate text-zinc-300 font-medium">
              {senderName || senderEmail || 'QuantMail Conversation'}
            </span>
            {senderEmail && senderName && (
              <span className="hidden lg:inline text-zinc-500 truncate">&lt;{senderEmail}&gt;</span>
            )}
          </div>
        </div>
      </div>

      {/* Right Section: Quanty AI Button + Quick Actions Bar */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {/* Quanty AI Robo Trigger */}
        <button
          type="button"
          onClick={onOpenQuanty}
          className="group relative flex items-center gap-1.5 px-2 py-1 rounded-xl text-amber-400 hover:bg-amber-500/10 transition-all cursor-pointer select-none active:scale-95"
          title="Ask Quanty AI"
        >
          <Quanty size={24} expression="happy" bob={false} />
          <span className="text-[11px] sm:text-xs font-bold text-amber-400 hidden xs:inline">
            Quanty
          </span>
        </button>

        {/* Regular Star Button */}
        <button
          type="button"
          onClick={onToggleStar}
          className={`p-2 rounded-xl transition-all active:scale-95 ${
            isStarred
              ? 'text-amber-400 bg-amber-400/10'
              : 'text-zinc-400 hover:text-amber-300 hover:bg-zinc-800/80'
          }`}
          title={isStarred ? 'Unstar (S)' : 'Star (S)'}
          aria-label="Star"
        >
          <svg
            className="size-4 sm:size-4.5"
            viewBox="0 0 24 24"
            fill={isStarred ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>

        {/* Archive Button */}
        <button
          type="button"
          onClick={onArchive}
          className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/80 active:scale-95 transition-all"
          title="Archive (E)"
          aria-label="Archive"
        >
          <svg
            className="size-4 sm:size-4.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" />
          </svg>
        </button>

        {/* Delete Button */}
        <button
          type="button"
          onClick={onDelete}
          className="p-2 rounded-xl text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 active:scale-95 transition-all"
          title="Delete (#)"
          aria-label="Delete"
        >
          <svg
            className="size-4 sm:size-4.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" />
          </svg>
        </button>

        {/* Three-Dots Menu Dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/80 active:scale-95 transition-all"
            title="More options"
            aria-label="More options"
          >
            <svg
              className="size-4 sm:size-4.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <circle cx="12" cy="12" r="1" />
              <circle cx="12" cy="5" r="1" />
              <circle cx="12" cy="19" r="1" />
            </svg>
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 sm:w-60 rounded-2xl border border-zinc-800 bg-[#161a24]/98 backdrop-blur-xl shadow-2xl p-1.5 z-50 text-xs text-zinc-200">
              {/* 🔴 RED STAR: Mark as Important (High Priority) */}
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  handleImportantToggle();
                }}
                className={`flex items-center gap-3 w-full px-3 py-2 rounded-xl text-left transition-colors font-medium ${
                  localImportant
                    ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                    : 'hover:bg-zinc-800 text-rose-300'
                }`}
              >
                <svg className="size-4 text-rose-500 fill-current" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span>{localImportant ? 'Remove from Important' : 'Mark as Important'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  showToast({ text: 'Moved to folder', type: 'info' });
                }}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-xl hover:bg-zinc-800 text-left transition-colors"
              >
                <span className="text-zinc-400">📁</span>
                <span>Move to…</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  showToast({ text: 'Labels updated', type: 'info' });
                }}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-xl hover:bg-zinc-800 text-left transition-colors"
              >
                <span className="text-zinc-400">🏷️</span>
                <span>Label as…</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onSnooze?.();
                  showToast({ text: 'Conversation snoozed', type: 'info' });
                }}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-xl hover:bg-zinc-800 text-left transition-colors"
              >
                <span className="text-zinc-400">⏰</span>
                <span>Snooze…</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  showToast({ text: 'Added to Quant Tasks & Calendar', type: 'success' });
                }}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-xl hover:bg-zinc-800 text-left transition-colors"
              >
                <span className="text-cyan-400">✔️</span>
                <span>Add to Tasks</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  showToast({ text: 'Thread muted', type: 'info' });
                }}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-xl hover:bg-zinc-800 text-left transition-colors"
              >
                <span className="text-zinc-400">🔇</span>
                <span>Mute</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onPrint ? onPrint() : window.print();
                }}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-xl hover:bg-zinc-800 text-left transition-colors"
              >
                <span className="text-zinc-400">🖨️</span>
                <span>Print</span>
              </button>

              <div className="h-px bg-zinc-800 my-1" />

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  showToast({ text: 'Reported as spam', type: 'error' });
                }}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-xl hover:bg-rose-500/15 text-rose-400 text-left transition-colors"
              >
                <span>⚠️</span>
                <span>Report spam</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
