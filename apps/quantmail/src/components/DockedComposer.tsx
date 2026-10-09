'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { formatBytes } from '../lib/format-bytes';
import { showToast } from './InboxToast';
import { useContacts } from '../hooks/useContacts';
import { useConfirm } from '../hooks/useConfirm';
import { apiClient } from '../services/api-client';
import { useUndoSend } from './UndoSendCountdownBar';
import { useDraftAutosave, draftSaveStateLabel } from './useDraftAutosave';
import { apiFetchRaw } from '@quant/api-client';
import { composeMessageBodies } from '../lib/email-body';
import { loadDefaultSignatureHtml } from '../lib/email-signature-preference';
import type { Attachment } from './EmailComposer';

/**
 * Superhuman/Gmail-class floating bottom-right docked composer widget.
 *
 * Invariants:
 * - Fixed: bottom-4 right-6 z-40 w-[540px] max-w-[calc(100vw-32px)] rounded-2xl border border-[#232938] bg-[var(--quant-surface-subtle)]/98 backdrop-blur-xl shadow-2xl overflow-hidden
 * - Header bar: title ('New Message'), minimize/collapse button, expand-to-fullscreen button, close button.
 * - Inputs: To, Cc/Bcc toggle, Subject, rich body editor.
 * - Bottom toolbar: Molten amber Send (⌘↵) button, formatting tools, attachment button (with 25MB guard), writing-assistant (local templates) trigger.
 * - Strictly ZERO raw Unicode emojis - pure SVG vector icons only.
 */

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB per file
const MAX_TOTAL_ATTACHMENTS_BYTES = 25 * 1024 * 1024; // 25 MB total

export interface DockedComposerProps {
  isOpen: boolean;
  onClose: () => void;
  initialTo?: string;
  initialSubject?: string;
  initialBody?: string;
  replyToId?: string;
  onSendSuccess?: () => void;
  onDiscard?: () => void;
  /**
   * Start a chat thread instead of a letter. Defaults to 'mail'; the "New chat"
   * entry point passes 'chat'.
   */
  initialMessageKind?: 'mail' | 'chat';
}

// ----------------------------------------------------------------------------
// Pure SVG Vector Icons (strictly ZERO raw Unicode emojis)
// ----------------------------------------------------------------------------

function IconMinus({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconMaximize({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function IconMinimize({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function IconClose({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconSend({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function IconPaperclip({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l7.88-7.88" />
    </svg>
  );
}

function IconSparkle({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}

function IconFormat({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h16" />
      <path d="m6 16 6-12 6 12" />
      <path d="M8 12h8" />
    </svg>
  );
}

function IconTrash({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function IconBold({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
      <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
    </svg>
  );
}

function IconItalic({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="19" y1="4" x2="10" y2="4" />
      <line x1="14" y1="20" x2="5" y2="20" />
      <line x1="15" y1="4" x2="9" y2="20" />
    </svg>
  );
}

function IconUnderline({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3" />
      <line x1="4" y1="21" x2="20" y2="21" />
    </svg>
  );
}

function IconList({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" strokeWidth="3" />
      <line x1="3" y1="12" x2="3.01" y2="12" strokeWidth="3" />
      <line x1="3" y1="18" x2="3.01" y2="18" strokeWidth="3" />
    </svg>
  );
}

export function DockedComposer({
  isOpen,
  onClose,
  initialTo = '',
  initialSubject = '',
  initialBody = '',
  replyToId,
  onSendSuccess,
  onDiscard,
  initialMessageKind = 'mail',
}: DockedComposerProps) {
  const router = useRouter();
  const { queueSend } = useUndoSend();
  const { data: contacts = [] } = useContacts();

  // Window states
  const [isMinimized, setIsMinimized] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // --------------------------------------------------------------------------
  // Composer window gestures: drag-down-to-minimize + top-edge drag-to-resize
  // --------------------------------------------------------------------------
  const composerRef = useRef<HTMLDivElement>(null);
  // User-resized height (null = natural height). Committed on pointer release.
  const [customHeightPx, setCustomHeightPx] = useState<number | null>(null);

  const MIN_COMPOSER_HEIGHT = 300;
  const SWIPE_MINIMIZE_THRESHOLD = 80; // px of downward drag before minimizing

  /**
   * Header drag (touch swipe-down or mouse drag-down): the composer follows the
   * pointer, and past the threshold it collapses to the minimized draft badge —
   * the Gmail/Telegram sheet pattern. Ignored when expanded; header buttons
   * are excluded so they stay clickable.
   */
  const handleHeaderDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isExpanded || isMinimized) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[data-resize-handle]')) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const el = composerRef.current;
    let mode: 'swipe' | null = null;

    document.body.style.userSelect = 'none';

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.userSelect = '';
    };

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!mode) {
        if (Math.abs(dy) < 10 && Math.abs(dx) < 10) return;
        // Engage only for a dominant downward drag.
        if (dy > 0 && dy >= Math.abs(dx)) {
          mode = 'swipe';
        } else {
          cleanup();
          return;
        }
      }
      ev.preventDefault();
      if (el) el.style.transform = `translateY(${Math.max(0, dy)}px)`;
    };

    const onUp = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      cleanup();
      if (mode !== 'swipe' || !el) return;
      if (dy >= SWIPE_MINIMIZE_THRESHOLD) {
        el.style.transform = '';
        setIsMinimized(true);
      } else {
        // Spring back to rest position.
        el.style.transition = 'transform 180ms ease-out';
        el.style.transform = '';
        window.setTimeout(() => {
          if (composerRef.current) composerRef.current.style.transition = '';
        }, 200);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  /**
   * Top-edge drag handle: resize composer height (desktop mouse / touch).
   * Height is clamped between a usable minimum and 85% of the viewport.
   */
  const handleResizeDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isExpanded || isMinimized) return;
    e.preventDefault();
    e.stopPropagation();
    const el = composerRef.current;
    if (!el) return;

    const startHeight = el.getBoundingClientRect().height;
    const startY = e.clientY;
    let latest = startHeight;

    document.body.style.userSelect = 'none';

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      const maxH = Math.floor(window.innerHeight * 0.85);
      const next = Math.min(
        Math.max(startHeight - (ev.clientY - startY), MIN_COMPOSER_HEIGHT),
        maxH
      );
      latest = next;
      el.style.height = `${Math.round(next)}px`;
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.userSelect = '';
      setCustomHeightPx(Math.round(latest));
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  /** Keyboard access to the resize handle: arrows adjust height by 24px. */
  const handleResizeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const el = composerRef.current;
    const base =
      customHeightPx ?? (el ? Math.round(el.getBoundingClientRect().height) : 520);
    const maxH = Math.floor(window.innerHeight * 0.85);
    const next = Math.min(
      Math.max(base + (e.key === 'ArrowUp' ? 24 : -24), MIN_COMPOSER_HEIGHT),
      maxH
    );
    setCustomHeightPx(next);
  };

  // Field states
  const [to, setTo] = useState(initialTo);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);

  // Formatting & Attachments
  const [showFormatting, setShowFormatting] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [showAssistMenu, setShowAssistMenu] = useState(false);
  const [isInsertingTemplate, setIsInsertingTemplate] = useState(false);

  // Autocomplete suggestions for To:
  const [showSuggestions, setShowSuggestions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Unsaved-changes guard for the discard button — same protection as the
  // full composer: typed content is never silently thrown away.
  const { confirm, dialog: confirmDialog } = useConfirm();

  // Signature
  const [signatureHtml, setSignatureHtml] = useState('');
  useEffect(() => {
    let active = true;
    void loadDefaultSignatureHtml().then((sig) => {
      if (active && sig) setSignatureHtml(sig);
    });
    return () => {
      active = false;
    };
  }, []);

  // Draft autosave: the docked composer previously had no draft saving at all —
  // work was lost if the user closed it without sending. Now a real timer saves
  // 10s after the last edit, only when dirty, only with content.
  const saveDraftToServer = async (): Promise<boolean> => {
    const { bodyText } = composeMessageBodies(body.trim(), signatureHtml);
    try {
      await apiFetchRaw('/api/emails/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: to.trim(),
          cc: cc.trim() || undefined,
          bcc: bcc.trim() || undefined,
          subject: subject.trim(),
          body: bodyText,
          attachments,
          inReplyTo: replyToId,
        }),
      });
      return true;
    } catch {
      return false;
    }
  };

  const draftSnapshot = useMemo(
    () =>
      JSON.stringify({
        to,
        cc,
        bcc,
        subject,
        body,
        attachments: attachments.map((a) => (a as any).id ?? a.filename),
      }),
    [to, cc, bcc, subject, body, attachments],
  );
  const draftHasContent = useMemo(
    () =>
      Boolean(
        to.trim() || subject.trim() || body.trim() || attachments.length > 0,
      ),
    [to, subject, body, attachments],
  );
  const { saveState: draftSaveState } = useDraftAutosave({
    snapshot: draftSnapshot,
    hasContent: draftHasContent,
    save: saveDraftToServer,
    enabled: !isSending,
  });
  const draftSaveLabel = draftSaveStateLabel(draftSaveState);

  // Sync initials when props change
  useEffect(() => {
    if (initialTo) setTo(initialTo);
  }, [initialTo]);

  useEffect(() => {
    if (initialSubject) setSubject(initialSubject);
  }, [initialSubject]);

  useEffect(() => {
    if (initialBody) setBody(initialBody);
  }, [initialBody]);

  // Reset window state when the composer is closed, so reopening always starts
  // with the full composer — not a stale minimized badge with a dead restore.
  useEffect(() => {
    if (!isOpen) {
      setIsMinimized(false);
      setIsExpanded(false);
    }
  }, [isOpen]);

  // Filter contacts matching current 'to' text
  const filteredSuggestions = useMemo(() => {
    const query = to.trim().toLowerCase();
    if (!query || query.length < 1) return [];
    return contacts
      .filter(
        (c) =>
          c.email.toLowerCase().includes(query) ||
          (c.name && c.name.toLowerCase().includes(query))
      )
      .slice(0, 5);
  }, [contacts, to]);

  // Total attachment size
  const totalAttachmentBytes = useMemo(
    () => attachments.reduce((acc, a) => acc + (a.size || 0), 0),
    [attachments]
  );

  // Handle file uploads with 25MB guard
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    let runningTotal = totalAttachmentBytes;
    const newAttachments: Attachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > MAX_ATTACHMENT_BYTES) {
        showToast({
          text: `"${file.name}" exceeds the 20MB per-file limit. Consider sharing via QuantDrive.`,
          type: 'error',
        });
        continue;
      }
      if (runningTotal + file.size > MAX_TOTAL_ATTACHMENTS_BYTES) {
        showToast({
          text: 'Total attachments exceed the 25MB limit. Please remove some files.',
          type: 'error',
        });
        break;
      }

      runningTotal += file.size;
      const objectUrl = URL.createObjectURL(file);
      newAttachments.push({
        id: `att-${Date.now()}-${i}`,
        name: file.name,
        filename: file.name,
        size: file.size,
        type: file.type,
        mimeType: file.type || 'application/octet-stream',
        url: objectUrl,
      });
    }

    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments]);
      showToast({
        text: `Attached ${newAttachments.length} file${newAttachments.length > 1 ? 's' : ''}`,
        type: 'info',
      });
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // Writing-assistant presets — local templates only, no AI call.
  const handleWritingAssist = async (promptType: 'draft' | 'formal' | 'concise' | 'followup') => {
    setShowAssistMenu(false);
    setIsInsertingTemplate(true);

    try {
      // Insert a local template — never invents facts; 'concise' only condenses the user's own draft.
      let generated = '';
      if (promptType === 'draft') {
        generated = `Dear Team,\n\nI am writing to share an update regarding ${subject || 'our current initiative'}.\n\nPlease review the attached items and let me know if any questions arise.\n\nBest regards,\n`;
      } else if (promptType === 'formal') {
        generated = body
          ? body.replace(/\bhi\b/gi, 'Dear').replace(/\bthanks\b/gi, 'Thank you for your consideration.')
          : `Dear Sir/Madam,\n\nI trust this communication finds you well. I wish to formally present our strategic objectives for your review.\n\nSincerely,\n`;
      } else if (promptType === 'concise') {
        // Rephrase ONLY — never invent facts, dates, milestones, or meetings.
        // Condense the existing draft to its first two sentences, stripped of filler.
        const sentences = body
          ? body.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
          : [];
        const condensed = sentences
          .slice(0, 2)
          .join(' ')
          .replace(/\b(just wanted to|i wanted to|i am writing to let you know|please note that)\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
        generated = condensed || `Quick update${subject ? ` on ${subject}` : ''}.`;
      } else {
        generated = `Hi there,\n\nFollowing up on our earlier note regarding ${subject || 'the project'}. Please let me know when you have a moment to connect.\n\nThanks,\n`;
      }

      // "Make Concise" rewrites the draft in place; other presets append.
      if (promptType === 'concise' && body) {
        setBody(generated);
      } else {
        setBody((prev) => (prev ? `${prev}\n\n${generated}` : generated));
      }
      showToast({ text: 'Template inserted', type: 'success' });
      bodyRef.current?.focus();
    } catch {
      showToast({ text: 'Failed to insert template', type: 'error' });
    } finally {
      setIsInsertingTemplate(false);
    }
  };

  // Format action helpers
  const applyFormatting = (tag: string) => {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = body.substring(start, end);
    let wrapped = '';

    if (tag === 'b') wrapped = `**${selected || 'bold text'}**`;
    else if (tag === 'i') wrapped = `*${selected || 'italic text'}*`;
    else if (tag === 'u') wrapped = `<u>${selected || 'underlined text'}</u>`;
    else if (tag === 'list') wrapped = `\n• ${selected || 'list item'}`;

    const newText = body.substring(0, start) + wrapped + body.substring(end);
    setBody(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + wrapped.length, start + wrapped.length);
    }, 50);
  };

  // Send action with 10s Recall Window
  const handleSend = async () => {
    if (!to.trim()) {
      showToast({ text: 'Please specify at least one recipient (To:)', type: 'error' });
      return;
    }
    if (!subject.trim()) {
      showToast({ text: 'Please enter an email subject', type: 'error' });
      return;
    }
    if (!body.trim()) {
      showToast({ text: 'Please write your message body', type: 'error' });
      return;
    }

    const { bodyText, bodyHtml } = composeMessageBodies(body.trim(), signatureHtml);

    const draftSnapshot = {
      to: to.trim(),
      cc: cc.trim(),
      bcc: bcc.trim(),
      subject: subject.trim(),
      body: body.trim(),
      bodyText,
      bodyHtml,
      attachments: [...attachments],
      replyToId,
    };

    // Close the docked composer immediately
    onClose();

    // Queue Send via UndoSendManager with 10-second recall
    queueSend({
      to: draftSnapshot.to,
      subject: draftSnapshot.subject,
      body: draftSnapshot.bodyText || draftSnapshot.body,
      onUndo: async () => {
        // User clicked Undo / pressed Z: restore fields
        setTo(draftSnapshot.to);
        setCc(draftSnapshot.cc);
        setBcc(draftSnapshot.bcc);
        setSubject(draftSnapshot.subject);
        setBody(draftSnapshot.body);
        setAttachments(draftSnapshot.attachments);
        showToast({ text: 'Send cancelled. Draft restored.', type: 'info' });
      },
    });

    try {
      setIsSending(true);
      const toList = draftSnapshot.to
        .split(/[,;\s]+/)
        .filter(Boolean)
        .map((email) => ({ email }));

      const ccList = draftSnapshot.cc
        ? draftSnapshot.cc
            .split(/[,;\s]+/)
            .filter(Boolean)
            .map((email) => ({ email }))
        : undefined;

      const bccList = draftSnapshot.bcc
        ? draftSnapshot.bcc
            .split(/[,;\s]+/)
            .filter(Boolean)
            .map((email) => ({ email }))
        : undefined;

      // A chat message is a thread start, not a letter: the backend requires a
      // non-empty subject, so fall back to the recipient line.
      const sendSubject =
        draftSnapshot.subject ||
        (initialMessageKind === 'chat' ? `Chat with ${toList.map((t) => t.email).join(', ')}` : '');
      const composeRes = await apiClient.composeEmail({
        to: toList,
        cc: ccList,
        bcc: bccList,
        subject: sendSubject,
        bodyText: draftSnapshot.bodyText,
        bodyHtml: draftSnapshot.bodyHtml,
        attachments: draftSnapshot.attachments as any,
        inReplyTo: draftSnapshot.replyToId,
        messageKind: initialMessageKind,
      });

      if (!composeRes.success || !composeRes.data?.id) {
        throw new Error(composeRes.error?.message || 'Failed to compose email');
      }

      const sendRes = await apiClient.sendEmail(composeRes.data.id);
      if (!sendRes.success) {
        throw new Error(sendRes.error?.message || 'Failed to deliver email');
      }

      onSendSuccess?.();
    } catch (err: any) {
      showToast({ text: err.message || 'Failed to deliver message', type: 'error' });
    } finally {
      setIsSending(false);
    }
  };

  // Keyboard shortcut: Cmd+Enter / Ctrl+Enter triggers send
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  // --------------------------------------------------------------------------
  // MINIMIZED STATE: Floating bottom-right badge
  // --------------------------------------------------------------------------
  if (isMinimized) {
    return (
      <div
        data-testid="docked-composer-minimized"
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-4 right-6 z-40 w-[300px] h-11 rounded-2xl border border-[#232938] bg-[var(--quant-surface-subtle)]/98 backdrop-blur-xl shadow-2xl flex items-center justify-between px-3.5 cursor-pointer hover:border-[var(--quant-primary)]/50 transition-all select-none"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="size-2 rounded-full bg-[var(--quant-primary)] shrink-0 animate-pulse" />
          <span className="text-xs font-semibold text-white truncate">
            {subject.trim() || 'New Message'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsMinimized(false);
            }}
            aria-label="Restore composer"
            className="p-1 text-[var(--quant-muted-foreground)] hover:text-white rounded-lg transition-colors"
          >
            <IconMaximize className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close composer"
            className="p-1 text-[var(--quant-muted-foreground)] hover:text-red-400 rounded-lg transition-colors"
          >
            <IconClose className="size-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // DOCKED & EXPANDED CONTAINER
  // --------------------------------------------------------------------------
  const containerClasses = isExpanded
    ? 'fixed inset-4 sm:inset-10 z-50 rounded-2xl border border-[#232938] bg-[var(--quant-surface-subtle)]/98 backdrop-blur-2xl shadow-2xl overflow-hidden flex flex-col'
    : 'fixed bottom-4 right-6 z-40 w-[540px] max-w-[calc(100vw-32px)] rounded-2xl border border-[#232938] bg-[var(--quant-surface-subtle)]/98 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col max-h-[82vh]';

  return (
    <div
      data-testid="docked-composer"
      ref={composerRef}
      onKeyDown={handleKeyDown}
      className={containerClasses}
      style={!isExpanded && customHeightPx ? { height: customHeightPx } : undefined}
    >
      {/* Drag-to-resize handle on the top edge (docked mode only) */}
      {!isExpanded && (
        <div
          data-resize-handle
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize composer height"
          aria-valuemin={MIN_COMPOSER_HEIGHT}
          aria-valuemax={850}
          aria-valuenow={customHeightPx ?? undefined}
          title="Drag to resize"
          tabIndex={0}
          onPointerDown={handleResizeDragStart}
          onKeyDown={handleResizeKeyDown}
          className="absolute inset-x-[33%] top-0 z-20 flex h-4 cursor-ns-resize touch-none items-start justify-center pt-1.5 focus-visible:outline-2 focus-visible:outline-[var(--quant-primary)]"
        >
          <span
            aria-hidden="true"
            className="h-1 w-14 rounded-full bg-[#4A5163] opacity-60 transition-opacity hover:opacity-100"
          />
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        aria-label="Attach files"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* HEADER BAR — drag down (touch or mouse) to minimize to the draft badge */}
      <div
        onPointerDown={handleHeaderDragStart}
        title="Drag down to minimize"
        className="relative flex items-center justify-between px-4 py-2.5 bg-[var(--quant-surface-elevated)] border-b border-[#232938] select-none shrink-0 touch-none cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex size-6 items-center justify-center rounded-lg bg-[var(--quant-primary)]/20 text-[var(--quant-primary)]">
            <IconSend className="size-3.5" />
          </div>
          <h3 className="text-xs font-bold text-white truncate tracking-wide">
            {subject.trim() || 'New Message'}
          </h3>
          {/* Honest autosave indicator: the real state of the last save attempt. */}
          {draftSaveLabel && (
            <span
              aria-live="polite"
              className={`text-[10px] font-medium shrink-0 ${
                draftSaveState === 'error'
                  ? 'text-[#FF6B6B]'
                  : draftSaveState === 'saved'
                    ? 'text-[#4ADE80]'
                    : 'text-[var(--quant-muted-foreground)]'
              }`}
            >
              {draftSaveLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Minimize / Collapse */}
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            aria-label="Minimize composer"
            className="p-1.5 text-[var(--quant-muted-foreground)] hover:text-white rounded-lg hover:bg-white/5 transition-colors"
            title="Minimize"
          >
            <IconMinus className="size-3.5" />
          </button>

          {/* Expand / Restore Fullscreen */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-label={isExpanded ? 'Restore window' : 'Expand to fullscreen'}
            className="p-1.5 text-[var(--quant-muted-foreground)] hover:text-white rounded-lg hover:bg-white/5 transition-colors"
            title={isExpanded ? 'Restore size' : 'Full screen'}
          >
            {isExpanded ? (
              <IconMinimize className="size-3.5" />
            ) : (
              <IconMaximize className="size-3.5" />
            )}
          </button>

          {/* Close / Discard */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close composer"
            className="p-1.5 text-[var(--quant-muted-foreground)] hover:text-red-400 rounded-lg hover:bg-white/5 transition-colors"
            title="Close"
          >
            <IconClose className="size-3.5" />
          </button>
        </div>
      </div>

      {/* INPUTS BODY */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto divide-y divide-[#1A202E]">
        {/* Recipient To: */}
        <div className="relative flex items-center px-4 py-2 gap-2 text-xs">
          <label htmlFor="docked-composer-to" className="w-10 text-[#6B7280] font-semibold select-none">To</label>
          <input
            type="text"
            id="docked-composer-to"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Recipients (e.g. sundar@google.com)"
            aria-label="To recipients"
            className="flex-1 bg-transparent text-white placeholder-[#4B5563] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] rounded text-xs"
          />

          {!showCcBcc && (
            <button
              type="button"
              onClick={() => setShowCcBcc(true)}
              className="text-[11px] text-[var(--quant-muted-foreground)] hover:text-[var(--quant-primary)] font-semibold transition-colors px-1.5 py-0.5 rounded"
            >
              Cc / Bcc
            </button>
          )}

          {/* Autocomplete suggestions dropdown */}
          {showSuggestions && filteredSuggestions.length > 0 && (
            <div className="absolute left-14 top-full mt-1 w-72 rounded-xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] shadow-2xl z-50 overflow-hidden py-1">
              {filteredSuggestions.map((c) => (
                <div
                  key={c.id}
                  onClick={() => {
                    setTo(c.email);
                    setShowSuggestions(false);
                  }}
                  className="px-3 py-1.5 hover:bg-[var(--quant-primary)]/15 cursor-pointer flex flex-col transition-colors"
                >
                  <span className="text-xs font-semibold text-white">{c.name || c.email}</span>
                  <span className="text-[10px] text-[#9CA3AF] truncate">{c.email}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Optional Cc / Bcc fields */}
        {showCcBcc && (
          <>
            <div className="flex items-center px-4 py-1.5 gap-2 text-xs">
              <label htmlFor="docked-composer-cc" className="w-10 text-[#6B7280] font-semibold select-none">Cc</label>
              <input
                type="text"
                id="docked-composer-cc"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="Cc recipients"
                aria-label="Cc recipients"
                className="flex-1 bg-transparent text-white placeholder-[#4B5563] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] rounded text-xs"
              />
            </div>
            <div className="flex items-center px-4 py-1.5 gap-2 text-xs">
              <label htmlFor="docked-composer-bcc" className="w-10 text-[#6B7280] font-semibold select-none">Bcc</label>
              <input
                type="text"
                id="docked-composer-bcc"
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                placeholder="Bcc recipients"
                aria-label="Bcc recipients"
                className="flex-1 bg-transparent text-white placeholder-[#4B5563] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] rounded text-xs"
              />
            </div>
          </>
        )}

        {/* Subject field */}
        <div className="flex items-center px-4 py-2 gap-2 text-xs">
          <input
            type="text"
            id="docked-composer-subject"
            aria-label="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="flex-1 bg-transparent text-white placeholder-[#4B5563] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] rounded text-xs"
          />
        </div>

        {/* Formatting Toolbar (Toggleable) */}
        {showFormatting && (
          <div className="flex items-center gap-1 px-4 py-1.5 bg-[#10141E] text-xs border-b border-[#1E2536]">
            <button
              type="button"
              onClick={() => applyFormatting('b')}
              className="p-1.5 rounded text-[var(--quant-muted-foreground)] hover:text-white hover:bg-white/10 transition-colors"
              title="Bold"
            >
              <IconBold />
            </button>
            <button
              type="button"
              onClick={() => applyFormatting('i')}
              className="p-1.5 rounded text-[var(--quant-muted-foreground)] hover:text-white hover:bg-white/10 transition-colors"
              title="Italic"
            >
              <IconItalic />
            </button>
            <button
              type="button"
              onClick={() => applyFormatting('u')}
              className="p-1.5 rounded text-[var(--quant-muted-foreground)] hover:text-white hover:bg-white/10 transition-colors"
              title="Underline"
            >
              <IconUnderline />
            </button>
            <div className="w-px h-4 bg-[var(--quant-surface-elevated)] mx-1" />
            <button
              type="button"
              onClick={() => applyFormatting('list')}
              className="p-1.5 rounded text-[var(--quant-muted-foreground)] hover:text-white hover:bg-white/10 transition-colors"
              title="Bulleted list"
            >
              <IconList />
            </button>
          </div>
        )}

        {/* Rich Body Editor Area */}
        <div className="flex-1 flex flex-col p-4 relative min-h-[160px]">
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => {
              const next = e.target.value;
              // The placeholder promises "Type '++' for writing-assistant templates" —
              // honour it: strip the trigger and open the templates menu.
              if (next.endsWith('++')) {
                setBody(next.slice(0, -2));
                setShowAssistMenu(true);
                return;
              }
              setBody(next);
            }}
            placeholder="Write your email here... Type '++' for writing-assistant templates."
            className="w-full flex-1 bg-transparent text-white placeholder-[#4B5563] resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] rounded text-xs leading-relaxed"
          />

          {/* Attached Files Strip */}
          {attachments.length > 0 && (
            <div className="mt-2 pt-2 border-t border-[#1E2536] flex flex-wrap gap-1.5">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] px-2.5 py-1 text-[11px] text-[#EDEDED]"
                >
                  <IconPaperclip className="size-3 text-[var(--quant-primary)]" />
                  <span className="truncate max-w-[150px]">{att.name}</span>
                  <span className="text-[#6B7280]">({formatBytes(att.size)})</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(att.id)}
                    className="ml-1 text-[var(--quant-muted-foreground)] hover:text-red-400"
                    title="Remove attachment"
                  >
                    <IconClose className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM TOOLBAR — horizontally scrollable on narrow screens so the
          Send + action buttons never clip on 360px viewports. Scrollbar hidden. */}
      <div className="px-4 py-3 bg-[var(--quant-surface-subtle)] border-t border-[#232938] flex items-center justify-between gap-3 shrink-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex items-center gap-2 min-w-max">
          {/* Molten Amber Send Button */}
          <button
            type="button"
            onClick={handleSend}
            disabled={isSending}
            data-testid="docked-composer-send-button"
            className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--quant-primary)] to-[#F97316] px-4 py-2 text-xs font-bold text-black shadow-lg shadow-[var(--quant-primary)]/20 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
            title="Send email (⌘↵ or Ctrl+Enter)"
          >
            <IconSend className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
            <span>Send (⌘↵)</span>
          </button>

          {/* Formatting Toggle */}
          <button
            type="button"
            onClick={() => setShowFormatting(!showFormatting)}
            className={`p-2 rounded-xl border transition-colors ${
              showFormatting
                ? 'border-[var(--quant-primary)]/50 bg-[var(--quant-primary)]/10 text-[var(--quant-primary)]'
                : 'border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] text-[var(--quant-muted-foreground)] hover:text-white'
            }`}
            title="Formatting options"
          >
            <IconFormat className="size-4" />
          </button>

          {/* Attachment Button with 25MB Guard */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] text-[var(--quant-muted-foreground)] hover:text-[var(--quant-primary)] hover:border-[var(--quant-primary)]/40 transition-colors relative"
            title="Attach files (25MB limit)"
          >
            <IconPaperclip className="size-4" />
          </button>

          {/* Writing-assistant trigger (local templates) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAssistMenu(!showAssistMenu)}
              disabled={isInsertingTemplate}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#A855F7]/40 bg-[#3B0764]/20 text-[#C084FC] hover:bg-[#3B0764]/40 hover:border-[#A855F7] transition-all text-xs font-semibold"
              title="Writing assistant — local templates, no AI"
            >
              <IconSparkle className="size-3.5 animate-pulse" />
              <span>Writing assist</span>
            </button>

            {/* Writing-assistant menu */}
            {showAssistMenu && (
              <div className="absolute left-0 bottom-full mb-2 w-56 rounded-2xl border border-[#3B0764] bg-[#130E20] shadow-2xl p-1.5 z-50 space-y-1">
                <button
                  type="button"
                  onClick={() => handleWritingAssist('draft')}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-[#3B0764]/40 text-left text-xs text-white transition-colors"
                >
                  <IconSparkle className="size-3.5 text-[#C084FC]" />
                  <span>Draft Full Email</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleWritingAssist('formal')}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-[#3B0764]/40 text-left text-xs text-white transition-colors"
                >
                  <IconFormat className="size-3.5 text-[#C084FC]" />
                  <span>Make More Formal</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleWritingAssist('concise')}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-[#3B0764]/40 text-left text-xs text-white transition-colors"
                >
                  <IconMinus className="size-3.5 text-[#C084FC]" />
                  <span>Make Concise &amp; Punchy</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleWritingAssist('followup')}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-[#3B0764]/40 text-left text-xs text-white transition-colors"
                >
                  <IconSend className="size-3.5 text-[#C084FC]" />
                  <span>Polite Follow-Up</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Discard Draft */}
        <button
          type="button"
          onClick={async () => {
            const hasContent =
              to.trim().length > 0 ||
              cc.trim().length > 0 ||
              bcc.trim().length > 0 ||
              subject.trim().length > 0 ||
              body.trim().length > 0 ||
              attachments.length > 0;
            if (hasContent) {
              const discard = await confirm({
                title: 'Discard draft?',
                message: 'You have unsaved changes. Discard this draft?',
                confirmLabel: 'Discard',
                cancelLabel: 'Keep editing',
                variant: 'destructive',
              });
              if (!discard) return;
            }
            onDiscard?.();
            onClose();
          }}
          className="p-2 rounded-xl text-[#6B7280] hover:text-red-400 hover:bg-white/5 transition-colors flex-shrink-0"
          title="Discard draft"
        >
          <IconTrash className="size-4" />
        </button>
      </div>
      {confirmDialog}
    </div>
  );
}
