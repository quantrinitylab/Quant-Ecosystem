'use client';

import { useState, useRef, useEffect } from 'react';
import { IdentityAvatar } from './IdentityAvatar';
import { showToast } from './InboxToast';
import { IconBan, IconCheck, IconFileText, IconLock } from './icons';
import type { Email } from '../types';

export interface EmailSenderHeaderProps {
  email: Email;
  onQuickReply?: () => void;
  onReactEmoji?: (emoji: string) => void;
}

export function EmailSenderHeader({ email, onQuickReply, onReactEmoji }: EmailSenderHeaderProps) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isSenderMenuOpen, setIsSenderMenuOpen] = useState(false);
  const [activeReaction, setActiveReaction] = useState<string | null>(null);

  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const senderMenuRef = useRef<HTMLDivElement>(null);

  const senderName =
    email.from?.name ||
    email.from?.email ||
    (email as any).fromName ||
    (email as any).fromAddress ||
    'Unknown Sender';
  const senderEmail = email.from?.email || (email as any).fromAddress || '';
  const recipientName =
    email.to?.[0]?.name ||
    email.to?.[0]?.email ||
    (Array.isArray((email as any).toAddresses) ? (email as any).toAddresses[0] : '') ||
    'me';

  const dateObj = email.receivedAt ? new Date(email.receivedAt) : new Date();
  const dateFormatted = dateObj.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setIsEmojiPickerOpen(false);
      }
      if (senderMenuRef.current && !senderMenuRef.current.contains(e.target as Node)) {
        setIsSenderMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Reaction emoji stay emoji: they are the payload the recipient sees attached
  // to the message, not chrome, so an SVG here would send something no other
  // client could render.
  const emojis = ['👍', '❤️', '🔥', '⚡', '🙏', '🎉', '👏', '🚀'];

  const handleEmojiSelect = (emoji: string) => {
    setActiveReaction(emoji);
    setIsEmojiPickerOpen(false);
    onReactEmoji?.(emoji);
    showToast({ text: `Reacted with ${emoji}`, type: 'success' });
  };

  return (
    <div className="flex flex-col gap-2 p-4 sm:p-5 border-b border-[#282C35]/60 bg-[#111318]/40">
      {/* Upper Line: Avatar + Name + Relative Time + Quick Actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          <IdentityAvatar name={senderName} size="lg" className="ring-2 ring-[#282C35] shrink-0" />

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <strong className="text-sm font-bold text-white truncate max-w-xs sm:max-w-md">
                {senderName}
              </strong>
              <span className="text-xs text-[#A1A4AC]">
                {dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </div>

            {/* Expandable "to me ⌵" button */}
            <button
              type="button"
              onClick={() => setIsDetailsOpen(!isDetailsOpen)}
              className="flex items-center gap-1 text-xs text-[#A1A4AC] hover:text-[#F5F5F5] text-left mt-0.5 group"
            >
              <span>to {recipientName}</span>
              <svg
                className={`size-3.5 transition-transform ${isDetailsOpen ? 'rotate-180' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>
        </div>

        {/* Right-Side Quick Actions: Emoji, Quick Reply, Message Options */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Reaction Badge if reacted */}
          {activeReaction && (
            <span className="px-2 py-0.5 rounded-full bg-[#282C35] border border-[#3A404D] text-xs">
              {activeReaction}
            </span>
          )}

          {/* Emoji Picker Button */}
          <div className="relative" ref={emojiPickerRef}>
            <button
              type="button"
              onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
              className="p-2 rounded-xl text-[#A1A4AC] hover:text-[#FFB875] hover:bg-[#282C35]/80 transition-colors"
              title="Add reaction"
            >
              <svg
                className="size-4 sm:size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
              </svg>
            </button>

            {isEmojiPickerOpen && (
              <div className="absolute right-0 mt-2 p-2 rounded-2xl border border-[#282C35] bg-[#181c26] backdrop-blur-xl shadow-2xl flex gap-1.5 z-50">
                {emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleEmojiSelect(emoji)}
                    className="p-1.5 rounded-xl hover:bg-[#282C35] text-lg transition-transform hover:scale-125"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Reply Icon */}
          <button
            type="button"
            onClick={onQuickReply}
            className="p-2 rounded-xl text-[#A1A4AC] hover:text-white hover:bg-[#282C35]/80 transition-colors"
            title="Reply"
          >
            <svg
              className="size-4 sm:size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h11a5 5 0 015 5v5" />
            </svg>
          </button>

          {/* Sender Options Menu */}
          <div className="relative" ref={senderMenuRef}>
            <button
              type="button"
              onClick={() => setIsSenderMenuOpen(!isSenderMenuOpen)}
              className="p-2 rounded-xl text-[#A1A4AC] hover:text-white hover:bg-[#282C35]/80 transition-colors"
              title="More sender options"
            >
              <svg
                className="size-4 sm:size-5"
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

            {isSenderMenuOpen && (
              <div className="absolute right-0 mt-2 w-52 rounded-2xl border border-[#282C35] bg-[#161a24] backdrop-blur-xl shadow-2xl p-1.5 z-50 text-xs text-[#F5F5F5]">
                <button
                  type="button"
                  onClick={() => {
                    setIsSenderMenuOpen(false);
                    showToast({ text: `Blocked ${senderEmail}`, type: 'info' });
                  }}
                  className="flex items-center gap-2.5 w-full min-h-[44px] px-3 py-2 rounded-xl hover:bg-[#282C35] text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                >
                  <IconBan size={14} className="shrink-0" />
                  <span>Block "{senderName}"</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSenderMenuOpen(false);
                    showToast({ text: 'Raw headers copied', type: 'success' });
                  }}
                  className="flex items-center gap-2.5 w-full min-h-[44px] px-3 py-2 rounded-xl hover:bg-[#282C35] text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                >
                  <IconFileText size={14} className="shrink-0" />
                  <span>View Original Headers</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Accordion Details Table (when "to me ⌵" is tapped) */}
      {isDetailsOpen && (
        <div className="mt-2 p-3.5 rounded-2xl border border-[#282C35] bg-[#090A0C]/80 text-xs space-y-2 text-[#A1A4AC] font-mono">
          <div className="grid grid-cols-12 gap-2">
            <span className="col-span-3 text-[#A1A4AC] font-medium">From:</span>
            <div className="col-span-9 flex items-center gap-1.5 flex-wrap">
              <span className="text-white font-semibold">{senderName}</span>
              <span className="text-[#A1A4AC]">&lt;{senderEmail}&gt;</span>
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-sans">
                <IconCheck size={11} />
                SPF/DKIM Pass
              </span>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2">
            <span className="col-span-3 text-[#A1A4AC] font-medium">To:</span>
            <div className="col-span-9 text-[#A1A4AC]">
              {email.to?.map((r) => (r.name ? `${r.name} <${r.email}>` : r.email)).join(', ') ||
                'me'}
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2">
            <span className="col-span-3 text-[#A1A4AC] font-medium">Date:</span>
            <div className="col-span-9 text-[#A1A4AC]">{dateFormatted}</div>
          </div>

          <div className="grid grid-cols-12 gap-2">
            <span className="col-span-3 text-[#A1A4AC] font-medium">Subject:</span>
            <div className="col-span-9 text-[#F5F5F5] font-sans font-semibold">
              {email.subject || '(No Subject)'}
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2 pt-1 border-t border-[#282C35]/80">
            <span className="col-span-3 text-[#A1A4AC] font-medium">Security:</span>
            <div className="col-span-9 flex items-center gap-1.5 text-cyan-400 text-[11px] font-sans">
              <IconLock size={13} className="shrink-0" />
              <span>QuantMail Quantum-Resistant E2EE (TLS 1.3 · 256-bit AES)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
