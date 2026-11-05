'use client';

/**
 * MobileComposerAndDraftsSuite — Complete Reverse-Engineered Suite for:
 * Flow #86: Sending an email (New Message sheet, To/Cc/Bcc autocomplete, address validation alert)
 * Flow #74: Replying to an email (Action sheet, inline quick reply, full reply composer, quote toggle)
 * Flow #85: Sending a scheduled email (Schedule Send sheet, 3-column drum wheel time picker)
 * Flow #34: Drafts (Empty state with blue paper/pencil vector artwork + Populated draft list)
 * Flow #70: Quick drafts access (Stacked cards overlay over inbox + onboarding hint card)
 * Flow #87: Sent (Empty state with yellow paper airplane vector artwork + Populated sent list)
 * Flow #37: Editing text font & size (Choose font sheet with 16+ fonts, font size popover)
 * Flow #38: Editing text formatting (Format toolbar: Bold, Italic, Underline, Strikethrough, Heading styles)
 * Flow #69: Print an email (iOS print options sheet with stepper, paper size, orientation + live preview)
 * Flow #75: Reporting an email (Report a Concern sheet with 8 categories, anonymous toggle + Phishing dialog)
 * Flow #106: Uploading attachment (email) (Attach email picker sheet, preview sheet, .eml attachment chip)
 * Flow #107: Uploading attachment (file) (QuantDrive & device picker, preparing file modal, .pdf attachment chip)
 *
 * Strict Compliance:
 * - Mobile-first viewport (390×844 iOS @ 2x DPR)
 * - Dual-theme 1:1 support (White light / Black dark)
 * - Zero Competitor Naming (QuantMail, QuantWorkplace, QuantDrive, QuantNote, Quanty Meet)
 */

import React, { useState } from 'react';
import { MobileAttachmentActionSheet } from './MobileBatch8Suite';
import Link from 'next/link';

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface EmailAttachmentItem {
  id: string;
  name: string;
  size: string;
  type: 'eml' | 'pdf' | 'img' | 'file';
}

export interface DraftEmailItem {
  id: string;
  recipient: string;
  subject: string;
  preview: string;
  timestamp: string;
  dateLabel: string;
  accountEmail?: string;
}

export interface SentEmailItem {
  id: string;
  recipient: string;
  subject: string;
  preview: string;
  dateLabel: string;
}

// ─── SVG VECTOR ILLUSTRATIONS (1:1 with iOS Reference Art) ─────────────────

export function DraftsFolderEmptyIllustration({ className = 'w-48 h-48' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="draftPaperGrad" x1="40" y1="30" x2="160" y2="170" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38BDF8" stopOpacity="0.2" />
          <stop offset="1" stopColor="#0284C7" stopOpacity="0.4" />
        </linearGradient>
        <linearGradient id="pencilGrad" x1="120" y1="40" x2="180" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F59E0B" />
          <stop offset="1" stopColor="#D97706" />
        </linearGradient>
      </defs>
      {/* Soft shadow */}
      <ellipse cx="100" cy="165" rx="55" ry="12" fill="currentColor" className="text-black/10 dark:text-white/5" />
      {/* Background document */}
      <rect x="52" y="36" width="96" height="120" rx="8" fill="currentColor" className="text-[var(--quant-card)] shadow-lg" stroke="#38BDF8" strokeWidth="2.5" />
      {/* Horizontal document lines */}
      <line x1="68" y1="65" x2="110" y2="65" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" />
      <line x1="68" y1="85" x2="132" y2="85" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="4 4" />
      <line x1="68" y1="105" x2="125" y2="105" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="4 4" />
      <line x1="68" y1="125" x2="100" y2="125" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="4 4" />
      {/* Folded paper corner */}
      <path d="M124 36 L148 60 L124 60 Z" fill="#0284C7" fillOpacity="0.3" />
      {/* Angled Pencil */}
      <g transform="rotate(-35 130 95)">
        <rect x="110" y="80" width="48" height="14" rx="2" fill="url(#pencilGrad)" />
        <polygon points="110,80 96,87 110,94" fill="#FDE68A" />
        <polygon points="96,87 92,87 96,89" className="fill-slate-800" />
        <rect x="150" y="80" width="10" height="14" rx="2" fill="#F43F5E" />
        <line x1="150" y1="80" x2="150" y2="94" stroke="#CBD5E1" strokeWidth="1.5" />
      </g>
    </svg>
  );
}

export function SentFolderEmptyIllustration({ className = 'w-48 h-48' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="planeGrad" x1="60" y1="70" x2="150" y2="130" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0078D4" />
          <stop offset="1" stopColor="#0284C7" />
        </linearGradient>
      </defs>
      {/* Loop trail */}
      <path
        d="M 35 150 C 45 130, 60 115, 80 125 C 105 138, 95 170, 75 160 C 55 150, 70 100, 120 85"
        fill="none"
        stroke="#FBBF24"
        strokeWidth="2.5"
        strokeDasharray="6 6"
        strokeLinecap="round"
      />
      {/* Soft ground shadow */}
      <ellipse cx="100" cy="170" rx="50" ry="10" fill="currentColor" className="text-black/10 dark:text-white/5" />
      {/* Paper Airplane */}
      <g transform="translate(10, -5)">
        <polygon points="65,95 155,60 120,130 102,105" fill="url(#planeGrad)" />
        <polygon points="65,95 155,60 102,105" fill="#38BDF8" fillOpacity="0.85" />
        <polygon points="102,105 120,130 112,107" fill="#0369A1" />
      </g>
      {/* Star sparkles */}
      <path d="M155 45 L158 52 L165 55 L158 58 L155 65 L152 58 L145 55 L152 52 Z" fill="#F59E0B" />
      <path d="M60 80 L62 84 L66 86 L62 88 L60 92 L58 88 L54 86 L58 84 Z" fill="#38BDF8" />
    </svg>
  );
}

// ─── FLOW #86 & #74: COMPOSER SHEET & ACTIONS ───────────────────────────────

export function MobileComposerSheet({
  isOpen,
  onClose,
  initialTo = '',
  initialSubject = '',
  initialBody = '',
  isReply = false,
  replySender = '',
  quotedMessage = '',
  onSendSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialTo?: string;
  initialSubject?: string;
  initialBody?: string;
  isReply?: boolean;
  replySender?: string;
  quotedMessage?: string;
  onSendSuccess?: (summary: { to: string; subject: string; scheduled?: string }) => void;
}) {
  const [toInput, setToInput] = useState(initialTo);
  const [toChips, setToChips] = useState<string[]>(
    initialTo ? [initialTo] : ['Ms Alex Smith']
  );
  const [showRecipientDropdown, setShowRecipientDropdown] = useState(false);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [ccChips, setCcChips] = useState<string[]>(['samlee@quantmail.com']);
  const [bccChips, setBccChips] = useState<string[]>([]);
  const [subject, setSubject] = useState(
    initialSubject || (isReply ? 'Re: Follow-Up on Work' : 'Project Update')
  );
  const [bodyText, setBodyText] = useState(
    initialBody ||
      (isReply
        ? "I'm still working on it, and I'll send you the revised plan by the end of next week."
        : "Hi Alex,\n\nI wanted to share a quick update on the project. The initial draft has been completed, and I'll be reviewing it tomorrow. Once that's done, I'll send it over for your feedback.\n\nI'm also attaching a file and a picture related to the real estate materials we discussed. Please take a look and let me know your thoughts.\n\nBest regards,\nSam")
  );
  const [attachments, setAttachments] = useState<EmailAttachmentItem[]>([]);
  const [selectedAttachmentForAction, setSelectedAttachmentForAction] = useState<EmailAttachmentItem | null>(null);
  const [showQuotedMessage, setShowQuotedMessage] = useState(false);
  const [showInvalidAddressAlert, setShowInvalidAddressAlert] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [showAttachEmailModal, setShowAttachEmailModal] = useState(false);
  const [showAttachFileModal, setShowAttachFileModal] = useState(false);
  const [showScheduleSendModal, setShowScheduleSendModal] = useState(false);
  const [showFormattingSheet, setShowFormattingSheet] = useState(false);
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [currentFont, setCurrentFont] = useState('Aptos');
  const [currentFontSize, setCurrentFontSize] = useState('12 pt');
  const [currentStyle, setCurrentStyle] = useState<'Body' | 'Subhead' | 'Heading 1' | 'Title'>('Body');
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [scheduledLabel, setScheduledLabel] = useState<string | null>(null);

  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = React.useRef(0);

  const dragYRef = React.useRef(0);
  const handleDragStart = (e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
    dragYRef.current = 0;
    setIsDragging(true);
  };
  const handleDragMove = (e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - startYRef.current;
    if (dy > 0) {
      dragYRef.current = dy;
      setDragY(dy);
    }
  };
  const handleDragEnd = () => {
    setIsDragging(false);
    if (dragYRef.current > 70) {
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(15);
      onClose();
    }
    dragYRef.current = 0;
    setDragY(0);
  };

  if (!isOpen) return null;

  const handleSend = () => {
    // Check if there are invalid tokens (Flow #86 Screen 7)
    // If showCcBcc is open (which shows invalid address 'john') or To chips contain 'john', show modal alert
    const hasInvalid = showCcBcc || toChips.some((chip) => chip.toLowerCase().includes('john'));
    if (hasInvalid) {
      setShowInvalidAddressAlert(true);
      return;
    }
    executeSend();
  };

  const executeSend = () => {
    setShowInvalidAddressAlert(false);
    onSendSuccess?.({
      to: toChips.join(', '),
      subject,
      scheduled: scheduledLabel || undefined,
    });
    onClose();
  };

  return (
    <div
      data-testid="mobile-composer-sheet"
      className="fixed inset-0 z-50 flex flex-col bg-black/60 pt-2 text-[var(--quant-foreground)]"
    >
      <div
        style={{
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 200ms ease-out',
        }}
        className="flex flex-1 flex-col overflow-hidden rounded-t-3xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] shadow-2xl"
      >
        {/* iOS Grab Handle */}
        <div
          className="cursor-grab active:cursor-grabbing py-1 touch-none"
          onTouchStart={handleDragStart}
          onTouchMove={handleDragMove}
          onTouchEnd={handleDragEnd}
          onTouchCancel={handleDragEnd}
        >
          <div
            data-testid="sheet-drag-handle"
            className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 mx-auto my-2 cursor-grab"
          />
        </div>

        {/* Top Header Bar */}
        <div
          onTouchStart={handleDragStart}
          onTouchMove={handleDragMove}
          onTouchEnd={handleDragEnd}
          onTouchCancel={handleDragEnd}
          className="relative flex items-center justify-between border-b border-[var(--quant-border)] px-4 py-2 cursor-grab"
        >
          <button
            type="button"
            data-testid="composer-cancel-btn"
            onClick={onClose}
            className="text-base font-normal text-[var(--quant-foreground)]"
          >
            Cancel
          </button>
          <div className="flex flex-col items-center">
            <h2 className="text-base font-semibold text-[var(--quant-foreground)]">
              {isReply ? 'Reply' : 'New Message'}
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-[var(--quant-muted-foreground)]">
              <span className="grid size-4 place-items-center rounded-full bg-[#0078D4] text-[10px] font-bold text-white">
                SL
              </span>
              <span>samlee.mobbin01@quantmail.com</span>
              <span>▾</span>
            </div>
          </div>
          <button
            type="button"
            data-testid="composer-send-btn"
            onClick={handleSend}
            className="flex size-8 items-center justify-center rounded-full bg-[#0078D4] text-white hover:bg-[#006abc] transition-colors"
            title="Send"
          >
            <svg className="size-4 -rotate-45 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>

        {/* Composer Form Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto px-4 py-2 text-sm">
          {/* To Field */}
          <div className="relative flex flex-wrap items-center gap-1.5 border-b border-[var(--quant-border)] py-2">
            <span className="text-[var(--quant-muted-foreground)] w-8 text-sm font-medium">To:</span>
            {toChips.map((chip, idx) => (
              <span
                key={idx}
                data-testid={`to-chip-${idx}`}
                className="flex items-center gap-1 rounded-full bg-[var(--quant-border)]/60 px-2.5 py-0.5 text-xs font-medium text-[var(--quant-foreground)]"
              >
                <span>{chip}</span>
                <button
                  type="button"
                  onClick={() => setToChips(toChips.filter((_, i) => i !== idx))}
                  className="text-[var(--quant-muted-foreground)] hover:text-red-500"
                >
                  ✕
                </button>
              </span>
            ))}
            <input
              type="text"
              data-testid="composer-to-input"
              value={toInput}
              onChange={(e) => {
                setToInput(e.target.value);
                setShowRecipientDropdown(e.target.value.trim().length > 0);
              }}
              onFocus={() => {
                if (toInput.trim().length > 0) setShowRecipientDropdown(true);
              }}
              placeholder={toChips.length === 0 ? 'Type recipient email...' : ''}
              className="min-w-[120px] flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-[var(--quant-muted-foreground)]"
            />
            {!showCcBcc && (
              <button
                type="button"
                data-testid="toggle-cc-bcc-btn"
                onClick={() => setShowCcBcc(true)}
                className="text-xs font-semibold text-[#0078D4]"
              >
                Cc/Bcc
              </button>
            )}

            {/* Recipient Suggestion Dropdown (Flow #86 Screen 2 & 3) */}
            {showRecipientDropdown && (
              <div
                data-testid="recipient-suggestions-dropdown"
                className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] dark:bg-[#252528] p-2 shadow-xl"
              >
                <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--quant-muted-foreground)]">
                  Found 1 contact
                </div>
                <button
                  type="button"
                  data-testid="suggested-contact-alex"
                  onClick={() => {
                    setToChips([...toChips, 'Ms Alex Smith']);
                    setToInput('');
                    setShowRecipientDropdown(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-[var(--quant-border)]/50 transition-colors"
                >
                  <span className="grid size-8 place-items-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                    AS
                  </span>
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm text-[var(--quant-foreground)]">
                      Ms Alex Smith
                    </span>
                    <span className="text-xs text-[var(--quant-muted-foreground)]">
                      alexsmith.mobbin@quantmail.com
                    </span>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Cc / Bcc Fields (Expandable) */}
          {showCcBcc && (
            <>
              <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--quant-border)] py-2">
                <span className="text-[var(--quant-muted-foreground)] w-8 text-sm font-medium">Cc:</span>
                {ccChips.map((chip, idx) => (
                  <span
                    key={idx}
                    className="flex items-center gap-1 rounded-full bg-[var(--quant-border)]/60 px-2.5 py-0.5 text-xs font-medium"
                  >
                    <span>{chip}</span>
                    <button
                      type="button"
                      onClick={() => setCcChips(ccChips.filter((_, i) => i !== idx))}
                      className="text-[var(--quant-muted-foreground)] hover:text-red-500"
                    >
                      ✕
                    </button>
                  </span>
                ))}
                <span className="rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-xs font-medium">
                  john (invalid address test)
                </span>
                <input
                  type="text"
                  placeholder=""
                  className="min-w-[60px] flex-1 bg-transparent py-1 text-sm outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--quant-border)] py-2">
                <span className="text-[var(--quant-muted-foreground)] w-8 text-sm font-medium">Bcc:</span>
                <input
                  type="text"
                  placeholder=""
                  className="min-w-[60px] flex-1 bg-transparent py-1 text-sm outline-none"
                />
              </div>
            </>
          )}

          {/* Subject Field */}
          <div className="flex items-center gap-2 border-b border-[var(--quant-border)] py-2">
            <span className="text-[var(--quant-muted-foreground)] w-14 text-sm font-medium">Subject:</span>
            <input
              type="text"
              data-testid="composer-subject-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="flex-1 bg-transparent py-1 text-sm font-semibold outline-none text-[var(--quant-foreground)]"
            />
          </div>

          {/* Attachment Chips List (Flow #106 / #107) */}
          {attachments.length > 0 && (
            <div data-testid="composer-attachments-row" className="flex flex-wrap gap-2 py-2 border-b border-[var(--quant-border)]">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  data-testid={`attachment-chip-${att.id}`}
                  onClick={() => setSelectedAttachmentForAction(att)}
                  role="button"
                  tabIndex={0}
                  className="flex items-center gap-2 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-card)] dark:bg-[#252528] px-3 py-1.5 shadow-sm cursor-pointer hover:border-[#0078D4]"
                >
                  <span className="text-lg">
                    {att.type === 'pdf' ? '📄' : att.type === 'eml' ? '✉️' : '📎'}
                  </span>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-[var(--quant-foreground)] max-w-[150px] truncate">
                      {att.name}
                    </span>
                    <span className="text-[10px] text-[var(--quant-muted-foreground)]">
                      {att.size}
                    </span>
                  </div>
                  <button
                    type="button"
                    data-testid={`remove-attachment-${att.id}`}
                    onClick={() => setAttachments(attachments.filter((a) => a.id !== att.id))}
                    className="ml-1 text-xs text-[var(--quant-muted-foreground)] hover:text-red-500"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Main Body Text */}
          <div className="pt-3 pb-6">
            <textarea
              data-testid="composer-body-textarea"
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              rows={8}
              style={{
                fontFamily: currentFont === 'Aptos Serif' ? 'Georgia, serif' : 'inherit',
                fontSize: currentFontSize === '14 pt' ? '16px' : '14px',
                fontWeight: isBold ? 'bold' : 'normal',
                fontStyle: isItalic ? 'italic' : 'normal',
                textDecoration: isUnderline ? 'underline' : 'none',
              }}
              className="w-full resize-none bg-transparent outline-none leading-relaxed text-[var(--quant-foreground)]"
            />

            {/* Default iOS Signature */}
            <div className="mt-4 pt-2 text-xs text-[var(--quant-muted-foreground)] border-t border-[var(--quant-border)]/40">
              Get QuantMail for iOS
            </div>

            {/* Load Full Message / Quoted thread (Flow #74 Screen 4 & 5) */}
            {isReply && (
              <div className="mt-4 border-t border-[var(--quant-border)] pt-3">
                {!showQuotedMessage ? (
                  <button
                    type="button"
                    data-testid="load-full-message-btn"
                    onClick={() => setShowQuotedMessage(true)}
                    className="text-xs font-semibold text-[#0078D4] hover:underline"
                  >
                    Load full message
                  </button>
                ) : (
                  <div
                    data-testid="quoted-reply-thread"
                    className="border-l-2 border-[#0078D4] pl-3 text-xs text-[var(--quant-muted-foreground)] space-y-1 bg-[var(--quant-border)]/20 p-2.5 rounded-r-lg"
                  >
                    <div className="font-semibold text-[var(--quant-foreground)]">
                      From: Alex &lt;alexsmith.mobbin@gmail.com&gt;
                    </div>
                    <div>Sent: Wednesday, February 25, 2026 10:26 PM</div>
                    <div>To: samlee.mobbin01@quantmail.com</div>
                    <div>Subject: Follow-Up on Work</div>
                    <div className="mt-2 text-sm text-[var(--quant-foreground)]">
                      Hi Sam,<br />
                      I wanted to follow up regarding our recent work discussion. Please let me know if you have any updates or if there&apos;s anything else needed from my side.<br /><br />
                      Best regards,<br />
                      Alex Smith
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Floating Bottom iOS Composer Toolbar */}
        <div className="flex items-center justify-between border-t border-[var(--quant-border)] bg-[var(--quant-card)] dark:bg-[#1C1C1E] px-4 py-2.5">
          <div className="flex items-center gap-4 text-[var(--quant-muted-foreground)]">
            {/* Paperclip -> Attachment Action Sheet */}
            <button
              type="button"
              data-testid="composer-attach-btn"
              onClick={() => setShowAttachmentMenu(true)}
              className="p-1.5 hover:text-[#0078D4] transition-colors"
              title="Attach File"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
            </button>

            {/* Camera Button */}
            <button
              type="button"
              data-testid="composer-camera-btn"
              onClick={() => {
                setAttachments([
                  ...attachments,
                  { id: 'img-1', name: 'Real_Estate_Photo.jpg', size: '2.4 MB', type: 'img' },
                ]);
              }}
              className="p-1.5 hover:text-[#0078D4] transition-colors"
              title="Add Photo"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </button>

            {/* AI Sparkle */}
            <button
              type="button"
              data-testid="composer-ai-sparkle-btn"
              className="p-1.5 text-amber-500 hover:text-amber-400 transition-colors"
              title="AI Drafting"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L14.4 7.6L20 10L14.4 12.4L12 18L9.6 12.4L4 10L9.6 7.6L12 2Z" />
              </svg>
            </button>

            {/* Text Formatting Bar (Flow #37 / #38) */}
            <button
              type="button"
              data-testid="composer-formatting-btn"
              onClick={() => setShowFormattingSheet(!showFormattingSheet)}
              className={`p-1.5 transition-colors ${
                showFormattingSheet ? 'text-[#0078D4]' : 'hover:text-[#0078D4]'
              }`}
              title="Format Text"
            >
              <span className="font-serif text-base font-bold">A</span>
            </button>

            {/* Schedule Send (Flow #85) */}
            <button
              type="button"
              data-testid="composer-schedule-send-btn"
              onClick={() => setShowScheduleSendModal(true)}
              className="p-1.5 hover:text-[#0078D4] transition-colors"
              title="Schedule Send"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </button>
          </div>

          <div className="text-xs text-[var(--quant-muted-foreground)]">
            {scheduledLabel && (
              <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[#0078D4] font-medium">
                {scheduledLabel}
              </span>
            )}
          </div>
        </div>

        {/* Text Formatting Bar Sub-Sheet (Flow #37 & #38) */}
        {showFormattingSheet && (
          <div
            data-testid="formatting-toolbar-sheet"
            className="border-t border-[var(--quant-border)] bg-[var(--quant-card)] dark:bg-[#252528] px-4 py-3 space-y-3"
          >
            <div className="flex items-center justify-between">
              {/* Choose Font Pill */}
              <button
                type="button"
                data-testid="format-choose-font-btn"
                onClick={() => setShowFontPicker(true)}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-card)] px-3 py-1 text-xs font-semibold"
              >
                <span>{currentFont}</span>
                <span className="text-[10px] text-[var(--quant-muted-foreground)]">▾</span>
              </button>

              <span className="text-xs font-semibold text-[var(--quant-foreground)]">
                Text Format
              </span>

              {/* Font Size Pill */}
              <button
                type="button"
                data-testid="format-choose-size-btn"
                onClick={() => {
                  setCurrentFontSize(currentFontSize === '12 pt' ? '14 pt' : '12 pt');
                }}
                className="flex items-center gap-1 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-card)] px-3 py-1 text-xs font-semibold"
              >
                <span>{currentFontSize}</span>
                <span className="text-[10px] text-[var(--quant-muted-foreground)]">▾</span>
              </button>
            </div>

            {/* Quick Styling Row (Bold, Italic, Underline, Subhead) */}
            <div className="flex items-center justify-around border-t border-[var(--quant-border)]/50 pt-2 text-sm font-semibold">
              <button
                type="button"
                data-testid="format-style-pill"
                onClick={() => setCurrentStyle(currentStyle === 'Body' ? 'Subhead' : 'Body')}
                className={`px-3 py-1 rounded-lg ${
                  currentStyle === 'Subhead' ? 'bg-[#0078D4] text-white' : 'text-[var(--quant-foreground)]'
                }`}
              >
                {currentStyle}
              </button>
              <button
                type="button"
                data-testid="format-bold-btn"
                onClick={() => setIsBold(!isBold)}
                className={`size-8 rounded-lg ${isBold ? 'bg-[#0078D4] text-white' : 'text-[var(--quant-foreground)]'}`}
              >
                B
              </button>
              <button
                type="button"
                data-testid="format-italic-btn"
                onClick={() => setIsItalic(!isItalic)}
                className={`size-8 rounded-lg italic font-serif ${isItalic ? 'bg-[#0078D4] text-white' : 'text-[var(--quant-foreground)]'}`}
              >
                I
              </button>
              <button
                type="button"
                data-testid="format-underline-btn"
                onClick={() => setIsUnderline(!isUnderline)}
                className={`size-8 rounded-lg underline ${isUnderline ? 'bg-[#0078D4] text-white' : 'text-[var(--quant-foreground)]'}`}
              >
                U
              </button>
              <button
                type="button"
                className="size-8 rounded-lg line-through text-[var(--quant-foreground)]"
              >
                S
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Attachment Action Sheet (Flow #106 / #107 Screen 1) */}
      {showAttachmentMenu && (
        <div
          data-testid="attachment-action-sheet"
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/55 px-4 pb-6"
        >
          <div className="overflow-hidden rounded-2xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] shadow-2xl divide-y divide-[var(--quant-border)] text-center text-sm">
            <button
              type="button"
              data-testid="attach-file-option"
              onClick={() => {
                setShowAttachmentMenu(false);
                setShowAttachFileModal(true);
              }}
              className="w-full py-3.5 font-medium text-[#0078D4]"
            >
              Attach File
            </button>
            <button
              type="button"
              data-testid="attach-last-photo-option"
              onClick={() => {
                setShowAttachmentMenu(false);
                setAttachments([
                  ...attachments,
                  { id: 'img-last', name: 'IMG_4021.PNG', size: '1.8 MB', type: 'img' },
                ]);
              }}
              className="w-full py-3.5 font-medium text-[#0078D4]"
            >
              Use Last Photo Taken
            </button>
            <button
              type="button"
              data-testid="attach-gallery-photo-option"
              onClick={() => {
                setShowAttachmentMenu(false);
                setAttachments([
                  ...attachments,
                  { id: 'img-gal', name: 'Site_Blueprint.jpg', size: '3.1 MB', type: 'img' },
                ]);
              }}
              className="w-full py-3.5 font-medium text-[#0078D4]"
            >
              Choose Photo From Library
            </button>
            <button
              type="button"
              data-testid="attach-email-option"
              onClick={() => {
                setShowAttachmentMenu(false);
                setShowAttachEmailModal(true);
              }}
              className="w-full py-3.5 font-medium text-[#0078D4]"
            >
              Attach Email
            </button>
          </div>
          <button
            type="button"
            data-testid="attachment-cancel-btn"
            onClick={() => setShowAttachmentMenu(false)}
            className="mt-2 w-full rounded-2xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] py-3.5 text-center text-sm font-semibold text-[#0078D4]"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Attach Email Modal Sheet (Flow #106 Screen 1-3) */}
      {showAttachEmailModal && (
        <MobileAttachEmailPickerModal
          onClose={() => setShowAttachEmailModal(false)}
          onAttach={(emailAtt) => {
            setAttachments([...attachments, emailAtt]);
            setShowAttachEmailModal(false);
          }}
        />
      )}


      {/* Flow #63: Moving photo to message body (Attachment Action Sheet) */}
      {selectedAttachmentForAction && (
        <MobileAttachmentActionSheet
          isOpen={true}
          fileName={selectedAttachmentForAction.name}
          onMoveToBody={() => {
            setBodyText((prev) => `${prev}\n\n[Attached: ${selectedAttachmentForAction.name}]`);
            setAttachments(attachments.filter((a) => a.id !== selectedAttachmentForAction.id));
            setSelectedAttachmentForAction(null);
          }}
          onRemove={() => {
            setAttachments(attachments.filter((a) => a.id !== selectedAttachmentForAction.id));
            setSelectedAttachmentForAction(null);
          }}
          onClose={() => setSelectedAttachmentForAction(null)}
        />
      )}

      {/* Attach File Modal Sheet (Flow #107 Screen 2-3) */}
      {showAttachFileModal && (
        <MobileAttachFilePickerModal
          onClose={() => setShowAttachFileModal(false)}
          onAttach={(fileAtt) => {
            setAttachments([...attachments, fileAtt]);
            setShowAttachFileModal(false);
          }}
        />
      )}

      {/* Schedule Send Modal (Flow #85 Screen 1-3) */}
      {showScheduleSendModal && (
        <MobileScheduleSendModal
          onClose={() => setShowScheduleSendModal(false)}
          onScheduleSelect={(label) => {
            setScheduledLabel(label);
            setShowScheduleSendModal(false);
          }}
        />
      )}

      {/* Choose Font Sheet (Flow #37 Screen 2) */}
      {showFontPicker && (
        <MobileFontPickerSheet
          currentFont={currentFont}
          onSelect={(font) => {
            setCurrentFont(font);
            setShowFontPicker(false);
          }}
          onClose={() => setShowFontPicker(false)}
        />
      )}

      {/* Invalid Address Validation Alert Modal (Flow #86 Screen 7) */}
      {showInvalidAddressAlert && (
        <div
          data-testid="invalid-address-alert-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
        >
          <div className="w-full max-w-[320px] overflow-hidden rounded-2xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] text-center shadow-2xl">
            <div className="p-5">
              <h3 className="text-base font-semibold text-[var(--quant-foreground)]">
                Check Email Addresses
              </h3>
              <p className="mt-2 text-xs text-[var(--quant-muted-foreground)] leading-relaxed">
                There&apos;s a problem with one or more email addresses. These will be removed if you send this email. Send anyway?
              </p>
            </div>
            <div className="grid grid-cols-2 divide-x divide-[var(--quant-border)] border-t border-[var(--quant-border)] text-sm">
              <button
                type="button"
                data-testid="invalid-address-cancel-btn"
                onClick={() => setShowInvalidAddressAlert(false)}
                className="py-3 font-medium text-[#0078D4]"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="invalid-address-send-anyway-btn"
                onClick={() => {
                  setToChips(toChips.filter((c) => c.toLowerCase() !== 'john'));
                  executeSend();
                }}
                className="py-3 font-semibold text-[#0078D4]"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FLOW #106: ATTACH EMAIL PICKER MODAL & PREVIEW ─────────────────────────

export function MobileAttachEmailPickerModal({
  onClose,
  onAttach,
}: {
  onClose: () => void;
  onAttach: (item: EmailAttachmentItem) => void;
}) {
  const [activeTab, setActiveTab] = useState<'focused' | 'other'>('focused');
  const [selectedEmail, setSelectedEmail] = useState<{ id: string; subject: string; sender: string; snippet: string } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const candidateEmails = [
    {
      id: 'em-1',
      sender: 'Alex',
      subject: 'Follow-Up on Work',
      snippet: 'Hi Sam, I wanted to follow up regarding our recent work discussion. Please let me know...',
      date: 'Wednesday',
    },
    {
      id: 'em-2',
      sender: 'Amazon',
      subject: 'Verify your new Amazon account',
      snippet: 'To verify your email address, please use the following temporary verification code...',
      date: 'Tuesday',
    },
    {
      id: 'em-3',
      sender: 'Mobbin',
      subject: 'Your temporary Mobbin login code is 906748',
      snippet: 'Click the button below to log in. Or, copy and paste this temporary login code: 906748',
      date: 'Monday',
    },
  ];

  if (showPreview && selectedEmail) {
    return (
      <div
        data-testid="attach-email-preview-sheet"
        className="fixed inset-0 z-50 flex flex-col bg-[var(--quant-card)] dark:bg-[#1C1C1E] text-[var(--quant-foreground)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
          <button
            type="button"
            onClick={() => setShowPreview(false)}
            className="text-base text-[var(--quant-muted-foreground)]"
          >
            ✕
          </button>
          <h2 className="text-sm font-semibold truncate max-w-[200px]">
            {selectedEmail.subject}
          </h2>
          <button
            type="button"
            data-testid="preview-confirm-attach-btn"
            onClick={() => {
              onAttach({
                id: selectedEmail.id,
                name: `${selectedEmail.subject}.eml`,
                size: '< 1 KB',
                type: 'eml',
              });
            }}
            className="text-sm font-semibold text-[#0078D4]"
          >
            Attach
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-emerald-600 font-bold text-white">
              {selectedEmail.sender[0]}
            </span>
            <div>
              <div className="font-semibold text-sm">{selectedEmail.sender}</div>
              <div className="text-xs text-[var(--quant-muted-foreground)]">To You • Yesterday</div>
            </div>
          </div>
          <p className="text-sm leading-relaxed">{selectedEmail.snippet}</p>
          <div className="text-xs text-[var(--quant-muted-foreground)] pt-4">
            Best regards,<br />Alex Smith
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="attach-email-picker-sheet"
      className="fixed inset-0 z-50 flex flex-col bg-black/60 pt-2 text-[var(--quant-foreground)]"
    >
      <div className="flex flex-1 flex-col overflow-hidden rounded-t-3xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
          <button
            type="button"
            data-testid="attach-email-cancel-btn"
            onClick={onClose}
            className="text-base text-[var(--quant-muted-foreground)]"
          >
            ✕
          </button>
          <h2 className="text-base font-semibold">Attach Email</h2>
          <div className="w-6" />
        </div>

        {/* Tab switch (Focused / Other) */}
        <div className="flex border-b border-[var(--quant-border)] px-4">
          <button
            type="button"
            onClick={() => setActiveTab('focused')}
            className={`flex-1 py-2 text-center text-xs font-semibold border-b-2 ${
              activeTab === 'focused' ? 'border-[#0078D4] text-[#0078D4]' : 'border-transparent text-[var(--quant-muted-foreground)]'
            }`}
          >
            Focused
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('other')}
            className={`flex-1 py-2 text-center text-xs font-semibold border-b-2 ${
              activeTab === 'other' ? 'border-[#0078D4] text-[#0078D4]' : 'border-transparent text-[var(--quant-muted-foreground)]'
            }`}
          >
            Other
          </button>
        </div>

        {/* List of Emails to Attach */}
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--quant-border)]">
          {candidateEmails.map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`attachable-email-${item.id}`}
              onClick={() => setSelectedEmail(item)}
              className="flex w-full flex-col p-4 text-left hover:bg-[var(--quant-border)]/40 transition-colors"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--quant-foreground)]">{item.sender}</span>
                <span className="text-[var(--quant-muted-foreground)]">{item.date}</span>
              </div>
              <div className="mt-1 font-medium text-sm text-[var(--quant-foreground)]">{item.subject}</div>
              <div className="mt-0.5 text-xs text-[var(--quant-muted-foreground)] line-clamp-2">{item.snippet}</div>
            </button>
          ))}
        </div>

        {/* Action Sheet when email selected (Flow #106 Screen 2) */}
        {selectedEmail && (
          <div
            data-testid="selected-email-action-sheet"
            className="border-t border-[var(--quant-border)] bg-[var(--quant-card)] dark:bg-[#252528] p-4 flex gap-3"
          >
            <button
              type="button"
              data-testid="email-preview-btn"
              onClick={() => setShowPreview(true)}
              className="flex-1 rounded-xl border border-[var(--quant-border)] py-2.5 text-center text-sm font-semibold"
            >
              Preview
            </button>
            <button
              type="button"
              data-testid="email-attach-confirm-btn"
              onClick={() => {
                onAttach({
                  id: selectedEmail.id,
                  name: `${selectedEmail.subject}.eml`,
                  size: '< 1 KB',
                  type: 'eml',
                });
              }}
              className="flex-1 rounded-xl bg-[#0078D4] text-white py-2.5 text-center text-sm font-semibold"
            >
              Attach
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── FLOW #107: ATTACH FILE PICKER MODAL (QUANTDRIVE & ICLOUD) ───────────────

export function MobileAttachFilePickerModal({
  onClose,
  onAttach,
}: {
  onClose: () => void;
  onAttach: (item: EmailAttachmentItem) => void;
}) {
  const [isPreparing, setIsPreparing] = useState(false);

  const handleSelectFile = () => {
    setIsPreparing(true);
    setTimeout(() => {
      setIsPreparing(false);
      onAttach({
        id: 'file-budget',
        name: 'Budgeting Report.pdf',
        size: '110 KB',
        type: 'pdf',
      });
    }, 600);
  };

  return (
    <div
      data-testid="attach-file-picker-sheet"
      className="fixed inset-0 z-50 flex flex-col bg-black/60 pt-2 text-[var(--quant-foreground)]"
    >
      <div className="flex flex-1 flex-col overflow-hidden rounded-t-3xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
          <button
            type="button"
            data-testid="attach-file-close-btn"
            onClick={onClose}
            className="text-base text-[var(--quant-muted-foreground)]"
          >
            ✕
          </button>
          <h2 className="text-base font-semibold">Attach a File</h2>
          <div className="w-6" />
        </div>

        {/* Search */}
        <div className="p-4 border-b border-[var(--quant-border)]">
          <div className="flex items-center gap-2 rounded-xl bg-[var(--quant-border)]/40 px-3 py-2 text-xs text-[var(--quant-muted-foreground)]">
            <span>🔍</span>
            <input
              type="text"
              placeholder="Search"
              className="flex-1 bg-transparent outline-none text-xs text-[var(--quant-foreground)]"
            />
          </div>
        </div>

        {/* Folders List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--quant-muted-foreground)] mb-2">
              Suggested
            </h3>
            <div className="rounded-2xl border border-[var(--quant-border)] divide-y divide-[var(--quant-border)] overflow-hidden">
              <div className="p-3 text-xs font-bold text-[#0078D4] flex items-center gap-2 bg-[#0078D4]/10">
                <span>☁️</span>
                <span>QuantDrive • samlee.mobbin01@quantmail.com</span>
              </div>
              <button
                type="button"
                data-testid="quantdrive-my-files-btn"
                onClick={handleSelectFile}
                className="flex w-full items-center justify-between p-3.5 text-left text-sm hover:bg-[var(--quant-border)]/40"
              >
                <div className="flex items-center gap-3">
                  <span>📁</span>
                  <span className="font-medium">My Files</span>
                </div>
                <span className="text-[var(--quant-muted-foreground)]">›</span>
              </button>
              <button
                type="button"
                data-testid="quantdrive-recent-btn"
                onClick={handleSelectFile}
                className="flex w-full items-center justify-between p-3.5 text-left text-sm hover:bg-[var(--quant-border)]/40"
              >
                <div className="flex items-center gap-3">
                  <span>🕒</span>
                  <span className="font-medium">Recent</span>
                </div>
                <span className="text-[var(--quant-muted-foreground)]">›</span>
              </button>
              <button
                type="button"
                onClick={handleSelectFile}
                className="flex w-full items-center justify-between p-3.5 text-left text-sm hover:bg-[var(--quant-border)]/40"
              >
                <div className="flex items-center gap-3">
                  <span>📎</span>
                  <span className="font-medium">Email Attachments</span>
                </div>
                <span className="text-[var(--quant-muted-foreground)]">›</span>
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--quant-muted-foreground)] mb-2">
              Other Locations
            </h3>
            <div className="rounded-2xl border border-[var(--quant-border)] overflow-hidden">
              <button
                type="button"
                onClick={handleSelectFile}
                className="flex w-full items-center justify-between p-3.5 text-left text-sm hover:bg-[var(--quant-border)]/40"
              >
                <div className="flex items-center gap-3">
                  <span>📱</span>
                  <span className="font-medium">iCloud Drive &amp; Device</span>
                </div>
                <span className="text-[var(--quant-muted-foreground)]">›</span>
              </button>
            </div>
          </div>
        </div>

        {/* Preparing File Loading Overlay (Flow #107 Screen 3) */}
        {isPreparing && (
          <div
            data-testid="preparing-file-modal"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
          >
            <div className="w-full max-w-[280px] rounded-2xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] p-6 text-center shadow-2xl space-y-3">
              <div className="inline-block size-8 animate-spin rounded-full border-2 border-[#0078D4] border-t-transparent" />
              <h4 className="text-sm font-semibold text-[var(--quant-foreground)]">
                Preparing file...
              </h4>
              <p className="text-xs text-[var(--quant-muted-foreground)] leading-relaxed">
                It may take several minutes to prepare your files depending on the number selected and your network connection.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── FLOW #85: SCHEDULE SEND MODAL (DRUM WHEEL TIME PICKER) ──────────────────

export function MobileScheduleSendModal({
  onClose,
  onScheduleSelect,
}: {
  onClose: () => void;
  onScheduleSelect: (label: string) => void;
}) {
  const [viewMode, setViewMode] = useState<'options' | 'drum_wheel'>('options');
  const [selectedDate, setSelectedDate] = useState('Tomorrow');
  const [selectedHour, setSelectedHour] = useState('8');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [selectedAmPm, setSelectedAmPm] = useState<'AM' | 'PM'>('AM');

  const dateOptions = ['Wed, 25 Feb', 'Yesterday', 'Today', 'Tomorrow', 'Sun, 1 Mar', 'Mon, 2 Mar'];
  const hourOptions = ['7', '8', '9', '10', '11', '12', '1', '2'];
  const minuteOptions = ['00', '05', '10', '15', '30', '45', '50', '55'];

  if (viewMode === 'drum_wheel') {
    return (
      <div
        data-testid="schedule-send-drum-wheel-sheet"
        className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60"
      >
        <div className="rounded-t-3xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] p-4 text-[var(--quant-foreground)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--quant-border)] pb-3">
            <button
              type="button"
              onClick={() => setViewMode('options')}
              className="text-sm text-[var(--quant-muted-foreground)]"
            >
              Back
            </button>
            <h3 className="text-base font-semibold">Choose a Time</h3>
            <div className="w-8" />
          </div>

          {/* 3-Column Drum Wheel Picker */}
          <div className="grid grid-cols-3 gap-2 py-6 text-center text-sm font-medium">
            {/* Column 1: Dates */}
            <div className="flex flex-col gap-2 h-36 overflow-y-auto border-r border-[var(--quant-border)] pr-2">
              {dateOptions.map((d) => (
                <button
                  key={d}
                  type="button"
                  data-testid={`drum-date-${d.replace(/\s+/g, '-').toLowerCase()}`}
                  onClick={() => setSelectedDate(d)}
                  className={`py-1 rounded-md ${
                    selectedDate === d
                      ? 'bg-[#0078D4] text-white font-bold'
                      : 'text-[var(--quant-foreground)] opacity-70'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>

            {/* Column 2: Hours & Minutes */}
            <div className="flex flex-col gap-2 h-36 overflow-y-auto border-r border-[var(--quant-border)] px-2">
              {hourOptions.map((h) => (
                <button
                  key={h}
                  type="button"
                  data-testid={`drum-hour-${h}`}
                  onClick={() => setSelectedHour(h)}
                  className={`py-1 rounded-md ${
                    selectedHour === h
                      ? 'bg-[#0078D4] text-white font-bold'
                      : 'text-[var(--quant-foreground)] opacity-70'
                  }`}
                >
                  {h}:{selectedMinute}
                </button>
              ))}
            </div>

            {/* Column 3: AM / PM */}
            <div className="flex flex-col gap-2 justify-center px-4">
              <button
                type="button"
                data-testid="drum-ampm-am"
                onClick={() => setSelectedAmPm('AM')}
                className={`py-2 rounded-lg font-bold ${
                  selectedAmPm === 'AM' ? 'bg-[#0078D4] text-white' : 'border border-[var(--quant-border)]'
                }`}
              >
                AM
              </button>
              <button
                type="button"
                data-testid="drum-ampm-pm"
                onClick={() => setSelectedAmPm('PM')}
                className={`py-2 rounded-lg font-bold ${
                  selectedAmPm === 'PM' ? 'bg-[#0078D4] text-white' : 'border border-[var(--quant-border)]'
                }`}
              >
                PM
              </button>
            </div>
          </div>

          <button
            type="button"
            data-testid="drum-wheel-send-confirm-btn"
            onClick={() => onScheduleSelect(`${selectedDate}, ${selectedHour}:${selectedMinute} ${selectedAmPm}`)}
            className="w-full rounded-2xl bg-[#0078D4] py-3.5 text-center text-sm font-semibold text-white shadow-lg"
          >
            Send
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="schedule-send-options-sheet"
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 px-4 pb-6"
    >
      <div className="overflow-hidden rounded-2xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] shadow-2xl divide-y divide-[var(--quant-border)] text-center text-sm">
        <div className="p-3 text-xs font-semibold text-[var(--quant-muted-foreground)]">
          Schedule Send
        </div>
        <button
          type="button"
          data-testid="schedule-next-week-btn"
          onClick={() => onScheduleSelect('Mon, 8:00 AM')}
          className="flex w-full items-center justify-between px-5 py-3.5 text-sm font-medium hover:bg-[var(--quant-border)]/40"
        >
          <div className="flex flex-col text-left">
            <span className="font-semibold text-[var(--quant-foreground)]">Next Week</span>
            <span className="text-xs text-[var(--quant-muted-foreground)]">Mon, 8:00 AM</span>
          </div>
          <span className="text-[#0078D4]">›</span>
        </button>
        <button
          type="button"
          data-testid="schedule-choose-time-btn"
          onClick={() => setViewMode('drum_wheel')}
          className="flex w-full items-center justify-between px-5 py-3.5 text-sm font-medium hover:bg-[var(--quant-border)]/40"
        >
          <span className="font-semibold text-[var(--quant-foreground)]">Choose a Time</span>
          <span className="text-[#0078D4]">›</span>
        </button>
      </div>
      <button
        type="button"
        data-testid="schedule-cancel-btn"
        onClick={onClose}
        className="mt-2 w-full rounded-2xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] py-3.5 text-center text-sm font-semibold text-[#0078D4]"
      >
        Cancel
      </button>
    </div>
  );
}

// ─── FLOW #37: FONT PICKER SHEET ─────────────────────────────────────────────

export function MobileFontPickerSheet({
  currentFont,
  onSelect,
  onClose,
}: {
  currentFont: string;
  onSelect: (font: string) => void;
  onClose: () => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');

  const fonts = [
    'Aptos',
    'Aptos Black',
    'Aptos Display',
    'Aptos ExtraBold',
    'Aptos Light',
    'Aptos Mono',
    'Aptos Narrow',
    'Aptos SemiBold',
    'Aptos Serif',
    'Aptos Slab',
    'Aptos Slab Black',
    'Aptos Slab ExtraBold',
    'Aptos Slab Light',
    'Aptos Slab SemiBold',
    'Arabic Typesetting',
    'Arial',
    'Calibri',
    'Courier New',
    'Georgia',
    'Helvetica',
    'Times New Roman',
  ];

  const filtered = fonts.filter((f) =>
    f.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div
      data-testid="choose-font-sheet"
      className="fixed inset-0 z-50 flex flex-col bg-[var(--quant-card)] dark:bg-[#1C1C1E] text-[var(--quant-foreground)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
        <button
          type="button"
          data-testid="choose-font-back-btn"
          onClick={onClose}
          className="flex items-center gap-1 text-sm font-medium text-[#0078D4]"
        >
          ‹ Back
        </button>
        <h2 className="text-base font-semibold">Choose Font</h2>
        <div className="w-12" />
      </div>

      {/* Search Input */}
      <div className="p-4 border-b border-[var(--quant-border)]">
        <div className="flex items-center gap-2 rounded-xl bg-[var(--quant-border)]/40 px-3 py-2 text-xs text-[var(--quant-muted-foreground)]">
          <span>🔍</span>
          <input
            type="text"
            data-testid="search-fonts-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search fonts"
            className="flex-1 bg-transparent outline-none text-xs text-[var(--quant-foreground)]"
          />
        </div>
      </div>

      {/* Font List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[var(--quant-border)]">
        {filtered.map((font) => (
          <button
            key={font}
            type="button"
            data-testid={`font-option-${font.replace(/\s+/g, '-').toLowerCase()}`}
            onClick={() => onSelect(font)}
            className="flex w-full items-center justify-between px-5 py-3.5 text-left text-sm hover:bg-[var(--quant-border)]/40"
          >
            <span
              style={{
                fontFamily: font.includes('Serif') ? 'Georgia, serif' : font.includes('Mono') ? 'monospace' : 'inherit',
              }}
              className="text-[var(--quant-foreground)]"
            >
              {font}
            </span>
            {currentFont === font && (
              <span className="text-[#0078D4] font-bold">✓</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── FLOW #34: DRAFTS FOLDER VIEW (EMPTY STATE + DRAFTS LIST) ────────────────

export function MobileDraftsFolderView({
  onBack,
  onOpenDraft,
  onGoToInbox,
}: {
  onBack: () => void;
  onOpenDraft: (draft: DraftEmailItem) => void;
  onGoToInbox: () => void;
}) {
  const [draftsList, setDraftsList] = useState<DraftEmailItem[]>([
    {
      id: 'dr-1',
      recipient: 'support@bestbuy.com',
      subject: 'Assistance Needed: Failed Purchase Attempt',
      preview: 'Dear Best Buy Customer Support, I recently attempted to make a purchase through you...',
      timestamp: 'Tuesday',
      dateLabel: 'Yesterday',
    },
    {
      id: 'dr-2',
      recipient: 'Alex Smith and samlee',
      subject: 'Project Update',
      preview: 'Hi Alex, I wanted to share a quick update on the project. The initial draft has been compl...',
      timestamp: 'Tuesday',
      dateLabel: 'Yesterday',
    },
  ]);

  const isEmpty = draftsList.length === 0;

  return (
    <div
      data-testid="mobile-drafts-folder-view"
      className="flex h-full flex-col bg-[var(--quant-background)] text-[var(--quant-foreground)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
        <button
          type="button"
          data-testid="drafts-back-btn"
          onClick={onBack}
          className="flex items-center gap-1 text-sm font-semibold text-[#0078D4]"
        >
          ‹
        </button>
        <h1 className="text-base font-bold">Drafts</h1>
        <div className="flex items-center gap-2">
          {/* Toggle empty state button for testing */}
          <button
            type="button"
            data-testid="toggle-drafts-empty-btn"
            onClick={() => setDraftsList(isEmpty ? [
              {
                id: 'dr-1',
                recipient: 'support@bestbuy.com',
                subject: 'Assistance Needed: Failed Purchase Attempt',
                preview: 'Dear Best Buy Customer Support, I recently attempted to make a purchase through you...',
                timestamp: 'Tuesday',
                dateLabel: 'Yesterday',
              },
            ] : [])}
            className="text-[11px] font-semibold text-[var(--quant-muted-foreground)] hover:text-[#0078D4]"
          >
            {isEmpty ? 'Fill' : 'Clear'}
          </button>
        </div>
      </div>

      {/* Content */}
      {isEmpty ? (
        <div
          data-testid="drafts-empty-state"
          className="flex flex-1 flex-col items-center justify-center px-8 text-center"
        >
          <DraftsFolderEmptyIllustration className="w-44 h-44 mb-4" />
          <h2 className="text-lg font-bold text-[var(--quant-foreground)]">
            Nothing in Drafts
          </h2>
          <p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">
            Start writing something fabulous.
          </p>
          <button
            type="button"
            data-testid="drafts-go-to-inbox-btn"
            onClick={onGoToInbox}
            className="mt-6 rounded-full bg-[#0078D4] px-6 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-[#006abc] transition-colors"
          >
            Go to Inbox
          </button>
        </div>
      ) : (
        <div data-testid="drafts-list" className="flex-1 overflow-y-auto divide-y divide-[var(--quant-border)]">
          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--quant-muted-foreground)] bg-[var(--quant-border)]/20">
            Yesterday
          </div>
          {draftsList.map((draft) => (
            <button
              key={draft.id}
              type="button"
              data-testid={`draft-item-${draft.id}`}
              onClick={() => onOpenDraft(draft)}
              className="flex w-full items-start gap-3 p-4 text-left hover:bg-[var(--quant-border)]/30 transition-colors"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-500 font-bold text-white text-xs">
                SL
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-red-500">
                    [Draft] <span className="text-[var(--quant-foreground)]">{draft.recipient}</span>
                  </span>
                  <span className="text-[var(--quant-muted-foreground)]">{draft.timestamp}</span>
                </div>
                <div className="mt-0.5 text-sm font-semibold text-[var(--quant-foreground)] truncate">
                  {draft.subject}
                </div>
                <div className="mt-0.5 text-xs text-[var(--quant-muted-foreground)] line-clamp-2">
                  {draft.preview}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Bottom 3-tab bar */}
      <div className="flex items-center justify-around border-t border-[var(--quant-border)] bg-[var(--quant-card)] dark:bg-[#1C1C1E] py-2 text-xs text-[var(--quant-muted-foreground)]">
        <button type="button" onClick={onGoToInbox} className="flex flex-col items-center gap-0.5 text-[#0078D4]">
          <span className="text-base">✉️</span>
          <span className="font-semibold">Email</span>
        </button>
        <button type="button" className="flex flex-col items-center gap-0.5">
          <span className="text-base">📅</span>
          <span>Calendar</span>
        </button>
        <button type="button" className="flex flex-col items-center gap-0.5">
          <span className="text-base">⊞</span>
          <span>Apps</span>
        </button>
      </div>
    </div>
  );
}

// ─── FLOW #70: QUICK DRAFTS ACCESS (STACK CARDS OVER INBOX) ──────────────────

export function MobileQuickDraftsStack({
  isOpen,
  onClose,
  onSelectDraft,
  onTurnOff,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectDraft: (draft: DraftEmailItem) => void;
  onTurnOff: () => void;
}) {
  const [showHintCard, setShowHintCard] = useState(true);

  if (!isOpen) return null;

  const drafts: DraftEmailItem[] = [
    {
      id: 'dr-bestbuy',
      recipient: 'support@bestbuy.com',
      subject: 'Assistance Needed: Failed Purchase Attempt',
      preview: 'Dear Best Buy Customer Support, I recently attempted to make a purchase through your onl...',
      timestamp: 'Tuesday',
      dateLabel: 'Tuesday',
    },
    {
      id: 'dr-alex',
      recipient: 'alexsmith.mobbin@quantmail.com',
      subject: 'Project Update',
      preview: 'Hi Alex, I wanted to share a quick update on the project. The initial draft has been completed, an...',
      timestamp: '10:29 PM',
      dateLabel: 'Today',
    },
  ];

  return (
    <div
      data-testid="quick-drafts-access-overlay"
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 px-4 pb-6"
    >
      <div className="flex flex-col gap-3">
        {/* Draft Cards Stack */}
        <div className="flex flex-col gap-2.5">
          {drafts.map((d, i) => (
            <div
              key={d.id}
              data-testid={`quick-draft-card-${d.id}`}
              className="relative overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] dark:bg-[#1C1C1E] p-4 shadow-xl transition-transform hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-full bg-[#0078D4] text-[10px] font-bold text-white">
                    SL
                  </span>
                  <div>
                    <span className="text-xs font-semibold text-red-500">Draft </span>
                    <span className="text-xs font-semibold text-[var(--quant-foreground)]">
                      {d.recipient}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--quant-muted-foreground)]">{d.timestamp}</span>
                  <button
                    type="button"
                    onClick={onClose}
                    className="text-xs text-[var(--quant-muted-foreground)] hover:text-red-500"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSelectDraft(d)}
                className="mt-2 text-left w-full"
              >
                <div className="text-sm font-semibold text-[var(--quant-foreground)]">{d.subject}</div>
                <div className="mt-0.5 text-xs text-[var(--quant-muted-foreground)] line-clamp-2">
                  {d.preview}
                </div>
              </button>
            </div>
          ))}
        </div>

        {/* Onboarding Hint Card (Flow #70 Screen 1) */}
        {showHintCard && (
          <div
            data-testid="quick-drafts-hint-card"
            className="relative rounded-2xl bg-[var(--quant-card)] dark:bg-[#252528] p-4 border border-[var(--quant-border)] shadow-lg"
          >
            <button
              type="button"
              data-testid="quick-drafts-hint-close-btn"
              onClick={() => setShowHintCard(false)}
              className="absolute right-3.5 top-3.5 text-xs text-[var(--quant-muted-foreground)]"
            >
              ✕
            </button>
            <h4 className="text-sm font-semibold text-[var(--quant-foreground)]">
              Quick access to drafts
            </h4>
            <p className="mt-1 text-xs text-[var(--quant-muted-foreground)] leading-relaxed pr-6">
              When you close a draft, you can get back to it from here, or as usual, from your Drafts folder.
            </p>
            <button
              type="button"
              data-testid="turn-off-quick-drafts-btn"
              onClick={() => {
                setShowHintCard(false);
                onTurnOff();
              }}
              className="mt-3 text-xs font-semibold text-[#0078D4]"
            >
              Turn Off
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── FLOW #87: SENT FOLDER VIEW (EMPTY STATE + SENT LIST) ────────────────────

export function MobileSentFolderView({
  onBack,
  onGoToInbox,
}: {
  onBack: () => void;
  onGoToInbox: () => void;
}) {
  const [sentList, setSentList] = useState<SentEmailItem[]>([
    {
      id: 'st-1',
      recipient: 'Ms Alex Smith and samlee@quantmail.com',
      subject: 'Project Update',
      preview: 'Hi Alex, I wanted to share a quick update on the project. The initial draft has been compl...',
      dateLabel: 'Yesterday',
    },
    {
      id: 'st-2',
      recipient: 'support@bestbuy.com',
      subject: 'Assistance Needed: Failed Purchase Attempt',
      preview: 'Dear Best Buy Customer Support, I recently attempted to make a purchase through you...',
      dateLabel: 'Yesterday',
    },
    {
      id: 'st-3',
      recipient: 'alexsmith.mobbin@quantmail.com',
      subject: "You're invited to share this calendar",
      preview: "You'll be able to see all details of events on this calendar.",
      dateLabel: 'Thursday',
    },
  ]);

  const isEmpty = sentList.length === 0;

  return (
    <div
      data-testid="mobile-sent-folder-view"
      className="flex h-full flex-col bg-[var(--quant-background)] text-[var(--quant-foreground)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
        <button
          type="button"
          data-testid="sent-back-btn"
          onClick={onBack}
          className="flex items-center gap-1 text-sm font-semibold text-[#0078D4]"
        >
          ‹
        </button>
        <h1 className="text-base font-bold">Sent</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="toggle-sent-empty-btn"
            onClick={() => setSentList(isEmpty ? [
              {
                id: 'st-1',
                recipient: 'Ms Alex Smith',
                subject: 'Project Update',
                preview: 'Hi Alex, update completed...',
                dateLabel: 'Yesterday',
              },
            ] : [])}
            className="text-[11px] font-semibold text-[var(--quant-muted-foreground)] hover:text-[#0078D4]"
          >
            {isEmpty ? 'Fill' : 'Clear'}
          </button>
        </div>
      </div>

      {/* Content */}
      {isEmpty ? (
        <div
          data-testid="sent-empty-state"
          className="flex flex-1 flex-col items-center justify-center px-8 text-center"
        >
          <SentFolderEmptyIllustration className="w-44 h-44 mb-4" />
          <h2 className="text-lg font-bold text-[var(--quant-foreground)]">
            Nothing in Sent
          </h2>
          <p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">
            When you send messages, they&apos;ll appear here.
          </p>
          <button
            type="button"
            data-testid="sent-go-to-inbox-btn"
            onClick={onGoToInbox}
            className="mt-6 rounded-full bg-[#0078D4] px-6 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-[#006abc] transition-colors"
          >
            Go to Inbox
          </button>
        </div>
      ) : (
        <div data-testid="sent-list" className="flex-1 overflow-y-auto divide-y divide-[var(--quant-border)]">
          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--quant-muted-foreground)] bg-[var(--quant-border)]/20">
            Yesterday
          </div>
          {sentList.map((item) => (
            <div
              key={item.id}
              data-testid={`sent-item-${item.id}`}
              className="flex w-full items-start gap-3 p-4 text-left hover:bg-[var(--quant-border)]/30 transition-colors"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-600 font-bold text-white text-xs">
                {item.recipient[0] || 'M'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[var(--quant-foreground)] truncate max-w-[200px]">
                    {item.recipient}
                  </span>
                  <span className="text-[var(--quant-muted-foreground)]">{item.dateLabel}</span>
                </div>
                <div className="mt-0.5 text-sm font-semibold text-[var(--quant-foreground)] truncate">
                  {item.subject}
                </div>
                <div className="mt-0.5 text-xs text-[var(--quant-muted-foreground)] line-clamp-2">
                  {item.preview}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom 3-tab bar */}
      <div className="flex items-center justify-around border-t border-[var(--quant-border)] bg-[var(--quant-card)] dark:bg-[#1C1C1E] py-2 text-xs text-[var(--quant-muted-foreground)]">
        <button type="button" onClick={onGoToInbox} className="flex flex-col items-center gap-0.5 text-[#0078D4]">
          <span className="text-base">✉️</span>
          <span className="font-semibold">Email</span>
        </button>
        <button type="button" className="flex flex-col items-center gap-0.5">
          <span className="text-base">📅</span>
          <span>Calendar</span>
        </button>
        <button type="button" className="flex flex-col items-center gap-0.5">
          <span className="text-base">⊞</span>
          <span>Apps</span>
        </button>
      </div>
    </div>
  );
}

// ─── FLOW #69: PRINT AN EMAIL (OPTIONS SHEET & DOCUMENT PREVIEW) ─────────────

export function MobilePrintEmailSheet({
  isOpen,
  onClose,
  emailSubject = 'Follow-Up on Work',
  emailSender = 'Alex Smith',
  emailDate = 'Wed, 25 Feb 2026, 10:26 PM',
  emailBody = "Hi Sam,\n\nI wanted to follow up regarding our recent discussion. Please let me know if you have any updates or if there's anything else needed from my side.\n\nBest regards,\nAlex Smith",
}: {
  isOpen: boolean;
  onClose: () => void;
  emailSubject?: string;
  emailSender?: string;
  emailDate?: string;
  emailBody?: string;
}) {
  const [copies, setCopies] = useState(1);
  const [paperSize, setPaperSize] = useState('Letter');
  const [orientation, setOrientation] = useState<'Portrait' | 'Landscape'>('Portrait');

  if (!isOpen) return null;

  return (
    <div
      data-testid="mobile-print-email-sheet"
      className="fixed inset-0 z-50 flex flex-col bg-black/60 pt-2 text-[var(--quant-foreground)]"
    >
      <div className="flex flex-1 flex-col overflow-hidden rounded-t-3xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
          <button
            type="button"
            data-testid="print-cancel-btn"
            onClick={onClose}
            className="text-base text-[var(--quant-muted-foreground)]"
          >
            Cancel
          </button>
          <h2 className="text-base font-semibold">Print Options</h2>
          <button
            type="button"
            data-testid="print-confirm-btn"
            onClick={onClose}
            className="text-base font-semibold text-[#0078D4]"
          >
            Print
          </button>
        </div>

        {/* Options Table */}
        <div className="overflow-y-auto p-4 space-y-4">
          <div className="rounded-2xl border border-[var(--quant-border)] divide-y divide-[var(--quant-border)] overflow-hidden bg-[var(--quant-card)] text-sm">
            <div className="flex items-center justify-between p-3.5">
              <span className="font-medium text-[var(--quant-foreground)]">Printer</span>
              <span className="text-[var(--quant-muted-foreground)] text-xs">No Printer Selected ›</span>
            </div>
            <div className="flex items-center justify-between p-3.5">
              <span className="font-medium text-[var(--quant-foreground)]">Copies</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  data-testid="print-copy-minus"
                  onClick={() => setCopies(Math.max(1, copies - 1))}
                  className="size-7 rounded-full border border-[var(--quant-border)] font-bold text-sm"
                >
                  −
                </button>
                <span className="w-4 text-center font-semibold text-sm">{copies}</span>
                <button
                  type="button"
                  data-testid="print-copy-plus"
                  onClick={() => setCopies(copies + 1)}
                  className="size-7 rounded-full border border-[var(--quant-border)] font-bold text-sm"
                >
                  +
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between p-3.5">
              <span className="font-medium text-[var(--quant-foreground)]">Range</span>
              <span className="text-xs text-[var(--quant-muted-foreground)]">Page 1 ›</span>
            </div>
            <div className="flex items-center justify-between p-3.5">
              <span className="font-medium text-[var(--quant-foreground)]">Paper Size</span>
              <span className="text-xs text-[var(--quant-muted-foreground)]">{paperSize} ›</span>
            </div>
            <div className="flex items-center justify-between p-3.5">
              <span className="font-medium text-[var(--quant-foreground)]">Orientation</span>
              <span className="text-xs text-[var(--quant-muted-foreground)]">{orientation} ›</span>
            </div>
            <div className="flex items-center justify-between p-3.5">
              <span className="font-medium text-[var(--quant-foreground)]">Scaling</span>
              <span className="text-xs text-[var(--quant-muted-foreground)]">100%</span>
            </div>
            <div className="flex items-center justify-between p-3.5">
              <span className="font-medium text-[var(--quant-foreground)]">Layout</span>
              <span className="text-xs text-[var(--quant-muted-foreground)]">1 page per sheet</span>
            </div>
          </div>

          {/* Document Preview Card (Paper) */}
          <div className="flex flex-col items-center pt-2">
            <div className="text-xs font-semibold text-[var(--quant-muted-foreground)] mb-2">
              Page 1 of 1
            </div>
            <div
              data-testid="print-preview-page-card"
              className="w-full max-w-[280px] rounded-lg bg-white p-4 text-black shadow-xl border border-slate-300 font-sans text-[11px] leading-relaxed"
            >
              <div className="font-bold text-sm text-slate-900">{emailSubject}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{emailDate}</div>
              <div className="text-[10px] text-slate-700 mt-2 font-medium">From: {emailSender}</div>
              <div className="my-2 border-t border-slate-200" />
              <div className="whitespace-pre-line text-slate-800">{emailBody}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── FLOW #75: REPORTING AN EMAIL (REPORT A CONCERN + PHISHING CONFIRMATION) ─

export function MobileReportConcernSheet({
  isOpen,
  onClose,
  onSubmitReport,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmitReport: (reason: string, anonymous: boolean) => void;
}) {
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [comments, setComments] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);

  if (!isOpen) return null;

  const concernOptions = [
    'Spam',
    'Child sexual exploitation or abuse',
    'Hate speech',
    'Terrorist or violent extremist content',
    'Copyright infringment',
    'Imminent harm to persons or property',
    'Sexually inappropriate',
    'Non-consensual intimate imagery',
  ];

  return (
    <div
      data-testid="report-a-concern-sheet"
      className="fixed inset-0 z-50 flex flex-col bg-black/60 pt-2 text-[var(--quant-foreground)]"
    >
      <div className="flex flex-1 flex-col overflow-hidden rounded-t-3xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
          <button
            type="button"
            data-testid="report-cancel-btn"
            onClick={onClose}
            className="text-base text-[var(--quant-muted-foreground)]"
          >
            Cancel
          </button>
          <h2 className="text-base font-semibold">Report a Concern</h2>
          <button
            type="button"
            data-testid="report-send-btn"
            disabled={!selectedReason}
            onClick={() => onSubmitReport(selectedReason, isAnonymous)}
            className={`text-base font-semibold ${
              selectedReason ? 'text-[#0078D4]' : 'text-[var(--quant-muted-foreground)] opacity-50'
            }`}
          >
            Send
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          <div className="text-xs text-[var(--quant-muted-foreground)]">
            For reference, see <span className="text-[#0078D4] underline">Code of Conduct</span>.
          </div>

          {/* Radio Options List */}
          <div className="space-y-3">
            {concernOptions.map((opt) => (
              <label
                key={opt}
                data-testid={`report-option-${opt.replace(/\s+/g, '-').toLowerCase()}`}
                className="flex items-center gap-3 cursor-pointer py-1 text-sm font-medium"
              >
                <input
                  type="radio"
                  name="report-concern"
                  value={opt}
                  checked={selectedReason === opt}
                  onChange={() => setSelectedReason(opt)}
                  className="size-4 text-[#0078D4]"
                />
                <span className="text-[var(--quant-foreground)]">{opt}</span>
              </label>
            ))}
          </div>

          {/* Comments section (Flow #75 Screen 2 & 3) */}
          {selectedReason && (
            <div data-testid="report-comments-section" className="space-y-3 pt-3 border-t border-[var(--quant-border)]">
              <h4 className="text-xs font-semibold text-[var(--quant-foreground)]">Comments</h4>
              <p className="text-[11px] text-[var(--quant-muted-foreground)] leading-relaxed">
                Please provide as much detail as possible regarding the abuse or offensive behaviour you are reporting. Please do not provide any personal or sensitive information.
              </p>
              <textarea
                data-testid="report-comments-input"
                rows={3}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="The content involves unauthorized use of copyrighted material."
                className="w-full rounded-xl border border-[var(--quant-border)] bg-transparent p-3 text-xs outline-none focus:border-[#0078D4]"
              />

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  data-testid="report-anonymous-toggle"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="size-4 text-[#0078D4] rounded"
                />
                <span className="text-xs font-medium text-[var(--quant-foreground)]">
                  Keep my report anonymous
                </span>
              </label>

              <p className="text-[10px] text-[var(--quant-muted-foreground)] leading-relaxed pt-2">
                I agree that by clicking Send, I am submitting a copy of the offending email (including metadata) and it will be handled in accordance with the QuantWorkplace Privacy Statement.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function MobileReportPhishingDialog({
  isOpen,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div
      data-testid="report-phishing-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
    >
      <div className="w-full max-w-[320px] overflow-hidden rounded-2xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] text-center shadow-2xl">
        <div className="p-5">
          <h3 className="text-base font-semibold text-[var(--quant-foreground)]">
            Report phishing
          </h3>
          <p className="mt-2 text-xs text-[var(--quant-muted-foreground)] leading-relaxed">
            Reporting phishing scams helps keep your information and other&apos;s information safer.
          </p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-[var(--quant-border)] border-t border-[var(--quant-border)] text-sm">
          <button
            type="button"
            data-testid="report-phishing-cancel-btn"
            onClick={onClose}
            className="py-3 font-medium text-[#0078D4]"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="report-phishing-confirm-btn"
            onClick={onConfirm}
            className="py-3 font-semibold text-red-600 dark:text-red-400"
          >
            Report
          </button>
        </div>
      </div>
    </div>
  );
}
