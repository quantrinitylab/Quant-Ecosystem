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

/**
 * Shared styling for the overflow menu rows.
 *
 * Hoisted to module scope rather than repeated inline seven times: the rows are
 * identical by design — same 44px minimum height, same hover surface, same focus
 * ring — and the previous copy-paste had already drifted (some rows carried a
 * focus ring, some did not, and none of them met the touch-target floor).
 */
const MENU_ITEM_CLASS =
  'flex items-center gap-3 w-full min-h-touch px-3 py-2 rounded-xl text-left transition-colors hover:bg-[#1E2128] outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]';

const MENU_ICON_CLASS = 'size-4 flex-none text-[#A1A4AC]';

/** Stroke geometry every menu icon shares. Spread, so the paths stay the only difference. */
const MENU_ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/**
 * Shared shell for the header's icon buttons.
 *
 * These were `p-2` around a 16px glyph — a 32px hit area, well under the 44px
 * floor, which on a phone means the archive and delete targets sit four pixels
 * apart and are routinely mis-tapped. The colour treatment stays per-button.
 */
const ACTION_BUTTON_CLASS =
  'inline-flex min-h-touch min-w-touch flex-none items-center justify-center rounded-xl transition-all active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]';

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
    <header className="sticky top-0 z-30 flex items-center justify-between gap-2 px-3 sm:px-5 py-2 border-b border-[#282C35] bg-[#090A0C]/95 backdrop-blur-xl shadow-[0_4px_16px_rgba(0,0,0,0.6)]">
      {/* Left Section: Back Button + Title/Sender info */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-touch min-w-touch -ml-2 flex-none items-center justify-center rounded-xl text-[#A1A4AC] hover:text-[#F5F5F5] hover:bg-[#1E2128] active:scale-95 transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
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
            <h1 className="text-xs sm:text-sm font-bold text-[#F5F5F5] truncate" title={subject}>
              {subject}
            </h1>
            {localImportant && (
              <span className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-[10px] font-bold text-rose-400">
                <svg className="size-2.5 fill-current" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span>Urgent</span>
              </span>
            )}
            <span className="shrink-0 hidden md:inline-block px-2 py-0.5 rounded-full bg-blue-600/15 border border-blue-500/30 text-[10px] font-semibold text-blue-400">
              {category}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-[#A1A4AC] font-mono truncate">
            <span className="truncate text-[#F5F5F5] font-medium">
              {senderName || senderEmail || 'QuantMail Conversation'}
            </span>
            {senderEmail && senderName && (
              <span className="hidden lg:inline text-[#A1A4AC] truncate">
                &lt;{senderEmail}&gt;
              </span>
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
          className="group relative flex min-h-touch items-center gap-1.5 px-2 rounded-xl text-[#FF8C42] hover:bg-[#2B1A11] transition-all cursor-pointer select-none active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
          title="Ask Quanty AI"
        >
          <Quanty size={24} expression="happy" bob={false} />
          {/* `xs` is not a breakpoint in this Tailwind config, so the previous
              `xs:inline` compiled to nothing and the wordmark was hidden at every
              width — the button read as a bare avatar with no label anywhere. */}
          <span className="text-[11px] sm:text-xs font-bold hidden sm:inline">Quanty</span>
        </button>

        {/* Regular Star Button */}
        <button
          type="button"
          onClick={onToggleStar}
          className={`${ACTION_BUTTON_CLASS} ${
            isStarred
              ? 'text-[#FF8C42] bg-[#2B1A11]'
              : 'text-[#A1A4AC] hover:text-[#FF9B5A] hover:bg-[#1E2128]'
          }`}
          title={isStarred ? 'Unstar (S)' : 'Star (S)'}
          aria-label="Star"
          aria-pressed={isStarred}
        >
          <svg
            className="size-5"
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
          className={`${ACTION_BUTTON_CLASS} text-[#A1A4AC] hover:text-[#F5F5F5] hover:bg-[#1E2128]`}
          title="Archive (E)"
          aria-label="Archive"
        >
          <svg
            className="size-5"
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
          className={`${ACTION_BUTTON_CLASS} text-[#A1A4AC] hover:text-rose-400 hover:bg-rose-500/10`}
          title="Delete (#)"
          aria-label="Delete"
        >
          <svg
            className="size-5"
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
            className={`${ACTION_BUTTON_CLASS} text-[#A1A4AC] hover:text-[#F5F5F5] hover:bg-[#1E2128]`}
            title="More options"
            aria-label="More options"
            // Deliberately a disclosure, not `aria-haspopup="menu"`: the popup is a
            // plain list of buttons navigated with Tab. Claiming menu semantics
            // would make a screen reader promise arrow-key roving focus that this
            // popup does not implement — see `EmailSnooze` for the version that does.
            aria-expanded={isMenuOpen}
          >
            <svg
              className="size-5"
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
            <div className="absolute right-0 mt-2 w-56 sm:w-60 rounded-2xl border border-[#282C35] bg-[#16181D]/98 backdrop-blur-xl shadow-[0_4px_16px_rgba(0,0,0,0.6)] p-1.5 z-50 text-xs text-[#F5F5F5]">
              {/* Mark as Important — the one destructive-adjacent item, so it keeps
                  its own rose treatment rather than the neutral row styling. */}
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  handleImportantToggle();
                }}
                className={`flex items-center gap-3 w-full min-h-touch px-3 py-2 rounded-xl text-left transition-colors font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                  localImportant
                    ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                    : 'hover:bg-[#1E2128] text-rose-300'
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
                className={MENU_ITEM_CLASS}
              >
                <svg className={MENU_ICON_CLASS} viewBox="0 0 24 24" {...MENU_ICON_PROPS}>
                  <path d="M4 20h16a2 2 0 002-2V9a2 2 0 00-2-2h-7.5L10 4H4a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Move to…</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  showToast({ text: 'Labels updated', type: 'info' });
                }}
                className={MENU_ITEM_CLASS}
              >
                <svg className={MENU_ICON_CLASS} viewBox="0 0 24 24" {...MENU_ICON_PROPS}>
                  <path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0l-7.2-7.2A2 2 0 013 12V5a2 2 0 012-2h7a2 2 0 011.4.6l7.2 7.2a2 2 0 010 2.6z" />
                  <circle cx="7.6" cy="7.6" r="1.1" />
                </svg>
                <span>Label as…</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onSnooze?.();
                  showToast({ text: 'Conversation snoozed', type: 'info' });
                }}
                className={MENU_ITEM_CLASS}
              >
                <svg className={MENU_ICON_CLASS} viewBox="0 0 24 24" {...MENU_ICON_PROPS}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3.5 2" />
                </svg>
                <span>Snooze…</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  showToast({ text: 'Added to Quant Tasks & Calendar', type: 'success' });
                }}
                className={MENU_ITEM_CLASS}
              >
                <svg
                  className="size-4 flex-none text-cyan-400"
                  viewBox="0 0 24 24"
                  {...MENU_ICON_PROPS}
                >
                  <path d="M9 11.5l3 3 6-6" />
                  <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                </svg>
                <span>Add to Tasks</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  showToast({ text: 'Thread muted', type: 'info' });
                }}
                className={MENU_ITEM_CLASS}
              >
                <svg className={MENU_ICON_CLASS} viewBox="0 0 24 24" {...MENU_ICON_PROPS}>
                  <path d="M13.7 21a2 2 0 01-3.4 0" />
                  <path d="M18 8a6 6 0 00-9.3-5" />
                  <path d="M6.3 6.3A6 6 0 006 8c0 7-3 9-3 9h13" />
                  <path d="M3 3l18 18" />
                </svg>
                <span>Mute</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  if (onPrint) onPrint();
                  else window.print();
                }}
                className={MENU_ITEM_CLASS}
              >
                <svg className={MENU_ICON_CLASS} viewBox="0 0 24 24" {...MENU_ICON_PROPS}>
                  <path d="M6 9V3h12v6" />
                  <path d="M6 18H4a2 2 0 01-2-2v-3a2 2 0 012-2h16a2 2 0 012 2v3a2 2 0 01-2 2h-2" />
                  <path d="M6 14h12v7H6z" />
                </svg>
                <span>Print</span>
              </button>

              <div className="h-px bg-[#282C35] my-1" />

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  showToast({ text: 'Reported as spam', type: 'error' });
                }}
                className="flex items-center gap-3 w-full min-h-touch px-3 py-2 rounded-xl hover:bg-rose-500/15 text-rose-400 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
              >
                <svg
                  className="size-4 flex-none text-rose-400"
                  viewBox="0 0 24 24"
                  {...MENU_ICON_PROPS}
                >
                  <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0z" />
                  <path d="M12 9.5v4M12 17h.01" />
                </svg>
                <span>Report spam</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
