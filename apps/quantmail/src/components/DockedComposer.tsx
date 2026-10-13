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
import {
  adjustRangesForEdit,
  applyInlineFormat,
  composeMessageBodies,
  type InlineFormatKind,
  type InlineFormatRange,
} from '../lib/email-body';
import { loadDefaultSignatureHtml } from '../lib/email-signature-preference';
import type { Attachment } from './EmailComposer';
import { createPortal } from 'react-dom';
import { EmailTemplates, type EmailTemplate } from './EmailTemplates';
import {
  RecipientChipInput,
  parseEmailString,
  dedupeRecipientPayload,
  type RecipientOption,
} from './RecipientChipInput';

/**
 * Superhuman/Gmail-class floating bottom-right docked composer widget.
 *
 * Invariants:
 * - Fixed: bottom-4 right-6 z-40 w-[540px] max-w-[calc(100vw-32px)] rounded-2xl border border-[#232938] bg-[var(--quant-surface-subtle)]/98 backdrop-blur-xl shadow-2xl overflow-hidden
 * - Header bar: title ('New Message'), minimize/collapse button, expand-to-fullscreen button, close button.
 * - Inputs: To, Cc/Bcc toggle, Subject, rich body editor.
 * - Bottom toolbar: Molten amber Send (⌘↵) button, formatting tools, attachment button (with 25MB guard), writing-assistant (local templates) trigger, saved email templates (backend /email-templates CRUD) entry point.
 * - Strictly ZERO raw Unicode emojis - pure SVG vector icons only.
 */

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB per file
const MAX_TOTAL_ATTACHMENTS_BYTES = 25 * 1024 * 1024; // 25 MB total

/**
 * Send-payload recipient lists for the docked composer. Each address goes to
 * the API exactly once, and `Name <addr>` stays ONE recipient — the old
 * derivation (`to.split(/[,;\s]+/)`) split on whitespace, so typing
 * `John Doe <john@x.com>` shipped three bogus addresses (`John`, `Doe`,
 * `<john@x.com>`) to compose/updateDraft. Exported for tests.
 */
export function buildRecipientPayload(
  to: RecipientOption[],
  cc: RecipientOption[],
  bcc: RecipientOption[],
): { to: { email: string }[]; cc?: { email: string }[]; bcc?: { email: string }[] } {
  const toList = dedupeRecipientPayload(to.map((r) => ({ email: r.email })));
  const ccList =
    cc.length > 0 ? dedupeRecipientPayload(cc.map((r) => ({ email: r.email }))) : undefined;
  const bccList =
    bcc.length > 0 ? dedupeRecipientPayload(bcc.map((r) => ({ email: r.email }))) : undefined;
  return { to: toList, cc: ccList, bcc: bccList };
}

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

// Saved email templates (backend /email-templates CRUD) — document icon, pure
// SVG like the rest of this file's icon set.
function IconTemplate({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
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

  /**
   * Honest chrome for the entry point: the inbox "New chat" button opens this
   * composer with kind 'chat' (a chat thread, not a letter — the backend
   * renders it with chat marks and bubbles). The header used to read
   * "New Message" either way, which is the mismatch the button's label
   * promised something else. The kind is fixed at open; it never flips
   * mid-compose, so the initial kind is the right source.
   */
  const emptyTitle = initialMessageKind === 'chat' ? 'New chat' : 'New Message';

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

  // Field states — chip-based recipient rows (RecipientChipInput, the same
  // component EmailComposer uses), so `John Doe <john@x.com>` is parsed as ONE
  // recipient instead of being whitespace-split into three invalid addresses
  // on send, and autocomplete appends a chip instead of replacing the field.
  const [toRecipients, setToRecipients] = useState<RecipientOption[]>(() =>
    parseEmailString(initialTo ?? ''),
  );
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [ccRecipients, setCcRecipients] = useState<RecipientOption[]>([]);
  const [bccRecipients, setBccRecipients] = useState<RecipientOption[]>([]);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);

  // Formatting & Attachments
  // QM-UIUX-081: formatting is a set of ranges over `body`, never characters
  // inside it — the old Bold button wrapped the selection in literal `**`,
  // which then leaked into bodyText, snippets and previews as raw Markdown.
  // `composeMessageBodies` renders these ranges as real HTML on send/save.
  const [bodyFormats, setBodyFormats] = useState<InlineFormatRange[]>([]);
  const [showFormatting, setShowFormatting] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [showAssistMenu, setShowAssistMenu] = useState(false);
  const [isInsertingTemplate, setIsInsertingTemplate] = useState(false);

  // Saved email templates (backend /email-templates CRUD) — the EmailTemplates
  // picker anchored above the toolbar button, portaled to document.body so the
  // toolbar's horizontal scroll can never clip it.
  const [showTemplates, setShowTemplates] = useState(false);
  const [templatesMenuPos, setTemplatesMenuPos] = useState<{ left: number; bottom: number } | null>(null);
  const templatesAnchorRef = useRef<HTMLDivElement>(null);

  // (Recipient autocomplete is owned by RecipientChipInput now.)
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
  // work was lost if the user closed it without sending. A real timer saves
  // 10s after the last edit, only when dirty, only with content.
  //
  // HONESTY: this used to POST to `/api/emails/drafts`, a route that does not
  // exist — the 404 was swallowed and the "Saved" indicator lied. Now it uses
  // the real draft lifecycle: POST /emails/compose creates the server draft
  // once, PUT /emails/:id updates it. The "Saved" indicator means the bytes
  // are on the server, or it says "Couldn't save".
  const serverDraftIdRef = useRef<string | null>(null);
  const saveDraftToServer = async (): Promise<boolean> => {
    const { bodyText, bodyHtml } = composeMessageBodies(body, signatureHtml, {
      inline: bodyFormats,
    });
    const { to: toList, cc: ccList, bcc: bccList } = buildRecipientPayload(
      toRecipients,
      ccRecipients,
      bccRecipients,
    );
    // Subject is optional: empty-subject drafts autosave exactly like the rest.
    // The backend composeSchema accepts an empty subject (stored as ''), so
    // there is no reason to silently skip persisting a subjectless draft.
    try {
      if (!serverDraftIdRef.current) {
        const res = await apiClient.composeEmail({
          to: toList,
          cc: ccList,
          bcc: bccList,
          subject: subject.trim(),
          bodyText,
          bodyHtml,
          attachments: attachments as any,
          inReplyTo: replyToId,
          messageKind: initialMessageKind,
        });
        if (!res.success || !res.data?.id) return false;
        serverDraftIdRef.current = res.data.id;
      } else {
        const res = await apiClient.updateDraft(serverDraftIdRef.current, {
          to: toList,
          cc: ccList,
          bcc: bccList,
          subject: subject.trim(),
          bodyText,
          bodyHtml,
          attachments: attachments as any,
          inReplyTo: replyToId,
          messageKind: initialMessageKind,
        });
        if (!res.success) {
          // The draft may have been sent or deleted elsewhere — drop the id
          // so the next save creates a fresh draft instead of 404ing forever.
          serverDraftIdRef.current = null;
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  };

  const draftSnapshot = useMemo(
    () =>
      JSON.stringify({
        to: toRecipients,
        cc: ccRecipients,
        bcc: bccRecipients,
        subject,
        body,
        attachments: attachments.map((a) => (a as any).id ?? a.filename),
      }),
    [toRecipients, ccRecipients, bccRecipients, subject, body, attachments],
  );
  const draftHasContent = useMemo(
    () =>
      Boolean(
        toRecipients.length > 0 ||
          ccRecipients.length > 0 ||
          bccRecipients.length > 0 ||
          subject.trim() ||
          body.trim() ||
          attachments.length > 0,
      ),
    [toRecipients, ccRecipients, bccRecipients, subject, body, attachments],
  );

  // QM-UIUX-083: every X close path routes through the exact same
  // discard-confirmation as the explicit Discard button. Closing a composer
  // with typed content asks first instead of silently hiding it.
  const requestCloseComposer = useCallback(async () => {
    if (draftHasContent) {
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
  }, [draftHasContent, confirm, onDiscard, onClose]);
  const { saveState: draftSaveState } = useDraftAutosave({
    snapshot: draftSnapshot,
    hasContent: draftHasContent,
    save: saveDraftToServer,
    enabled: !isSending,
  });
  const draftSaveLabel = draftSaveStateLabel(draftSaveState);

  // Sync initials when props change
  useEffect(() => {
    if (initialTo) setToRecipients(parseEmailString(initialTo));
  }, [initialTo]);

  useEffect(() => {
    if (initialSubject) setSubject(initialSubject);
  }, [initialSubject]);

  useEffect(() => {
    if (initialBody) {
      setBody(initialBody);
      // A freshly supplied body has no format ranges yet; stale ranges from
      // an earlier draft would format words the user never selected.
      setBodyFormats([]);
    }
  }, [initialBody]);

  // Reset window state when the composer is closed, so reopening always starts
  // with the full composer — not a stale minimized badge with a dead restore.
  useEffect(() => {
    if (!isOpen) {
      setIsMinimized(false);
      setIsExpanded(false);
    }
  }, [isOpen]);

  // (Contact filtering for recipient autocomplete is owned by
  // RecipientChipInput now — no separate filteredSuggestions memo.)

  // Total attachment size
  const totalAttachmentBytes = useMemo(
    () => attachments.reduce((acc, a) => acc + (a.size || 0), 0),
    [attachments]
  );

  // Handle file uploads with 25MB guard.
  //
  // HONESTY: this used to store `URL.createObjectURL(file)` — a blob: URL that
  // only exists in this browser tab. The server (and every recipient) received
  // a dead link while the UI showed the file as attached. Now the bytes are
  // read as a data URL like EmailComposer does, so what is sent and saved is
  // the actual file.
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    let runningTotal = totalAttachmentBytes;
    const accepted: File[] = [];

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
      accepted.push(file);
    }

    if (accepted.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    let pending = accepted.length;
    const settle = () => {
      pending -= 1;
      if (pending === 0 && fileInputRef.current) fileInputRef.current.value = '';
    };

    accepted.forEach((file, i) => {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachments((prev) => [
          ...prev,
          {
            id: `att-${Date.now()}-${i}`,
            name: file.name,
            filename: file.name,
            size: file.size,
            type: file.type,
            mimeType: file.type || 'application/octet-stream',
            url: reader.result as string,
          },
        ]);
        settle();
      };
      reader.onerror = () => {
        showToast({ text: `Could not read ${file.name}`, type: 'error' });
        settle();
      };
      reader.readAsDataURL(file);
    });

    showToast({
      text: `Attached ${accepted.length} file${accepted.length > 1 ? 's' : ''}`,
      type: 'info',
    });
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
        // The old text is gone, so its format ranges would point at words
        // that no longer exist — drop them rather than misformat the rewrite.
        setBodyFormats([]);
      } else {
        // Appending after the existing text leaves every existing range
        // pointing at the same words, so the ranges survive untouched.
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

  // Saved email templates (backend /email-templates CRUD, via the
  // EmailTemplates picker). Non-destructive: the subject is filled only when
  // empty, and the body is replaced only when empty — otherwise the template
  // text is appended, so the user's draft is never silently clobbered. The
  // old body's format ranges would point at words that no longer exist after
  // a replace, so they are dropped on replace; on append the existing ranges
  // survive untouched (same convention as handleWritingAssist above).
  const applySavedTemplate = useCallback((template: EmailTemplate) => {
    setShowTemplates(false);
    if (!subject.trim()) setSubject(template.subject);
    if (!body.trim()) {
      setBody(template.body);
      setBodyFormats([]);
    } else {
      setBody((prev) => `${prev}\n\n${template.body}`);
    }
    showToast({ text: `Template "${template.name}" applied`, type: 'success' });
    bodyRef.current?.focus();
  }, [subject, body]);

  // Format action helpers (QM-UIUX-081)
  //
  // Formatting is recorded as ranges over the plain body text and rendered as
  // real HTML (`<strong>`, `<em>`, `<u>`, `<ul>`) by `composeMessageBodies` at
  // send/save time. The previous implementation wrapped the selection in
  // literal `**` / `*` / `<u>` characters inside the text itself, so the raw
  // markers were stored in bodyText and surfaced in list snippets, thread
  // previews and Contacts mail history. A <textarea> cannot paint per-range
  // styles, so the selection stays highlighted after a press and the button
  // toggles the range off again — the formatting itself is real where it
  // counts: in the message that is sent.
  const applyFormatting = (tag: string) => {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const kind: InlineFormatKind | null =
      tag === 'b' ? 'bold' : tag === 'i' ? 'italic' : tag === 'u' ? 'underline' : tag === 'list' ? 'list' : null;
    if (!kind) return;
    const result = applyInlineFormat(
      body,
      bodyFormats,
      textarea.selectionStart ?? 0,
      textarea.selectionEnd ?? 0,
      kind,
    );
    setBody(result.text);
    setBodyFormats(result.ranges);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    }, 50);
  };

  // Send action with a GENUINE 10s recall window.
  //
  // HONESTY: this used to fire compose+send IMMEDIATELY and then show the
  // countdown bar's "Undo" — but the message was already delivered, so
  // "Send cancelled. Draft restored." was a lie twice over (sent anyway,
  // and the "restored" draft went into an unmounted composer nobody saw).
  //
  // Now the real send lives ONLY in `onSendNow`, which the UndoSendManager
  // invokes after the recall window closes (or when "Send Now" is pressed).
  // Undo during the window cancels before a single byte is delivered, so the
  // toast tells the truth. The composer minimizes (stays mounted) instead of
  // closing, so Undo can hand the draft back visibly; the real close happens
  // when the send actually fires. This mirrors EmailComposer's modal path.
  const handleSend = async () => {
    if (toRecipients.length === 0) {
      showToast({ text: 'Please specify at least one recipient (To:)', type: 'error' });
      return;
    }
    if (!subject.trim()) {
      // Gmail-style: a subject is optional, but sending without one must be
      // an explicit choice — never a silent send. The user confirms, or the
      // send is abandoned and the draft stays exactly where it was.
      const sendAnyway = await confirm({
        title: 'Send without a subject?',
        message:
          'Your message has no subject. Recipients may overlook it in their inbox.',
        confirmLabel: 'Send anyway',
        cancelLabel: 'Keep editing',
      });
      if (!sendAnyway) return;
    }
    if (!body.trim()) {
      showToast({ text: 'Please write your message body', type: 'error' });
      return;
    }

    const { bodyText, bodyHtml } = composeMessageBodies(body, signatureHtml, { inline: bodyFormats });

    const draftSnapshot = {
      // Display string for the undo-send countdown bar ("Message to …").
      to: toRecipients.map((r) => r.name || r.email).join(', '),
      toRecipients: [...toRecipients],
      ccRecipients: [...ccRecipients],
      bccRecipients: [...bccRecipients],
      subject: subject.trim(),
      body: body.trim(),
      bodyFormats: [...bodyFormats],
      bodyText,
      bodyHtml,
      attachments: [...attachments],
      replyToId,
    };

    const { to: toList, cc: ccList, bcc: bccList } = buildRecipientPayload(
      toRecipients,
      ccRecipients,
      bccRecipients,
    );

    // A chat message is a thread start, not a letter: it keeps a recipient-line
    // subject so the thread has a readable title. An email kind may go out
    // with an empty subject (confirmed above); the backend accepts ''.
    const sendSubject =
      draftSnapshot.subject ||
      (initialMessageKind === 'chat' ? `Chat with ${toList.map((t) => t.email).join(', ')}` : '');

    // Hand the words back to a visible composer — shared by Undo and by a
    // failed send, so a message is never silently eaten and never falsely
    // "restored" into a closed composer.
    const restoreDraft = () => {
      setToRecipients(draftSnapshot.toRecipients);
      setCcRecipients(draftSnapshot.ccRecipients);
      setBccRecipients(draftSnapshot.bccRecipients);
      setSubject(draftSnapshot.subject);
      setBody(draftSnapshot.body);
      setBodyFormats(draftSnapshot.bodyFormats);
      setAttachments(draftSnapshot.attachments);
      setIsMinimized(false);
    };

    // The REAL send. Runs only after the recall window closes (or "Send Now").
    // Rejects on failure so the countdown bar never claims "Message sent!"
    // for a delivery that never happened. Reuses the autosaved server draft
    // when one exists instead of orphaning it with a second compose.
    const doRealSend = async (): Promise<void> => {
      setIsSending(true);
      try {
        let emailId = serverDraftIdRef.current;
        if (emailId) {
          const updateRes = await apiClient.updateDraft(emailId, {
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
          if (!updateRes.success) {
            // Draft went away (sent/deleted elsewhere) — fall through and
            // compose fresh rather than failing the send.
            emailId = null;
          }
        }
        if (!emailId) {
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
          emailId = composeRes.data.id;
        }

        const sendRes = await apiClient.sendEmail(emailId);
        if (!sendRes.success) {
          throw new Error(sendRes.error?.message || 'Failed to deliver email');
        }

        serverDraftIdRef.current = null;
        onClose();
        onSendSuccess?.();
      } finally {
        setIsSending(false);
      }
    };

    // Minimize, don't close: the composer must stay mounted so Undo can
    // restore the draft visibly. The real close happens in doRealSend.
    setIsMinimized(true);

    // Queue the send with a 10-second recall window. Nothing is delivered
    // until the window closes — Undo genuinely cancels.
    queueSend({
      to: draftSnapshot.to,
      subject: draftSnapshot.subject,
      body: draftSnapshot.bodyText || draftSnapshot.body,
      onSendNow: () => doRealSend(),
      onSendFailed: (error: unknown) => {
        // The message never went out — hand the words back with the truth.
        restoreDraft();
        const message =
          error instanceof Error && error.message ? error.message : 'Failed to deliver message';
        showToast({ text: message, type: 'error' });
      },
      onUndo: () => {
        // Nothing was delivered — the API call only exists inside doRealSend.
        restoreDraft();
        showToast({ text: 'Send cancelled. Draft restored.', type: 'info' });
      },
    });
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
      <>
      {/* QM-UIUX-083 follow-up: the shared discard confirmation must be
          mounted in this branch too — the badge X routes through
          requestCloseComposer, whose confirm() promise can never resolve
          while the dialog is absent from the tree, so the click looked
          dead until the composer was restored. It renders as a SIBLING of
          the badge div so backdrop clicks (cancel) cannot bubble into the
          badge's restore-on-click handler. */}
      <div
        data-testid="docked-composer-minimized"
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-4 right-6 z-40 w-[300px] h-11 rounded-2xl border border-[#232938] bg-[var(--quant-surface-subtle)]/98 backdrop-blur-xl shadow-2xl flex items-center justify-between px-3.5 cursor-pointer hover:border-[var(--quant-primary)]/50 transition-all select-none"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="size-2 rounded-full bg-[var(--quant-primary)] shrink-0 animate-pulse" />
          <span className="text-xs font-semibold text-white truncate">
            {subject.trim() || emptyTitle}
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
            className="relative p-1 after:absolute after:-inset-[11px] after:content-[''] text-[var(--quant-muted-foreground)] hover:text-white rounded-lg transition-colors"
          >
            <IconMaximize className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void requestCloseComposer();
            }}
            aria-label="Close composer"
            className="relative p-1 after:absolute after:-inset-[11px] after:content-[''] text-[var(--quant-muted-foreground)] hover:text-red-400 rounded-lg transition-colors"
          >
            <IconClose className="size-3.5" />
          </button>
        </div>
      </div>
      {confirmDialog}
      </>
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
            {subject.trim() || emptyTitle}
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
            className="relative p-1.5 after:absolute after:-inset-[9px] after:content-[''] text-[var(--quant-muted-foreground)] hover:text-white rounded-lg hover:bg-white/5 transition-colors"
            title="Minimize"
          >
            <IconMinus className="size-3.5" />
          </button>

          {/* Expand / Restore Fullscreen */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-label={isExpanded ? 'Restore window' : 'Expand to fullscreen'}
            className="relative p-1.5 after:absolute after:-inset-[9px] after:content-[''] text-[var(--quant-muted-foreground)] hover:text-white rounded-lg hover:bg-white/5 transition-colors"
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
            onClick={requestCloseComposer}
            aria-label="Close composer"
            className="relative p-1.5 after:absolute after:-inset-[9px] after:content-[''] text-[var(--quant-muted-foreground)] hover:text-red-400 rounded-lg hover:bg-white/5 transition-colors"
            title="Close"
          >
            <IconClose className="size-3.5" />
          </button>
        </div>
      </div>

      {/* INPUTS BODY */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto divide-y divide-[#1A202E]">
        {/* Recipient To: chip-based — typing `John Doe <john@x.com>` parses as
            ONE recipient (no whitespace splitting), and the autocomplete
            dropdown appends a chip instead of replacing the whole field. */}
        <div className="px-4 py-2 text-xs">
          <RecipientChipInput
            id="docked-composer-to"
            name="to"
            label="To"
            required
            recipients={toRecipients}
            onChange={setToRecipients}
            contacts={contacts}
            placeholder="Recipients (e.g. sundar@google.com)"
            rightAction={
              !showCcBcc ? (
                <button
                  type="button"
                  onClick={() => setShowCcBcc(true)}
                  className="relative text-[11px] after:absolute after:-inset-[12px] after:content-[''] text-[var(--quant-muted-foreground)] hover:text-[var(--quant-primary)] font-semibold transition-colors px-1.5 py-0.5 rounded"
                >
                  Cc / Bcc
                </button>
              ) : undefined
            }
          />
        </div>

        {/* Optional Cc / Bcc fields — chip-based like To */}
        {showCcBcc && (
          <>
            <div className="px-4 py-1.5 text-xs">
              <RecipientChipInput
                id="docked-composer-cc"
                name="cc"
                label="Cc"
                recipients={ccRecipients}
                onChange={setCcRecipients}
                contacts={contacts}
                placeholder="Cc recipients"
              />
            </div>
            <div className="px-4 py-1.5 text-xs">
              <RecipientChipInput
                id="docked-composer-bcc"
                name="bcc"
                label="Bcc"
                recipients={bccRecipients}
                onChange={setBccRecipients}
                contacts={contacts}
                placeholder="Bcc recipients"
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

        {/* Formatting Toolbar (Toggleable).
            SIA-P2-4: these buttons are compact at every breakpoint, so each carries an
            invisible ::after halo (after:-inset-[Npx]) sized so the hit target is >=44px.
            Visuals unchanged. Exception: the attachment remove X gets real padding instead
            of a halo — a halo would overlap the filename on a no-undo destructive action. */}
        {showFormatting && (
          <div className="flex items-center gap-1 px-4 py-1.5 bg-[#10141E] text-xs border-b border-[#1E2536]">
            <button
              type="button"
              onClick={() => applyFormatting('b')}
              className="relative p-1.5 rounded after:absolute after:-inset-[9px] after:content-[''] text-[var(--quant-muted-foreground)] hover:text-white hover:bg-white/10 transition-colors"
              title="Bold"
            >
              <IconBold />
            </button>
            <button
              type="button"
              onClick={() => applyFormatting('i')}
              className="relative p-1.5 rounded after:absolute after:-inset-[9px] after:content-[''] text-[var(--quant-muted-foreground)] hover:text-white hover:bg-white/10 transition-colors"
              title="Italic"
            >
              <IconItalic />
            </button>
            <button
              type="button"
              onClick={() => applyFormatting('u')}
              className="relative p-1.5 rounded after:absolute after:-inset-[9px] after:content-[''] text-[var(--quant-muted-foreground)] hover:text-white hover:bg-white/10 transition-colors"
              title="Underline"
            >
              <IconUnderline />
            </button>
            <div className="w-px h-4 bg-[var(--quant-surface-elevated)] mx-1" />
            <button
              type="button"
              onClick={() => applyFormatting('list')}
              className="relative p-1.5 rounded after:absolute after:-inset-[9px] after:content-[''] text-[var(--quant-muted-foreground)] hover:text-white hover:bg-white/10 transition-colors"
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
                const stripped = next.slice(0, -2);
                setBodyFormats((prev) => adjustRangesForEdit(prev, body, stripped));
                setBody(stripped);
                setShowAssistMenu(true);
                return;
              }
              // Keep format ranges glued to their words as the text changes.
              setBodyFormats((prev) => adjustRangesForEdit(prev, body, next));
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
                    className="relative ml-1 p-1.5 -m-1.5 text-[var(--quant-muted-foreground)] hover:text-red-400 after:absolute after:-inset-[16px] after:content-['']"
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
            className="group relative flex items-center gap-2 rounded-xl after:absolute after:-inset-[6px] after:content-[''] bg-gradient-to-r from-[var(--quant-primary)] to-[#F97316] px-4 py-2 text-xs font-bold text-black shadow-lg shadow-[var(--quant-primary)]/20 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
            title="Send email (⌘↵ or Ctrl+Enter)"
          >
            <IconSend className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
            <span>Send (⌘↵)</span>
          </button>

          {/* Formatting Toggle */}
          <button
            type="button"
            onClick={() => setShowFormatting(!showFormatting)}
            className={`relative p-2 rounded-xl after:absolute after:-inset-[6px] after:content-[''] border transition-colors ${
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
            className="p-2 rounded-xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] text-[var(--quant-muted-foreground)] hover:text-[var(--quant-primary)] hover:border-[var(--quant-primary)]/40 transition-colors relative after:absolute after:-inset-[6px] after:content-['']"
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
              className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl after:absolute after:-inset-[6px] after:content-[''] border border-[#8B5CF6]/40 bg-[#3B0764]/20 text-[#8B5CF6] hover:bg-[#3B0764]/40 hover:border-[#8B5CF6] transition-all text-xs font-semibold"
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
                  <IconSparkle className="size-3.5 text-[#8B5CF6]" />
                  <span>Draft Full Email</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleWritingAssist('formal')}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-[#3B0764]/40 text-left text-xs text-white transition-colors"
                >
                  <IconFormat className="size-3.5 text-[#8B5CF6]" />
                  <span>Make More Formal</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleWritingAssist('concise')}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-[#3B0764]/40 text-left text-xs text-white transition-colors"
                >
                  <IconMinus className="size-3.5 text-[#8B5CF6]" />
                  <span>Make Concise &amp; Punchy</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleWritingAssist('followup')}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-[#3B0764]/40 text-left text-xs text-white transition-colors"
                >
                  <IconSend className="size-3.5 text-[#8B5CF6]" />
                  <span>Polite Follow-Up</span>
                </button>
              </div>
            )}
          </div>

          {/* Saved email templates — the real backend-backed picker
              (EmailTemplates.tsx, /email-templates CRUD). Anchored to the
              button via the portaled popover below. */}
          <div className="relative" ref={templatesAnchorRef}>
            <button
              type="button"
              onClick={() => {
                // Capture the anchor rect BEFORE toggling, so the portaled
                // popover can position itself above the button even though the
                // toolbar scrolls horizontally on mobile.
                if (!showTemplates && templatesAnchorRef.current) {
                  const rect = templatesAnchorRef.current.getBoundingClientRect();
                  setTemplatesMenuPos({
                    left: Math.max(8, Math.min(rect.left, window.innerWidth - 348)),
                    bottom: Math.max(8, window.innerHeight - rect.top + 8),
                  });
                }
                setShowTemplates((prev) => !prev);
              }}
              aria-expanded={showTemplates}
              aria-label="Insert a saved email template"
              className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl after:absolute after:-inset-[6px] after:content-[''] border border-[var(--quant-primary)]/40 bg-[var(--quant-primary)]/10 text-[var(--quant-primary)] hover:bg-[var(--quant-primary)]/20 hover:border-[var(--quant-primary)] transition-all text-xs font-semibold"
              title="Insert a saved email template"
            >
              <IconTemplate className="size-3.5" />
              <span>Templates</span>
            </button>
          </div>
        </div>

        {/* Discard Draft — same close path as X (QM-UIUX-083) */}
        <button
          type="button"
          onClick={requestCloseComposer}
          className="relative p-2 rounded-xl after:absolute after:-inset-[6px] after:content-[''] text-[#6B7280] hover:text-red-400 hover:bg-white/5 transition-colors flex-shrink-0"
          title="Discard draft"
        >
          <IconTrash className="size-4" />
        </button>
      </div>
      {confirmDialog}
      {/* Saved-templates picker — portaled to document.body with fixed
          positioning so the toolbar's horizontal scroll (overflow-x-auto on
          mobile) can never clip it. Reads from the real backend
          /email-templates CRUD via the Next proxy. */}
      {showTemplates &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowTemplates(false)}
              aria-hidden="true"
            />
            <div
              className="fixed z-50"
              style={
                templatesMenuPos
                  ? { left: templatesMenuPos.left, bottom: templatesMenuPos.bottom }
                  : { left: 12, bottom: 76 }
              }
              role="dialog"
              aria-label="Saved email templates"
            >
              <EmailTemplates
                isOpen={showTemplates}
                onClose={() => setShowTemplates(false)}
                onSelectTemplate={applySavedTemplate}
                variant="popover"
              />
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
