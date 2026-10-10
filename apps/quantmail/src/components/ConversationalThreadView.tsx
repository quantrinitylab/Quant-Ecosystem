'use client';

import { Fragment, useState, useCallback, useEffect, useId, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { apiClient } from '../services/api-client';
import type { ContactGroup, Email, EmailAttachment, EmailLabel, EmailThread, MessageKind } from '../types';
import {
  useContactGroups,
  useUpdateContactGroup,
  useDeleteContactGroup,
} from '../hooks/useContactGroups';
import { GroupInfoModal, ContactProfileInspector, Inspector } from './GroupInfoModal';
import { GroupEditorModal, type GroupDraft } from './GroupEditorModal';
import { AddMemberModal } from './AddMemberModal';
import { AnchoredMenu } from './AnchoredMenu';
import { EmailSnooze } from './EmailSnooze';
import { ThreadBubbleShell } from './ThreadBubbleGestures';
import { showToast } from './InboxToast';
import { useUndoSend } from './UndoSendCountdownBar';
import { SmartReplySuggestions } from './SmartReplySuggestions';
import { IdentityAvatar } from './IdentityAvatar';
import { EmailLetterCard } from './EmailLetterCard';
import { MessageKindBadge, ThreadKindBadge } from './MessageKindBadge';
import { AttachmentPreview } from './AttachmentPreview';
import { EmailReadReceipt } from './EmailReadReceipt';
import { Quanty } from './Quanty';
import { quantyReact, useQuantyMood } from '../lib/quanty/reactions';
import { IconChat, IconMail } from './icons';
import {
  findConversation,
  groupEmailsIntoThreads,
  isFromMe,
  messageKindOf,
  messageRowIds,
  sanitizeSnippetText,
  summarizeParticipants,
  threadKindMix,
  threadParticipants,
} from '../lib/threading';
import { looksLikeMarkdown, useSafeMarkdownHtml } from '../lib/markdown';
import { invalidateMailLists } from '../lib/offline/folders';
import { plainTextToHtml } from '../lib/email-body';
import { ThreadSummaryCard, messagesToSummaryPayload, type ThreadSummaryResult } from './ThreadSummaryCard';
import { useAuth } from '../providers/auth-provider';
import { useDeferredMount } from '../hooks/useDeferredMount';
import { useInbox } from '../hooks/useInbox';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import {
  useThreadRealtime,
  type ThreadRealtimeMessage,
  type ThreadTypingPeer,
} from '../hooks/useThreadRealtime';
import { isCoarsePointer } from './SwipeableEmailRow';

/**
 * The thread reader is what a mail click lands on, so its chunk is on the
 * critical path — and Quanty's drawer is not. Deferred until the assistant is
 * first opened; latched from then on so the conversation survives a close.
 */
const QuantyCopilotDrawer = dynamic(() => import('./QuantyCopilotDrawer'), { ssr: false });

/**
 * Email-chat P0-4: a `typing:true` with no matching `typing:false` after this
 * long is a dead socket — the indicator clears itself client-side instead of
 * sticking forever.
 */
const TYPING_EXPIRY_MS = 5_000;
/** Our own `typing:false` goes out this long after the last keystroke. */
const TYPING_IDLE_SEND_MS = 1_500;

/**
 * A realtime `message.new` carries the wire payload, not a full mailbox row —
 * build the Email the thread stream renders, filling every field the wire
 * never sends with the same defaults a fresh arrival gets. Returns a complete,
 * correctly-typed Email (no casts): the payload's optional strings become the
 * required ones via `?? ''`, and its date-ish fields become real Dates.
 */
function threadRealtimeMessageToEmail(payload: ThreadRealtimeMessage): Email {
  const toDate = (value: string | Date | null | undefined): Date => {
    if (value instanceof Date) return value;
    if (typeof value === 'string' && value) {
      const parsedDate = new Date(value);
      if (!Number.isNaN(parsedDate.getTime())) return parsedDate;
    }
    return new Date();
  };
  return {
    id: payload.id,
    createdAt: toDate(payload.createdAt),
    updatedAt: new Date(),
    threadId: payload.threadId,
    userId: '',
    from: payload.from,
    to: [],
    cc: [],
    bcc: [],
    subject: payload.subject ?? '',
    bodyText: payload.bodyText ?? '',
    bodyHtml: payload.bodyHtml ?? '',
    snippet: payload.snippet ?? '',
    priority: 'normal',
    category: 'primary',
    status: 'delivered',
    // Same default as `messageKindOf`: anything that isn't 'chat' reads as mail.
    messageKind: payload.messageKind === 'chat' ? 'chat' : 'mail',
    isRead: true,
    isStarred: false,
    isArchived: false,
    isDraft: false,
    labels: [],
    attachments: [],
    references: [],
    headers: {},
    receivedAt: toDate(payload.receivedAt),
  };
}

function normalizedEmail(value?: string): string {
  return (value ?? '').trim().toLowerCase();
}

function normalizedGroupSubject(value?: string): string {
  return (value ?? '')
    .replace(/^(?:re|fwd):\s*/gi, '')
    .replace(/^\[group\]\s*/i, '')
    .trim()
    .toLowerCase();
}

function messageParticipantAddresses(messages: Email[], currentEmail: string): Set<string> {
  const ownAddress = normalizedEmail(currentEmail);
  const addresses = new Set<string>();

  for (const message of messages) {
    const candidates = [
      message.from?.email,
      ...(message.to ?? []).map((recipient) => recipient.email),
      ...(message.cc ?? []).map((recipient) => recipient.email),
    ];

    for (const candidate of candidates) {
      const email = normalizedEmail(candidate);
      if (email && email !== ownAddress) addresses.add(email);
    }
  }

  return addresses;
}

/**
 * Which messages start expanded when a thread loads.
 *
 * Chat-kind messages always start expanded — in chat you read the whole
 * conversation, you don't open letters one at a time. Mail-kind keeps the
 * old rule: short threads (≤2 messages) open everything, long threads open
 * only the latest message.
 *
 * Exported for unit tests.
 */
export function autoExpandedIndices(msgs: Email[]): Set<number> {
  const expanded = new Set<number>();
  msgs.forEach((m, i) => {
    if (messageKindOf(m) === 'chat') expanded.add(i);
  });
  if (msgs.length <= 2) {
    msgs.forEach((_, i) => expanded.add(i));
  } else {
    expanded.add(msgs.length - 1);
  }
  return expanded;
}

function findActiveGroup(
  groups: ContactGroup[],
  messages: Email[],
  currentEmail: string,
  subject: string,
): ContactGroup | null {
  if (groups.length === 0 || messages.length === 0) return null;

  const normalizedSubject = normalizedGroupSubject(subject);

  const subjectMatch = groups.find(
    (group) => normalizedGroupSubject(group.name) === normalizedSubject,
  );

  if (subjectMatch) return subjectMatch;

  const participants = messageParticipantAddresses(messages, currentEmail);

  return (
    groups
      .filter((group) => group.emails.length > 0)
      .map((group) => ({
        group,
        addresses: new Set(group.emails.map(normalizedEmail).filter(Boolean)),
      }))
      .filter(
        ({ addresses }) =>
          addresses.size === participants.size &&
          [...addresses].every((email) => participants.has(email)),
      )
      .map(({ group }) => group)[0] ?? null
  );
}

function formatMessageDate(value?: string | Date): string {
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Full timestamp for hover tooltips: the bubble shows the compact relative
 * time ("2m ago") subtly at all times, and desktop hover reveals the exact
 * date-time — WhatsApp/Telegram's contract.
 */
function formatFullDate(value?: string | Date): string {
  if (!value) return '';
  return new Date(value).toLocaleString();
}

/**
 * Read-receipt status for a message bubble, WhatsApp-style.
 *
 * Ticks only ever appear on YOUR messages (outbound) — inbound rows never get
 * them, exactly like a messaging app.
 *
 * Backed by the read-receipt pipeline: `deliveredAt` is stamped when the
 * message reaches the recipient's mailbox (internal delivery) or the outbound
 * transport accepts it (external), and `readAt` is stamped on your sent copy
 * when a recipient opens the thread (POST /threads/:id/read). Single grey =
 * sent, double grey = delivered, double green = read.
 */
function receiptStatusOf(
  message: Email,
  isOutbound: boolean,
): { status: 'sent' | 'delivered' | 'read' | 'unknown'; readAt?: string; deliveredAt?: string } | null {
  if (!isOutbound) return null;
  const readAt = message.readAt ? String(message.readAt) : undefined;
  const deliveredAt = message.deliveredAt ? String(message.deliveredAt) : undefined;
  if (readAt) return { status: 'read', readAt, deliveredAt };
  if (deliveredAt) return { status: 'delivered', deliveredAt };
  return { status: 'sent' };
}

/*
 * Chat-bubble vision: the thread reads like WhatsApp, so the stream is broken
 * into day groups with a centered pill — "Today", "Yesterday", the weekday for
 * the last week, then the full date.
 */
function dayKey(value?: string | Date): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

function formatDayDivider(value?: string | Date): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const thatDay = new Date(date);
  thatDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - thatDay.getTime()) / 86_400_000);

  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

function cleanContactName(name: string | undefined, email: string): string {
  const explicit = name?.trim();
  if (explicit && normalizeAddress(explicit) !== normalizeAddress(email)) return explicit;
  const local = normalizeAddress(email)
    .split('@')[0]
    .replace(/\d+/g, '')
    .replace(/[._-]+/g, ' ')
    .trim();
  const first = local.split(/\s+/).filter(Boolean)[0] || 'Contact';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function normalizeAddress(value?: string): string {
  return (value ?? '').trim().toLowerCase();
}
function normalizeGroupSubject(value?: string): string {
  let subject = (value ?? '').trim();
  while (/^(?:re|fwd):\s*/i.test(subject)) subject = subject.replace(/^(?:re|fwd):\s*/i, '').trim();
  return subject
    .replace(/^\[group\]\s*/i, '')
    .trim()
    .toLowerCase();
}

export interface ConversationalThreadViewProps {
  threadId: string;
  initialThread?: EmailThread | null;
  initialEmails?: Email[];
  subject?: string;
  onClose?: () => void;
  /**
   * Called with every message id in the conversation as resolved *here* — which is
   * the union of INBOX and ARCHIVE, so it is the widest and truest answer anyone
   * has. `/thread/<id>` had no other way to know what to archive, and archived
   * nothing at all as a result: its handler only navigated back to the inbox.
   */
  onArchive?: (messageIds: string[]) => void;
  /**
   * Called with the same conversation-wide id list as `onArchive` when the
   * conversation reads as archived and the reader chooses "Move to inbox".
   * Mirrors `onArchive` honestly: the backend contract is the same outbox
   * `unarchive` kind the row hover actions and the Archive bulk toolbar use.
   */
  onUnarchive?: (messageIds: string[]) => void;
  onDelete?: (messageIds: string[]) => void;
  onStarToggle?: (starred: boolean) => void;
  isStarred?: boolean;
  className?: string;
  variant?: 'pane' | 'full';
  isSpam?: boolean;
  onNotSpam?: (messageIds: string[]) => void;
  /**
   * Horizontal swipe on the message stream moves to the adjacent conversation
   * (Gmail mobile's between-email swipe). The view figures out the neighbors
   * from the same inbox grouping the rows use; the parent decides how the move
   * happens. When absent and the variant is 'full', the view pushes
   * `/thread/<id>` itself.
   */
  onNavigateToThread?: (threadId: string) => void;
}

/**
 * QM-UIUX-081: a chat bubble is a body surface. Bodies authored with the
 * composer's rich-text ranges (or received as Markdown) must render their
 * emphasis, never show raw "**" markers as literal text — the same rule
 * the letter view (EmailLetterCard) already follows.
 */
function ChatBubbleBody({ text }: { text: string }) {
  const markdownHtml = useSafeMarkdownHtml(text, looksLikeMarkdown(text));
  if (markdownHtml) {
    return (
      <div
        className="break-words text-sm leading-relaxed [&_p]:mb-1 [&_p:last-child]:mb-0"
        dangerouslySetInnerHTML={{ __html: markdownHtml }}
      />
    );
  }
  return (
    <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{text}</div>
  );
}

export function ConversationalThreadView({
  threadId,
  initialThread,
  initialEmails = [],
  subject = '(No Subject)',
  onClose,
  onArchive,
  onUnarchive,
  onDelete,
  onStarToggle,
  isStarred = false,
  className = '',
  variant = 'pane',
  isSpam = false,
  onNotSpam,
  onNavigateToThread,
}: ConversationalThreadViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Normalized messages state
  const [messages, setMessages] = useState<Email[]>(() => {
    if (initialEmails && initialEmails.length > 0) return initialEmails;
    if (initialThread?.messages && initialThread.messages.length > 0) return initialThread.messages;
    return [];
  });
  const primaryMessage = messages[0];

  const [threadSubject, setThreadSubject] = useState(
    subject || initialThread?.subject || '(No Subject)',
  );
  const [starred, setStarred] = useState(isStarred || initialThread?.isStarred || false);
  const [isLoading, setIsLoading] = useState(messages.length === 0);

  // Accordion state: Set of message indices that are expanded
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());
  // SIA-P1-4: real email headers (From/To/Subject/Date) are visible by default —
  // the set tracks the ones the reader explicitly collapsed.
  const [collapsedDetailsIndices, setCollapsedDetailsIndices] = useState<Set<number>>(new Set());

  /*
   * Double-tap ❤️ quick react (WhatsApp parity).
   *
   * There is no message-reaction endpoint on the mail backend yet, so reactions
   * live in local state, persisted per thread in localStorage. They render on
   * both the collapsed strip and the expanded card, and the double-tap fires a
   * heart burst over the bubble like WhatsApp.
   *
   * TODO(reactions-pipeline): when the backend gains
   * `POST /api/messages/:id/reactions`, replace the localStorage write with the
   * API call and hydrate from the message payload instead.
   */
  const [messageReactions, setMessageReactions] = useState<Record<string, string[]>>({});
  const lastTapAtRef = useRef<Record<string, number>>({});
  const [heartBurst, setHeartBurst] = useState<{ msgKey: string; key: number } | null>(null);

  useEffect(() => {
    lastTapAtRef.current = {};
    setHeartBurst(null);
    try {
      const raw = localStorage.getItem(`quantmail:reactions:${threadId}`);
      setMessageReactions(raw ? (JSON.parse(raw) as Record<string, string[]>) : {});
    } catch {
      setMessageReactions({});
    }
  }, [threadId]);

  useEffect(() => {
    try {
      localStorage.setItem(
        `quantmail:reactions:${threadId}`,
        JSON.stringify(messageReactions),
      );
    } catch {
      // Storage full or unavailable — reactions simply won't survive a reload.
    }
  }, [messageReactions, threadId]);

  const toggleHeartReact = useCallback((msgKey: string) => {
    setMessageReactions((prev) => {
      const current = prev[msgKey] ?? [];
      const next = current.includes('❤️')
        ? current.filter((r) => r !== '❤️')
        : [...current, '❤️'];
      return { ...prev, [msgKey]: next };
    });
  }, []);

  /*
   * Double-tap detector for message bubbles. Two taps within 300ms on the same
   * bubble toggle the ❤️ react. Taps on interactive content (links, buttons,
   * selectable letter HTML) are ignored so double-tap-to-select text and
   * double-tap link zoom keep working. Single taps are untouched: the collapsed
   * strip still expands on click, and the expanded header bar still collapses.
   */
  const handleBubbleTouchEnd = useCallback(
    (msgKey: string) => (e: React.TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('a,button,input,textarea,select,[contenteditable="true"]')) return;
      if (window.getSelection() && !window.getSelection()?.isCollapsed) return;
      const now = Date.now();
      const last = lastTapAtRef.current[msgKey] ?? 0;
      if (now - last < 300) {
        lastTapAtRef.current[msgKey] = 0;
        toggleHeartReact(msgKey);
        setHeartBurst({ msgKey, key: now });
      } else {
        lastTapAtRef.current[msgKey] = now;
      }
    },
    [toggleHeartReact],
  );

  // Quick reply & AI state
  const [quickReplyText, setQuickReplyText] = useState('');
  /*
   * Quoted reply: set when a thread gesture (swipe-right, menu Reply) targets
   * a specific message. The send below replies to this message instead of the
   * latest one, and a chip above the bar shows what is being answered.
   */
  const [quotedMessage, setQuotedMessage] = useState<Email | null>(null);
  const quickReplyInputRef = useRef<HTMLInputElement>(null);
  const [isSendingQuickReply, setIsSendingQuickReply] = useState(false);
  const [isQuantyOpen, setIsQuantyOpen] = useState(false);
  const showQuanty = useDeferredMount(isQuantyOpen);
  const [replyError, setReplyError] = useState<string | null>(null);
  /*
   * The shared undo-send queue from AppShell's UndoSendProvider — the same
   * 10-second recall window the composers send through. Quick reply used to
   * fire its API call the instant Send was pressed, so the fastest send path
   * in the app was the only one with no way back (QM-UIUX-087).
   */
  const { queueSend } = useUndoSend();

  /*
   * The face on the reply bar's copilot trigger. `mail` and `sys` only: this bar writes and
   * sends, so a send outcome and a dropped connection are both its business, while a Drive
   * upload three panes away is not.
   *
   * It was a hardcoded `expression="happy"` — the `arch` eye, a ∩ stroked rather than
   * filled, which at 20px is indistinguishable from a shut lid.
   */
  const quantyFace = useQuantyMood({ channels: ['mail', 'sys'] });

  /**
   * Which of the two things the bar at the bottom is about to write.
   *
   * `chat` sends the typed line straight into this conversation. `mail` hands the
   * same text to the full composer, where it gains a subject, cc/bcc and rich
   * formatting before it leaves. Both land in this thread and both are marked, so
   * the choice is about how much ceremony the message needs, not about where it
   * ends up. Defaults to `chat` because that is the cheap case and the one the bar
   * is shaped for.
   */
  const [composeMode, setComposeMode] = useState<MessageKind>('chat');

  // Attachments in quick reply bar
  const [pendingAttachments, setPendingAttachments] = useState<
    Array<{ name: string; size: number; dataUrl: string; type: string }>
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /**
   * Stable base for the per-message ids this view hands to `aria-controls`.
   *
   * One `useId` for the component, suffixed with the message index, because the
   * ids are minted inside a `map` and every expanded message needs its own.
   */
  const detailsBaseId = useId();

  const loadedThreadIdRef = useRef<string | null>(null);

  const { user: currentUser } = useAuth();
  const currentEmail = (currentUser?.email || '').toLowerCase();
  const currentHandle = currentEmail.split('@')[0];
  const { data: contactGroups } = useContactGroups();
  const updateGroup = useUpdateContactGroup();
  const deleteGroup = useDeleteContactGroup();
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ContactGroup | null>(null);
  const [addingMembersGroup, setAddingMembersGroup] = useState<ContactGroup | null>(null);
  const [confirmTrash, setConfirmTrash] = useState(false);
  /** Single message awaiting delete confirmation from the bubble menu. */
  const [confirmDeleteMessage, setConfirmDeleteMessage] = useState<Email | null>(null);

  const openReplyComposer = useCallback(() => {
    const recipient = primaryMessage?.from?.email || '';
    const subj = threadSubject.startsWith('Re:') ? threadSubject : `Re: ${threadSubject}`;
    router.push(
      `/compose?to=${encodeURIComponent(recipient)}&subject=${encodeURIComponent(subj)}&replyTo=${primaryMessage?.id || threadId}`,
    );
  }, [primaryMessage, router, threadId, threadSubject]);

  /**
   * QM-UIUX-046: real thread-summarization entry point. Maps the loaded
   * messages to the backend payload and calls the real AI service
   * (`POST /api/ai/summarize-thread`). Throws on failure so the card shows
   * its honest error state; never fabricates a summary.
   */
  const handleSummarizeThread = useCallback(async (): Promise<ThreadSummaryResult> => {
    const payload = messagesToSummaryPayload(messages);
    const res = await apiClient.aiSummarizeThread(payload);
    const data = res.data;
    if (!res.success || !data?.summary) {
      // BB-P1-5: carry the backend error code so the card can tell "AI is not
      // available here" apart from a transient failure. Never fabricate.
      const err = new Error(res.error?.message || 'Summarization failed') as Error & {
        code?: string;
      };
      err.code = res.error?.code;
      throw err;
    }
    return {
      summary: data.summary,
      keyPoints: data.keyPoints ?? [],
      actionItems: data.actionItems ?? [],
      messageCount: data.messageCount ?? payload.length,
    };
  }, [messages]);

  const openReplyAllComposer = useCallback(() => {
    const recipients = messages
      .flatMap((m) => [m.from?.email, ...(m.to ?? []).map((to) => to.email)])
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(',');
    const subj = threadSubject.startsWith('Re:') ? threadSubject : `Re: ${threadSubject}`;
    router.push(
      `/compose?to=${encodeURIComponent(recipients)}&subject=${encodeURIComponent(subj)}&replyTo=${messages.at(-1)?.id || threadId}`,
    );
  }, [messages, router, threadId, threadSubject]);

  const openForwardComposer = useCallback(() => {
    const latest = messages.at(-1) || primaryMessage;
    const body = latest?.bodyText || latest?.snippet || '';
    const subj = threadSubject.startsWith('Fwd:') ? threadSubject : `Fwd: ${threadSubject}`;
    router.push(
      `/compose?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body ? `\n\n---------- Forwarded message ---------\n${body}` : '')}`,
    );
  }, [messages, primaryMessage, router, threadSubject]);

  /*
   * Per-message gestures: swipe-right / menu Reply quotes this message into
   * the quick-reply bar; menu Forward carries this message's body into the
   * full composer. Both land the user in the bar they were already using.
   */
  const startQuoteReply = useCallback((message: Email) => {
    setQuotedMessage(message);
    // A quoted answer is a chat line, not a letter — even if the mode switch
    // above was flipped to Mail, the gesture means "answer this now".
    setComposeMode('chat');
    requestAnimationFrame(() => quickReplyInputRef.current?.focus());
  }, []);

  const forwardMessage = useCallback(
    (message: Email) => {
      const body = message.bodyText || message.snippet || '';
      const subj = threadSubject.startsWith('Fwd:') ? threadSubject : `Fwd: ${threadSubject}`;
      router.push(
        `/compose?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body ? `\n\n---------- Forwarded message ---------\n${body}` : '')}`,
      );
    },
    [router, threadSubject],
  );

  /*
   * Per-message delete from the bubble menu. Asks first — a long-press menu
   * is one mis-tap away from data loss, and the thread header's whole-thread
   * delete already set the confirm-before-trash precedent.
   */
  const deleteMessage = useCallback((message: Email) => {
    setConfirmDeleteMessage(message);
  }, []);

  const otherParticipant = useMemo(() => {
    const addresses = threadParticipants(messages, currentEmail);
    const email = addresses[0] || '';
    const source = messages.find(
      (message) => normalizeAddress(message.from?.email) === normalizeAddress(email),
    );
    return { email, name: cleanContactName(source?.from?.name, email) };
  }, [currentEmail, messages]);

  const activeGroup = useMemo(() => {
    const groups = contactGroups ?? [];
    const subject = normalizeGroupSubject(threadSubject);
    const subjectMatch = groups.find((group) => normalizeGroupSubject(group.name) === subject);
    if (subjectMatch) return subjectMatch;
    const actual = new Set(threadParticipants(messages, currentEmail).map(normalizeAddress));
    return (
      groups.find((group) => {
        const expected = new Set(group.emails.map(normalizeAddress));
        return (
          expected.size > 1 &&
          expected.size === actual.size &&
          [...expected].every((email) => actual.has(email))
        );
      }) ?? null
    );
  }, [contactGroups, currentEmail, messages, threadSubject]);

  useEffect(() => {
    setGroupInfoOpen(false);
    setProfileOpen(false);
  }, [threadId]);

  // Derive participant summary for header
  /**
   * The name at the top of the conversation.
   *
   * Whoever this conversation is *with* — which is not the same question as "who
   * wrote the message you are looking at", and the difference is what put `You` at
   * the top of an eleven-message conversation with someone else. This component
   * used to walk the messages itself and collect a sender per message, so a thread
   * you had done all the talking in was titled with your own name and gave the
   * reader nothing: they already know they sent it.
   *
   * `threadParticipants` is the inbox row's own answer, so the title of the page
   * now matches the row that opened it by construction. It returns `[]` for a
   * genuine note-to-self, and `summarizeParticipants` renders that as `You` — the
   * one case where your own name is the right title.
   */
  const participantSummary = useMemo(
    () => summarizeParticipants(threadParticipants(messages, currentEmail)),
    [messages, currentEmail],
  );

  /**
   * Whether this conversation holds both letters and typed lines.
   *
   * The per-message mark is worth its pixels only when the two kinds are mixed. A
   * conversation of nothing but letters put `Mail` on every message in it, which is
   * 100% coverage carrying no information, in the loudest colour on the palette —
   * the same defect the inbox row had. Where the kinds do mix, the mark is the only
   * thing distinguishing a letter from a line, so it stays and keeps its orange.
   */
  const showKindBadges = useMemo(() => threadKindMix(messages) === 'mixed', [messages]);

  /**
   * The thread-level kind mark for the header, shown for every thread —
   * matching the inbox row, which now carries the badge for all three mixes.
   * The per-message marks stay mixed-only (see above); the header mark is the
   * single consistent place the kind is named at thread level.
   */
  const conversationKindMix = useMemo(() => threadKindMix(messages), [messages]);

  /**
   * What the header's Archive and Trash buttons act on: the conversation, all of it.
   *
   * `messageRowIds`, not `messages.map(m => m.id)`, because a bubble can stand for
   * two stored rows — a send and its delivery copy — and moving only the visible
   * half left the conversation in the inbox and the archive at once.
   *
   * Falls back to the id in the URL when the messages have not arrived yet, so the
   * button is never wired to an empty list — a request for one id that turns out to
   * be a thread id is still better than a request for nothing.
   */
  const conversationMessageIds = useMemo(() => {
    const ids = messageRowIds(messages);
    return ids.length > 0 ? ids : [threadId].filter(Boolean);
  }, [messages, threadId]);

  /*
   * REG-2: the inbox rows gate their read toggle on this (BB-P1-1) because an
   * all-self conversation is definitionally read — the thread grouper reads
   * `every(m => m.isRead || isFromMe(m))`, so "Mark unread" on such a thread
   * flips rows the list can never show. The More menu shipped the item
   * ungated: the toast claimed success while the inbox could never change.
   * Gate it the same way — a dead control with a lying toast is worse than
   * no control.
   */
  const canToggleRead = useMemo(
    () => messages.some((m) => !isFromMe(m, currentEmail)),
    [messages, currentEmail],
  );

  /**
   * Whether the conversation reads as archived: every message in it carries
   * `isArchived`. Drives the Archive → "Move to inbox" swap in the header and
   * the "More conversation actions" menu — an Archive button on an archived
   * conversation is a false affordance (PAUD-P0-2 / QM-UIUX-075).
   */
  const conversationIsArchived =
    messages.length > 0 && messages.every((m) => m.isArchived === true);

  const isQuarantined =
    isSpam || messages.some((m) => (m as any).isSpam || (m as any).folderId === 'SPAM');
  const [isRescuingSpam, setIsRescuingSpam] = useState(false);

  const handleRescueSpam = useCallback(async () => {
    const targetId = messages[0]?.id || threadId;
    if (!targetId) return;
    setIsRescuingSpam(true);
    try {
      // QM-UIUX-095: apiClient resolves `{ success: false }` when the
      // server refuses — it never rejects — so a resolved failure must
      // take the error path too, not fall through to the success toast,
      // onNotSpam and onClose (same defect class as QM-UIUX-093).
      const res = await apiClient.markNotSpam(targetId);
      if (!res?.success) throw new Error(res?.error?.message || 'Failed to rescue email');
      showToast({ text: 'Rescued from spam — moved back to inbox', type: 'success' });
      if (onNotSpam) {
        onNotSpam(conversationMessageIds);
      }
      if (onClose) {
        onClose();
      }
      invalidateMailLists(queryClient);
    } catch (err) {
      showToast({
        text: err instanceof Error ? err.message : 'Failed to rescue email',
        type: 'error',
      });
    } finally {
      setIsRescuingSpam(false);
    }
  }, [messages, threadId, conversationMessageIds, onNotSpam, onClose, queryClient]);

  /**
   * The conversation this view is about, resolved the way the inbox resolved it.
   *
   * `GET /threads/:id` answers a different question than the row asked. It returns
   * the messages that share one server `threadId`, and a row is now a person, so
   * tapping a row that counted `11` opened a page that said `1 Message`. The row and
   * the page it opened cannot be allowed to disagree about what a conversation is,
   * and the row is the one that is right.
   *
   * So the id is resolved against the same grouping, over the same mailbox queries the
   * inbox is already subscribed to — same keys, so this costs no request when the view
   * is the reading pane, and two the sidebar was making anyway on the `/thread/<id>`
   * route. Refetches flow straight through, which is what makes a reply that arrives
   * while you are reading appear without a reload.
   *
   * Archive is unioned in, and that union is the point. `isArchived` is a per-message
   * flag, so archiving a received message removed it from its own conversation: this
   * correspondent's live thread held eleven messages I had sent and *none* of the
   * three they had sent back, because those three sat in `ARCHIVE`. A folder-scoped
   * list is the right shape for the inbox — a row you archived should leave it — but
   * inside a conversation it reads as the other person never having replied. Reading
   * a conversation is not a folder query. Trash and spam stay out; those are removals,
   * not filing.
   *
   * `null` while both queries are cold and when the id is in neither mailbox — spam,
   * trash, or a link to something older than the page being held — which is what the
   * server fetch below is still here for.
   */
  const { data: inboxMail, isPending: inboxPending } = useInbox({ folderType: 'INBOX' });
  const { data: archivedMail, isPending: archivePending } = useInbox({ folderType: 'ARCHIVE' });
  const mailboxPending = inboxPending || archivePending;

  const conversationSource = useMemo(() => {
    // Deduped by id: the default mailbox already carries sent mail, so a message can
    // legitimately answer to more than one folder query. Inbox order wins.
    const byId = new Map<string, Email>();
    for (const email of [...(inboxMail ?? []), ...(archivedMail ?? [])]) {
      if (email?.id && !byId.has(email.id)) byId.set(email.id, email);
    }
    return Array.from(byId.values());
  }, [inboxMail, archivedMail]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  /**
   * Thread navigation gestures — swipe between conversations, a "new messages"
   * jump pill, and pull-to-load-older. All three live on the message stream's
   * scroll container.
   */

  /** Neighbors in the inbox's own conversation order (newest first). */
  const orderedConversations = useMemo(() => {
    if (!threadId || conversationSource.length === 0) return [];
    return groupEmailsIntoThreads(conversationSource, currentEmail);
  }, [threadId, conversationSource, currentEmail]);

  const adjacentThreadIds = useMemo(() => {
    if (orderedConversations.length === 0) return { previous: null as string | null, next: null as string | null };
    const current = findConversation(orderedConversations, threadId);
    if (!current) return { previous: null, next: null };
    const index = orderedConversations.indexOf(current);
    return {
      // "previous" is the newer conversation (up the inbox list).
      previous: index > 0 ? orderedConversations[index - 1].id : null,
      // "next" is the older conversation (down the inbox list).
      next: index < orderedConversations.length - 1 ? orderedConversations[index + 1].id : null,
    };
  }, [orderedConversations, threadId]);

  const navigateToThread = useCallback(
    (targetId: string) => {
      if (!targetId || targetId === threadId) return;
      if (onNavigateToThread) {
        onNavigateToThread(targetId);
        return;
      }
      if (variant === 'full') router.push(`/thread/${encodeURIComponent(targetId)}`);
    },
    [onNavigateToThread, router, threadId, variant],
  );

  /**
   * Pull-to-load-older: at the very top of the stream, a downward pull asks the
   * server for the full thread and folds in any messages the mailbox grouping
   * had not seen (older history beyond the held page). A merge by id keeps this
   * idempotent — when everything is already here it is a quiet no-op.
   */
  const loadOlderMessages = useCallback(async () => {
    invalidateMailLists(queryClient);
    try {
      const threadRes = await apiClient.getThread(threadId).catch(() => null);
      const serverMessages = (threadRes?.data?.messages ||
        (threadRes?.data as { emails?: Email[] } | undefined)?.emails ||
        []) as Email[];
      if (serverMessages.length === 0) return;
      setMessages((prev) => {
        const known = new Set(prev.map((message) => message.id));
        const fresh = serverMessages.filter((message) => message?.id && !known.has(message.id));
        if (fresh.length === 0) return prev;
        const merged = [...fresh, ...prev];
        merged.sort(
          (a, b) =>
            new Date(a.receivedAt || a.createdAt || 0).getTime() -
            new Date(b.receivedAt || b.createdAt || 0).getTime(),
        );
        return merged;
      });
    } catch {
      // The spinner already finished; a failed pull is silence, not an error
      // banner — the stream keeps what it has.
    }
  }, [queryClient, threadId]);

  /**
   * Email-chat P0-3/P0-4: realtime transport + typing indicators.
   *
   * The 30s mailbox poll stays as the fallback (message.new is a delivery hint;
   * the poll and `GET /threads/:id` remain the source of truth), but an open
   * thread now updates the moment a message lands instead of up to 30s later.
   */
  /** clientMessageId → optimistic local id, until the broadcast reconciles it */
  const optimisticIdsRef = useRef(new Map<string, string>());
  const [typingPeers, setTypingPeers] = useState<
    Record<string, { displayName: string; lastTs: number }>
  >({});
  const ownTypingRef = useRef(false);
  const typingIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** A realtime `message.new` for this thread — merge or reconcile, never duplicate. */
  const handleRealtimeMessage = useCallback(
    (payload: ThreadRealtimeMessage) => {
      const clientMessageId = payload.clientMessageId;
      const pendingId = clientMessageId ? optimisticIdsRef.current.get(clientMessageId) : undefined;
      setMessages((prev) => {
        if (pendingId) {
          const idx = prev.findIndex((m) => m.id === pendingId);
          if (idx >= 0) {
            // Our optimistic bubble is on screen — swap it for the persisted row.
            const next = [...prev];
            next[idx] = {
              ...next[idx],
              ...payload,
              id: payload.id,
              receivedAt: payload.receivedAt ?? next[idx].receivedAt,
              createdAt: payload.createdAt ?? next[idx].createdAt,
            } as Email;
            optimisticIdsRef.current.delete(clientMessageId as string);
            return next;
          }
          // The broadcast beat the HTTP response: the server row arrives first.
          // Keep the mapping so the send handler below can skip the optimistic
          // copy instead of adding it as a duplicate.
        }
        if (prev.some((m) => m.id === payload.id)) return prev;
        const incoming = threadRealtimeMessageToEmail(payload);
        const merged = [...prev, incoming];
        merged.sort(
          (a, b) =>
            new Date(a.receivedAt || a.createdAt || 0).getTime() -
            new Date(b.receivedAt || b.createdAt || 0).getTime(),
        );
        return merged;
      });
      // The inbox behind this pane lists the same thread — it has a new message.
      invalidateMailLists(queryClient);
    },
    [queryClient],
  );

  /** A realtime `typing` event — track/clear the peer's indicator state. */
  const handleRealtimeTyping = useCallback((peer: ThreadTypingPeer) => {
    setTypingPeers((prev) => {
      if (!peer.typing) {
        if (!prev[peer.userId]) return prev;
        const { [peer.userId]: _dropped, ...rest } = prev;
        return rest;
      }
      return { ...prev, [peer.userId]: { displayName: peer.displayName, lastTs: peer.ts } };
    });
  }, []);

  const { sendTyping } = useThreadRealtime({
    threadId,
    enabled: Boolean(threadId),
    onMessage: handleRealtimeMessage,
    onTyping: handleRealtimeTyping,
  });

  // Typing peers expire without a `typing:false` — a dead socket's indicator
  // must not stick forever. Runs cheaply every 1.5s only while this view lives.
  useEffect(() => {
    const timer = setInterval(() => {
      setTypingPeers((prev) => {
        const cutoff = Date.now() - TYPING_EXPIRY_MS;
        const next: Record<string, { displayName: string; lastTs: number }> = {};
        let changed = false;
        for (const [id, peer] of Object.entries(prev)) {
          if (peer.lastTs > cutoff) next[id] = peer;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 1_500);
    return () => clearInterval(timer);
  }, []);

  // Leaving the conversation drops peer indicators and any in-flight mappings.
  useEffect(() => {
    setTypingPeers({});
    optimisticIdsRef.current.clear();
    if (ownTypingRef.current) {
      ownTypingRef.current = false;
      sendTyping(false);
    }
    if (typingIdleRef.current) {
      clearTimeout(typingIdleRef.current);
      typingIdleRef.current = null;
    }
  }, [threadId, sendTyping]);

  const stopOwnTyping = useCallback(() => {
    if (typingIdleRef.current) {
      clearTimeout(typingIdleRef.current);
      typingIdleRef.current = null;
    }
    if (ownTypingRef.current) {
      ownTypingRef.current = false;
      sendTyping(false);
    }
  }, [sendTyping]);

  /** Quick-reply input changes also drive our own typing broadcast (P0-4). */
  const handleQuickReplyChange = useCallback(
    (value: string) => {
      setQuickReplyText(value);
      if (value.trim().length === 0) {
        stopOwnTyping();
        return;
      }
      if (!ownTypingRef.current) {
        ownTypingRef.current = true;
        sendTyping(true);
      }
      if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
      typingIdleRef.current = setTimeout(stopOwnTyping, TYPING_IDLE_SEND_MS);
    },
    [sendTyping, stopOwnTyping],
  );

  const {
    listProps: pullListProps,
    pullDistance,
    isRefreshing: isLoadingOlder,
  } = usePullToRefresh({ onRefresh: loadOlderMessages });

  /** "↓ N new" pill: arrivals while the reader is up in history. */
  const [newArrivedCount, setNewArrivedCount] = useState(0);
  const lastSeenCountRef = useRef(0);
  const initialLoadDoneRef = useRef(false);

  const scrollToLatest = useCallback(() => {
    setNewArrivedCount(0);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleStreamScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    // The reader caught up on their own — the pill has nothing to offer.
    if (distanceFromBottom < 120) setNewArrivedCount(0);
  }, []);

  useEffect(() => {
    // New conversation: the pill belongs to the old one.
    setNewArrivedCount(0);
    lastSeenCountRef.current = messages.length;
    initialLoadDoneRef.current = messages.length > 0;
  }, [threadId]);

  useEffect(() => {
    // Incoming growth while reading history — the 30s mailbox poll lands here.
    // Own sends are excluded: the send handler scrolls to the bottom itself and
    // the new bubble is one of ours.
    if (!initialLoadDoneRef.current) {
      if (messages.length > 0) {
        initialLoadDoneRef.current = true;
        lastSeenCountRef.current = messages.length;
      }
      return;
    }
    const previous = lastSeenCountRef.current;
    lastSeenCountRef.current = messages.length;
    if (messages.length <= previous) return;
    const latest = messages[messages.length - 1];
    const fromMe =
      normalizedEmail(latest?.from?.email) === normalizedEmail(currentEmail) ||
      Boolean((latest as { isOutbound?: boolean } | undefined)?.isOutbound);
    if (fromMe) return;
    const container = scrollContainerRef.current;
    const nearBottom = container
      ? container.scrollHeight - container.scrollTop - container.clientHeight < 120
      : true;
    if (nearBottom) {
      // Already watching the bottom — keep it pinned instead of yanking.
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    setNewArrivedCount((count) => count + (messages.length - previous));
  }, [messages, currentEmail]);

  /**
   * Horizontal swipe on the stream moves between conversations, Gmail-mobile
   * style: swipe left goes to the older conversation, swipe right to the newer.
   * Only on touch devices, and only when the gesture is clearly horizontal from
   * the start — anything else stays a vertical scroll. The pull-to-load-older
   * gesture owns downward travel at the top, so this one yields there.
   */
  const swipeTrackRef = useRef<{ startX: number; startY: number; claimed: boolean } | null>(null);
  const adjacentRef = useRef(adjacentThreadIds);
  useEffect(() => {
    adjacentRef.current = adjacentThreadIds;
  }, [adjacentThreadIds]);

  const handleSwipeTouchStart = useCallback(
    (event: React.TouchEvent) => {
      pullListProps.onTouchStart(event);
      if (!isCoarsePointer()) {
        swipeTrackRef.current = null;
        return;
      }
      const touch = event.touches[0];
      if (!touch) {
        swipeTrackRef.current = null;
        return;
      }
      swipeTrackRef.current = { startX: touch.clientX, startY: touch.clientY, claimed: false };
    },
    [pullListProps],
  );

  const handleSwipeTouchMove = useCallback(
    (event: React.TouchEvent) => {
      pullListProps.onTouchMove(event);
      const track = swipeTrackRef.current;
      if (!track || track.claimed || pullDistance > 0) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - track.startX;
      const dy = touch.clientY - track.startY;
      // Claim only a decisively horizontal gesture; vertical stays a scroll.
      if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy) * 1.8) track.claimed = true;
    },
    [pullListProps, pullDistance],
  );

  const handleSwipeTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      pullListProps.onTouchEnd(event);
      const track = swipeTrackRef.current;
      swipeTrackRef.current = null;
      if (!track?.claimed) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - track.startX;
      if (Math.abs(dx) < 90) return;
      const target = dx < 0 ? adjacentRef.current.next : adjacentRef.current.previous;
      if (!target) return;
      try {
        navigator.vibrate?.(12);
      } catch {
        /* haptics are best-effort */
      }
      navigateToThread(target);
    },
    [pullListProps, navigateToThread],
  );

  const handleSwipeTouchCancel = useCallback(
    (event: React.TouchEvent) => {
      pullListProps.onTouchCancel(event);
      swipeTrackRef.current = null;
    },
    [pullListProps],
  );

  const resolvedConversation = useMemo(() => {
    if (!threadId || conversationSource.length === 0) return null;
    return findConversation(groupEmailsIntoThreads(conversationSource, currentEmail), threadId);
  }, [conversationSource, threadId, currentEmail]);

  /**
   * Once the grouped conversation is in hand it is authoritative, and the server
   * thread fetch below must not be allowed to land on top of it — the two are racing
   * and the loser is whichever answers second, not whichever is right. Recording the
   * id it was resolved *for* rather than a bare flag is what makes this correct when
   * the reader moves to another conversation: the flag would still be set from the
   * last one, and effects declared earlier in this component run first.
   */
  const adoptedThreadIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!resolvedConversation) return;

    const msgs = resolvedConversation.messages;
    setMessages(msgs);
    setThreadSubject(resolvedConversation.subject || '(No Subject)');
    setStarred(resolvedConversation.isStarred);
    setIsLoading(false);

    // Only the first adoption of a conversation chooses what is open. Later ones are
    // refetches of the same conversation, and re-deciding then would close a message
    // the reader had just opened every time the mailbox polled.
    if (adoptedThreadIdRef.current !== threadId) {
      adoptedThreadIdRef.current = threadId;
      loadedThreadIdRef.current = threadId;
      setExpandedIndices(autoExpandedIndices(msgs));

      // Read-receipt pipeline: opening the thread marks the viewer's unread
      // received messages as read and propagates `readAt` to the senders'
      // sent copies, so their ticks flip to double-green. Fire-and-forget and
      // silent — a failed mark must never break reading.
      if (threadId) {
        apiClient.markThreadRead(threadId).catch(() => {});
      }
    }
  }, [resolvedConversation, threadId]);

  // Fetch thread messages if not pre-populated or update when threadId changes
  useEffect(() => {
    let isMounted = true;
    if (!threadId) {
      setIsLoading(false);
      return;
    }

    /*
     * The reading pane hands us the row's own messages, which is the right thing to
     * paint instantly and the wrong thing to keep: the row is folder-scoped, so an
     * archived reply is missing from it. So this is the seed, not the answer — it
     * yields the moment the union resolves the same conversation, and the adoption
     * effect above owns `messages` from then on.
     */
    if (initialEmails && initialEmails.length > 0) {
      if (!resolvedConversation) {
        setMessages(initialEmails);
        setExpandedIndices(autoExpandedIndices(initialEmails));
      }
      setIsLoading(false);
      return;
    }

    if (loadedThreadIdRef.current === threadId && messages.length > 0) {
      setIsLoading(false);
      return;
    }

    // The mailbox holds the better answer and it is still in flight. Fetching the
    // server thread now would paint the one-message version of an eleven-message
    // conversation for as long as the two requests are apart, and spend a request to
    // do it.
    if (mailboxPending) return;
    if (resolvedConversation) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    loadedThreadIdRef.current = threadId;

    // The grouped conversation is the answer whenever there is one; anything set
    // here after it arrives would be the narrower server thread overwriting it.
    const stale = () => !isMounted || adoptedThreadIdRef.current === threadId;

    const loadData = async () => {
      try {
        // 1. Try fetching as thread
        const threadRes = await apiClient.getThread(threadId).catch(() => null);
        if (threadRes && threadRes.success && threadRes.data) {
          const msgs = (threadRes.data.messages || (threadRes.data as any).emails || []) as Email[];
          if (msgs.length > 0) {
            if (stale()) return;
            setMessages(msgs);
            setThreadSubject(threadRes.data.subject || msgs[0]?.subject || '(No Subject)');
            setStarred(threadRes.data.isStarred || false);
            setExpandedIndices(autoExpandedIndices(msgs));
            setIsLoading(false);
            return;
          }
        }

        // 2. Fallback: Fetch as single email
        const emailRes = await apiClient.getEmail(threadId).catch(() => null);
        if (emailRes && emailRes.success && emailRes.data) {
          if (stale()) return;
          const email = emailRes.data;
          // If the email belongs to a thread, try fetching the full thread
          if (email.threadId && email.threadId !== threadId) {
            const fullThreadRes = await apiClient.getThread(email.threadId).catch(() => null);
            if (fullThreadRes && fullThreadRes.success && fullThreadRes.data) {
              const fullMsgs = (fullThreadRes.data.messages ||
                (fullThreadRes.data as any).emails ||
                []) as Email[];
              if (fullMsgs.length > 0) {
                if (stale()) return;
                setMessages(fullMsgs);
                setThreadSubject(
                  fullThreadRes.data.subject ||
                    fullMsgs[0]?.subject ||
                    email.subject ||
                    '(No Subject)',
                );
                setStarred(fullThreadRes.data.isStarred || email.isStarred || false);
                setExpandedIndices(autoExpandedIndices(fullMsgs));
                setIsLoading(false);
                return;
              }
            }
          }
          if (stale()) return;
          setMessages([email]);
          setThreadSubject(email.subject || '(No Subject)');
          setStarred(email.isStarred || false);
          setExpandedIndices(new Set([0]));
          setIsLoading(false);
          return;
        }
      } catch {
        /* proceed */
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [threadId, mailboxPending, resolvedConversation]);

  // Expand / Collapse Helpers
  const toggleMessageExpand = (index: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleDetailsExpand = (index: number) => {
    setCollapsedDetailsIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedIndices(new Set(messages.map((_, i) => i)));
  };

  const collapseAll = () => {
    setExpandedIndices(new Set());
  };

  // Star toggle
  const handleToggleStar = async () => {
    const nextState = !starred;
    setStarred(nextState);
    if (onStarToggle) onStarToggle(nextState);

    const targetId = messages[0]?.id || threadId;
    if (targetId) {
      try {
        // QM-UIUX-093: apiClient resolves `{ success: false }` when the
        // server refuses — it never rejects — so a resolved failure must
        // take the rollback path too, not fall through to the success toast.
        const res = await apiClient.toggleStar(targetId);
        if (!res?.success) throw new Error(res?.error?.message || 'Star update refused');
        showToast({ text: nextState ? 'Pinned to top' : 'Unpinned from top', type: 'info' });
      } catch {
        // Roll the optimistic flip back — here and in the parent, which was
        // already told the new state — and say it failed.
        setStarred(!nextState);
        if (onStarToggle) onStarToggle(!nextState);
        showToast({ text: 'Could not update star', type: 'error' });
      }
    }
  };

  /*
   * BB-P1-3: the thread header's "More" menu was missing the standard
   * conversation actions. Each item below is wired to an existing real
   * endpoint/handler — the same ones the inbox row and bulk actions use.
   * Spam, Mute and Move-to are deliberately absent: no mark-spam, mute or
   * move-to-folder endpoint exists for conversations, and inventing one
   * would be fabrication.
   */
  const handleMarkUnread = useCallback(async () => {
    const ids = conversationMessageIds;
    if (ids.length === 0) return;
    try {
      // QM-UIUX-093: apiClient resolves `{ success: false }` on failure — it
      // never rejects — so inspect the settled results: flip exactly the
      // rows the server accepted (a partial failure never leaves a lying
      // local state), and if any POST was refused, report the failure
      // instead of claiming success.
      const results = await Promise.all(ids.map((id) => apiClient.markAsUnread(id)));
      const accepted = ids.filter((_, i) => results[i]?.success);
      if (accepted.length > 0) {
        setMessages((prev) =>
          prev.map((m) => (accepted.includes(m.id) ? { ...m, isRead: false } : m)),
        );
      }
      if (accepted.length === ids.length) {
        showToast({ text: 'Marked as unread', type: 'info' });
      } else {
        showToast({ text: 'Could not mark as unread', type: 'error' });
      }
      invalidateMailLists(queryClient);
    } catch {
      showToast({ text: 'Could not mark as unread', type: 'error' });
    }
  }, [conversationMessageIds, queryClient]);

  const [snoozeMenuOpen, setSnoozeMenuOpen] = useState(false);
  const handleSnoozeConversation = useCallback(
    async (until: Date) => {
      const ids = conversationMessageIds;
      if (ids.length === 0) return;
      try {
        // QM-UIUX-093: apiClient resolves `{ success: false }` on failure —
        // it never rejects — so the success toast is earned only when every
        // snooze POST was accepted; any refusal is reported as a failure
        // (the list invalidation below resyncs whatever partially landed).
        const results = await Promise.all(ids.map((id) => apiClient.snoozeEmail(id, until)));
        if (results.every((r) => r?.success)) {
          showToast({
            text: `Snoozed until ${until.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
            type: 'success',
          });
        } else {
          showToast({ text: 'Could not snooze conversation', type: 'error' });
        }
        invalidateMailLists(queryClient);
      } catch {
        showToast({ text: 'Could not snooze conversation', type: 'error' });
      }
    },
    [conversationMessageIds, queryClient],
  );

  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [availableLabels, setAvailableLabels] = useState<EmailLabel[]>([]);
  const [labelsLoading, setLabelsLoading] = useState(false);
  const openLabelPicker = useCallback(async () => {
    setLabelPickerOpen(true);
    setLabelsLoading(true);
    try {
      const res = await apiClient.getLabels();
      if (res.success && res.data) setAvailableLabels(res.data);
    } catch {
      // Labels simply won't list; the picker still renders honestly empty.
    } finally {
      setLabelsLoading(false);
    }
  }, []);
  const handleApplyLabel = useCallback(
    async (labelName: string) => {
      const ids = conversationMessageIds;
      if (ids.length === 0) return;
      try {
        // QM-UIUX-093: apiClient resolves `{ success: false }` on failure —
        // it never rejects — so claim the label only when every POST was
        // accepted; any refusal is reported as a failure.
        const results = await Promise.all(ids.map((id) => apiClient.addLabel(id, labelName)));
        if (results.every((r) => r?.success)) {
          showToast({ text: `Label "${labelName}" applied`, type: 'success' });
        } else {
          showToast({ text: 'Could not apply label', type: 'error' });
        }
        invalidateMailLists(queryClient);
      } catch {
        showToast({ text: 'Could not apply label', type: 'error' });
      }
    },
    [conversationMessageIds, queryClient],
  );

  // Attachment upload in quick bar
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 25 * 1024 * 1024) {
        showToast({ text: `File "${file.name}" exceeds 25MB limit`, type: 'error' });
        continue;
      }

      const reader = new FileReader();
      reader.onload = () => {
        setPendingAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            size: file.size,
            dataUrl: reader.result as string,
            type: file.type || 'application/octet-stream',
          },
        ]);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePendingAttachment = (index: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // Send quick reply — through the shared undo-send queue (QM-UIUX-087).
  //
  // This used to call `apiClient.replyToEmail` the moment Send was pressed:
  // the reply was gone before its success toast faded, while a composer send
  // gets a 10-second recall window. The hasty path now goes through the same
  // `UndoSendManager` the composers use — the API call lives in `onSendNow`
  // and only runs when the countdown closes (or Send Now is pressed), the
  // optimistic bubble lands at that same moment, and Undo hands the words
  // back to the bar with nothing sent.
  const handleSendReply = useCallback(() => {
    if ((!quickReplyText.trim() && pendingAttachments.length === 0) || isSendingQuickReply) return;
    setReplyError(null);
    // A latch, cleared by whichever outcome arrives below. The reply bar has no spinner of
    // its own beyond the button label going to `…`, so the mascot beside it is the only
    // thing on screen that says a send is in flight.
    quantyReact('mail:sending');

    const replyContent = quickReplyText.trim();
    const attachmentsSnapshot = pendingAttachments;
    const quotedSnapshot = quotedMessage;
    // A quoted reply answers the message the gesture targeted; otherwise the
    // latest message, as before.
    const replyTarget =
      quotedSnapshot?.id || (messages.length > 0 ? messages[messages.length - 1].id : threadId);

    // Email-chat P0-3: a client-generated id so the realtime `message.new`
    // broadcast reconciles this send instead of landing as a duplicate bubble.
    const clientMessageId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticId = `reply-${Date.now()}`;
    optimisticIdsRef.current.set(clientMessageId, optimisticId);

    // Put the words back in the bar — shared by Undo and by a failed send, so
    // a reply is never silently eaten. The guards keep a restore from
    // clobbering a newer reply the user started typing during the window.
    const restoreToReplyBar = () => {
      setQuickReplyText((prev) => (prev.trim() ? prev : replyContent));
      setPendingAttachments((prev) => (prev.length > 0 ? prev : attachmentsSnapshot));
      if (quotedSnapshot) setQuotedMessage((prev) => prev ?? quotedSnapshot);
    };

    const performSend = async () => {
      setIsSendingQuickReply(true);
      try {
        // `'chat'` is the whole point of the bar: what is typed here is a line in the
        // conversation, and the server records that so the mark on it is a fact rather
        // than a guess about its length.
        const res = await apiClient.replyToEmail(replyTarget, replyContent, undefined, 'chat', clientMessageId);
        if (!res.success) {
          optimisticIdsRef.current.delete(clientMessageId);
          quantyReact('mail:sendFailed');
          setReplyError(res.error?.message || 'Failed to send reply');
          showToast({ text: res.error?.message || 'Failed to send reply', type: 'error' });
          restoreToReplyBar();
          return;
        }

        const targetTo = messages[0]?.from ? [messages[0].from] : [];

        // Optimistic update: inject the sent reply into the active conversation timeline.
        // If the realtime broadcast already delivered the persisted row (it can beat
        // the HTTP response), this copy is skipped — no duplicate bubble.
        const serverId = (res.data as { id?: string } | undefined)?.id;
        const newReplyMsg: Email = {
          id: serverId || optimisticId,
          threadId: res.data?.threadId || messages[messages.length - 1]?.threadId || threadId,
          userId: '',
          subject: res.data?.subject || threadSubject,
          inReplyTo: res.data?.inReplyTo || replyTarget,
          bodyText: replyContent,
          // `plainTextToHtml` rather than a local `replace(/\n/g, '<br/>')`: this is
          // the second place that conversion was hand-written, and the hand-written
          // copy did not escape, so a reply containing `<` lost its middle on screen.
          bodyHtml: plainTextToHtml(replyContent),
          snippet: replyContent.slice(0, 100),
          // Carried on the optimistic copy so the message keeps its mark for the
          // moment it is on screen before the refetch replaces it with the server's
          // row. Without this the row would render as a letter — the field would be
          // absent and `messageKindOf` defaults to `mail` — and then visibly flip.
          messageKind: 'chat',
          from: { name: 'You', email: 'me@quantmail.in' },
          to: targetTo,
          cc: [],
          bcc: [],
          priority: 'normal',
          category: 'primary',
          status: 'sent',
          isRead: true,
          isStarred: false,
          isArchived: false,
          isDraft: false,
          labels: [],
          references: [],
          headers: {},
          receivedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          attachments: attachmentsSnapshot.map((a, i) => ({
            id: `att-${i}`,
            emailId: `reply-${Date.now()}`,
            filename: a.name,
            mimeType: a.type,
            size: a.size,
            url: a.dataUrl,
            isInline: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        };

        setMessages((prev) => {
          if (serverId && prev.some((m) => m.id === serverId)) return prev;
          const next = [...prev, newReplyMsg];
          setExpandedIndices(new Set([...Array.from(expandedIndices), next.length - 1]));
          return next;
        });
        // The mapping served its purpose: with a server id the optimistic row is the
        // server row. Without one it stays so the late broadcast can reconcile it.
        if (serverId) optimisticIdsRef.current.delete(clientMessageId);

        quantyReact('mail:sent');
        showToast({ text: 'Reply sent successfully', type: 'success' });

        // The conversation has a new message, so every mailbox list showing this
        // thread is now wrong — including the inbox behind this pane, which is where
        // the user goes looking for what they just sent.
        invalidateMailLists(queryClient);

        // Scroll to bottom
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      } catch {
        quantyReact('mail:sendFailed');
        setReplyError('Failed to send reply');
        showToast({ text: 'Failed to send reply', type: 'error' });
        restoreToReplyBar();
      } finally {
        setIsSendingQuickReply(false);
      }
    };

    // Who the countdown bar names: the conversation's other party, read the
    // same way `openFullComposer` reads it — the first message's sender, or
    // its recipient when that first message is one of ours.
    const primary = messages[0];
    const primaryIsOutbound =
      primary &&
      Boolean(
        (primary as any).isOutbound ||
          (primary as any).folder === 'SENT' ||
          (primary as any).folder === 'sent' ||
          (primary as any).folderType === 'SENT',
      );
    const recipientLabel = primaryIsOutbound
      ? primary?.to?.[0]?.email || primary?.to?.[0]?.name || 'recipient'
      : primary?.from?.email || primary?.from?.name || 'recipient';

    queueSend({
      to: recipientLabel,
      body: replyContent,
      onSendNow: performSend,
      onUndo: () => {
        // Nothing was sent — the API call only exists inside `performSend`.
        // Drop the reconciliation id and hand the words back to the bar.
        optimisticIdsRef.current.delete(clientMessageId);
        restoreToReplyBar();
        quantyReact('mail:undone');
        requestAnimationFrame(() => quickReplyInputRef.current?.focus());
      },
    });

    // The box clears the moment Send is pressed, exactly like the composer
    // closing on Send: the countdown bar owns the in-flight state from here,
    // and Undo (or a failed send) restores the words via `restoreToReplyBar`.
    setQuickReplyText('');
    stopOwnTyping();
    setPendingAttachments([]);
    setQuotedMessage(null);
  }, [
    quickReplyText,
    pendingAttachments,
    isSendingQuickReply,
    messages,
    quotedMessage,
    threadId,
    threadSubject,
    expandedIndices,
    queryClient,
    queueSend,
    stopOwnTyping,
  ]);

  /**
   * Hand what is typed here to the full composer.
   *
   * The text travels as `?body=`, so flipping to Mail after starting to type keeps
   * the words — the mode switch is a change of ceremony, not a reset. The recipient
   * is read from the conversation: whoever the first message is from, unless that
   * message is one of ours, in which case it is whoever it went to.
   */
  const openFullComposer = useCallback(() => {
    const primary = messages[0];
    const isOut =
      primary &&
      Boolean(
        (primary as any).isOutbound ||
        (primary as any).folder === 'SENT' ||
        (primary as any).folder === 'sent' ||
        (primary as any).folderType === 'SENT',
      );
    const recipientEmail = isOut
      ? primary?.to?.[0]?.email || (primary as any)?.toAddresses?.[0] || ''
      : primary?.from?.email || (primary as any)?.fromAddress || '';
    // BB-P1-2: a full-letter reply keeps its "Re:" prefix. The base is
    // normalized first (no stacked prefixes), then exactly one "Re:" is
    // restored — the same contract openReplyComposer already keeps.
    const baseSubject =
      threadSubject?.replace(/^(Re:\s*)+/i, '').trim() ||
      primary?.subject?.replace(/^(Re:\s*)+/i, '').trim() ||
      '';
    const replySubject = baseSubject ? `Re: ${baseSubject}` : '';

    const params = new URLSearchParams();
    if (recipientEmail) params.set('to', recipientEmail);
    if (replySubject) params.set('subject', replySubject);
    if (quickReplyText.trim()) params.set('body', quickReplyText.trim());
    if (primary?.id || threadId) params.set('replyTo', primary?.id || threadId);

    router.push(`/compose?${params.toString()}`);
  }, [messages, quickReplyText, router, threadId, threadSubject]);

  /**
   * One entry point for the bar's Send, whichever mode it is in.
   *
   * The mode decides where the text goes, and nothing else in the bar has to know
   * which mode is active — the input, the Enter key and the button all call this.
   */
  const handleBarSend = useCallback(() => {
    if (composeMode === 'mail') {
      openFullComposer();
      return;
    }
    void handleSendReply();
  }, [composeMode, handleSendReply, openFullComposer]);

  const allExpanded = messages.length > 0 && expandedIndices.size === messages.length;

  return (
    <div className={`flex flex-col h-full bg-[var(--quant-background)] md:bg-black text-white select-text ${className}`}>
      {/* Top Header Actions Bar — Gmail-style: no divider line on desktop */}
      <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-[var(--quant-surface-elevated)]/90 md:border-b-0 bg-[var(--quant-background)]/95 md:bg-black backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 -ml-1.5 rounded-xl text-[var(--quant-muted-foreground)] hover:text-white hover:bg-[var(--quant-surface-elevated)]/80 active:bg-[#3A404D]/60 transition-all active:scale-95 flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-[40px] sm:min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
              title="Back to inbox"
              aria-label="Back to inbox"
            >
              <svg
                className="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
          )}

          {activeGroup ? (
            <button
              type="button"
              onClick={() => setGroupInfoOpen(true)}
              className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1.5 text-left transition-colors hover:bg-[var(--quant-surface-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
              aria-label={`Open details and shared media for ${activeGroup.name}`}
            >
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-black text-[var(--quant-background)]"
                style={{
                  backgroundColor: activeGroup.color ?? 'var(--quant-primary)',
                }}
              >
                {activeGroup.name
                  .replace(/[._-]+/g, ' ')
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join('')
                  .toUpperCase()}
              </span>

              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-bold text-white sm:text-base">
                    {activeGroup.name}
                  </span>
                  <ThreadKindBadge mix={conversationKindMix} />
                </span>
                <span className="truncate text-[11px] text-[var(--quant-muted-foreground)] transition-colors group-hover:text-[var(--quant-primary-hover)]">
                  {activeGroup.emails.length}{' '}
                  {activeGroup.emails.length === 1 ? 'member' : 'members'} · Tap for group details
                  &amp; media
                </span>
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1.5 text-left transition-colors hover:bg-[var(--quant-surface-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
              aria-label={`Open details and shared media for ${otherParticipant.name || participantSummary}`}
            >
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-black text-[var(--quant-background)] bg-[var(--quant-primary)]"
              >
                {(
                  (otherParticipant.name || participantSummary)
                    .replace(/[._-]+/g, ' ')
                    .split(/\s+/)
                    .filter(Boolean)[0] || 'C'
                )
                  .slice(0, 2)
                  .toUpperCase()}
              </span>

              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-bold text-white sm:text-base">
                    {otherParticipant.name || participantSummary}
                  </span>
                  <ThreadKindBadge mix={conversationKindMix} />
                </span>
                <span className="truncate text-[11px] text-[var(--quant-muted-foreground)] transition-colors group-hover:text-[var(--quant-primary-hover)]">
                  {otherParticipant.email || threadSubject || 'Tap for details & media'}
                </span>
              </span>
            </button>
          )}
        </div>

        {/*
          Right Action Icons: Expand/Collapse All + Open Full Thread + Star + Archive + Delete

          Every one of these was a 34px box on a phone, against a 44px floor, and the
          two at the end of the row are Archive and Delete — the pair where a mis-tap
          costs you a message. They cannot simply be padded out: five 44px boxes plus
          gaps eat 236 of 375 pixels and the correspondent's name is what would give up
          the room. So Expand All and Print stand down below `sm` and hand their slot to
          a single "…" that holds both, and the four buttons that are left take the full
          target inside the footprint the five were already using.
        */}
        <div className="flex items-center gap-1.5 shrink-0 sm:gap-1">
          {/* 1. Reply Button */}
          <button
            type="button"
            onClick={openReplyComposer}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-2 text-[var(--quant-muted-foreground)] transition-all hover:bg-[var(--quant-surface-elevated)] hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] sm:min-h-0 sm:min-w-0"
            title="Reply (R)"
            aria-label="Reply to conversation"
          >
            <svg
              className="size-[18px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="9 17 4 12 9 7" />
              <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
            </svg>
          </button>

          {/* 2. Forward Button */}
          <button
            type="button"
            onClick={openForwardComposer}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-2 text-[var(--quant-muted-foreground)] transition-all hover:bg-[var(--quant-surface-elevated)] hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] sm:min-h-0 sm:min-w-0"
            title="Forward message"
            aria-label="Forward conversation"
          >
            <svg
              className="size-[18px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="15 17 20 12 15 7" />
              <path d="M4 18v-2a4 4 0 0 1 4-4h12" />
            </svg>
          </button>

          {/* 3. Pin Button */}
          <button
            type="button"
            onClick={handleToggleStar}
            className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-2 transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--quant-background)] sm:min-h-0 sm:min-w-0 ${
              starred
                ? 'text-[var(--quant-primary)] bg-[var(--quant-primary)]/10'
                : 'text-[var(--quant-muted-foreground)] hover:text-[var(--brand-accent)] hover:bg-[var(--quant-surface-elevated)]'
            }`}
            title={starred ? 'Pinned to top' : 'Pin to top'}
          >
            <svg
              className="size-[18px]"
              viewBox="0 0 24 24"
              fill={starred ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="12" y1="17" x2="12" y2="22" />
              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6a3 3 0 0 0-6 0v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24Z" />
            </svg>
          </button>

          {/* 4. Open Full Thread Page (with returnTo) */}
          {variant === 'pane' && (
            <button
              type="button"
              onClick={() => {
                const search = typeof window !== 'undefined' ? window.location.search : '';
                const currentPath = `${typeof window !== 'undefined' ? window.location.pathname : '/'}${search}`;
                router.push(
                  `/thread/${primaryMessage?.threadId || primaryMessage?.id || threadId}?returnTo=${encodeURIComponent(currentPath)}`,
                );
              }}
              className="p-2 rounded-xl text-[var(--quant-muted-foreground)] hover:text-[var(--brand-accent)] hover:bg-[var(--quant-surface-elevated)] transition-all min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
              title="Open in Full Thread View"
              aria-label="Open in full thread view"
            >
              <svg
                className="size-[18px]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>
          )}

          {/* 5. Archive — or "Move to inbox" when the conversation is archived */}
          {conversationIsArchived && onUnarchive ? (
            <button
              type="button"
              onClick={() => onUnarchive(conversationMessageIds)}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-2 text-[var(--quant-muted-foreground)] transition-all hover:bg-[var(--quant-surface-elevated)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--quant-background)] sm:min-h-0 sm:min-w-0"
              title="Move conversation back to inbox"
              aria-label="Move conversation back to inbox"
            >
              <svg
                className="size-[18px]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
            </button>
          ) : (
            onArchive && (
              <button
                type="button"
                onClick={() => onArchive(conversationMessageIds)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-2 text-[var(--quant-muted-foreground)] transition-all hover:bg-[var(--quant-surface-elevated)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--quant-background)] sm:min-h-0 sm:min-w-0"
                title="Archive conversation (E)"
                aria-label="Archive conversation"
              >
                <svg
                  className="size-[18px]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect width="20" height="5" x="2" y="3" rx="1" />
                  <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                  <path d="M10 12h4" />
                </svg>
              </button>
            )
          )}

          {/* 6. Not Spam (Rescue) */}
          {isQuarantined && (
            <button
              type="button"
              onClick={handleRescueSpam}
              disabled={isRescuingSpam}
              className="flex min-h-[44px] sm:min-h-0 items-center gap-1.5 rounded-xl px-3 py-1.5 bg-[var(--quant-primary)]/10 hover:bg-[var(--quant-primary)]/15 text-xs font-semibold text-[var(--quant-primary)] border border-[var(--quant-primary)]/30 shadow-sm transition-all disabled:opacity-50"
              title="Not spam"
            >
              <svg
                className="size-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <path d="M3 10h10a5 5 0 0 1 5 5v2" />
                <path d="M7 6L3 10l4 4" />
              </svg>
              <span>{isRescuingSpam ? 'Rescuing…' : 'Not spam'}</span>
            </button>
          )}

          {/* 7. Far Right: More conversation actions (...) */}
          {/* Hidden snooze picker for the thread header — the More menu's
              "Snooze" item opens it; the trigger itself stays out of flow. */}
          <EmailSnooze
            triggerHidden
            open={snoozeMenuOpen}
            onOpenChange={setSnoozeMenuOpen}
            onSnooze={handleSnoozeConversation}
          />
          <AnchoredMenu
            icon={
              <svg className="size-[18px]" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="1.9" />
                <circle cx="12" cy="12" r="1.9" />
                <circle cx="12" cy="19" r="1.9" />
              </svg>
            }
            triggerLabel="More conversation actions"
            triggerClassName="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-2 text-[var(--quant-muted-foreground)] transition-all hover:bg-[var(--quant-surface-elevated)] hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--quant-background)]"
            wrapperClassName="inline-flex"
            menuLabel="Conversation actions"
            menuClassName="w-52 overflow-hidden rounded-2xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] py-1 shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
            scope="thread-header-menu"
            height={380}
            open={moreMenuOpen}
            onOpenChange={(open) => {
              setMoreMenuOpen(open);
              // The label picker is a sub-view of the menu — leaving the
              // menu resets it so the next open starts at the top level.
              if (!open) setLabelPickerOpen(false);
            }}
          >
            {(close) =>
              labelPickerOpen ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    onClick={() => setLabelPickerOpen(false)}
                    className="flex w-full min-h-[44px] items-center gap-3 px-3.5 text-left text-[13px] font-medium text-[var(--quant-muted-foreground)] transition-colors hover:bg-[var(--quant-surface-elevated)] hover:text-[var(--quant-foreground)] focus-visible:outline-none focus-visible:bg-[var(--quant-surface-elevated)]"
                  >
                    <svg
                      className="size-4 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                    Labels
                  </button>
                  <div className="mx-3 border-t border-white/10" aria-hidden="true" />
                  <div className="max-h-56 overflow-y-auto py-1">
                    {labelsLoading ? (
                      <div className="px-3.5 py-3 text-[13px] text-[var(--quant-muted-foreground)]">
                        Loading labels…
                      </div>
                    ) : availableLabels.length === 0 ? (
                      <div className="px-3.5 py-3 text-[13px] text-[var(--quant-muted-foreground)]">
                        No labels yet — create one in Settings.
                      </div>
                    ) : (
                      availableLabels.map((label) => (
                        <button
                          key={label.id}
                          type="button"
                          role="menuitem"
                          tabIndex={-1}
                          onClick={() => {
                            close();
                            void handleApplyLabel(label.name);
                          }}
                          className="flex w-full min-h-[44px] items-center gap-3 px-3.5 text-left text-[13px] font-medium text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-surface-elevated)] focus-visible:outline-none focus-visible:bg-[var(--quant-surface-elevated)]"
                        >
                          <span
                            className="size-3 shrink-0 rounded-full"
                            style={{ backgroundColor: label.color || 'var(--quant-muted-foreground)' }}
                            aria-hidden="true"
                          />
                          {label.name}
                        </button>
                      ))
                    )}
                  </div>
                </>
              ) : (
              <>
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => {
                    close();
                    openReplyAllComposer();
                  }}
                  className="flex w-full min-h-[44px] items-center gap-3 px-3.5 text-left text-[13px] font-medium text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-surface-elevated)] focus-visible:outline-none focus-visible:bg-[var(--quant-surface-elevated)]"
                >
                  <svg
                    className="size-4 shrink-0 text-[var(--quant-muted-foreground)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <polyline points="7 17 2 12 7 7" />
                    <polyline points="12 17 7 12 12 7" />
                    <path d="M22 18v-2a4 4 0 0 0-4-4H7" />
                  </svg>
                  Reply all
                </button>

                {/* BB-P1-3: standard conversation actions, each wired to the
                    real endpoint the inbox row/bulk actions use.
                    REG-2: hidden on all-self conversations — see canToggleRead
                    above. */}
                {canToggleRead && (
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => {
                    close();
                    void handleMarkUnread();
                  }}
                  className="flex w-full min-h-[44px] items-center gap-3 px-3.5 text-left text-[13px] font-medium text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-surface-elevated)] focus-visible:outline-none focus-visible:bg-[var(--quant-surface-elevated)]"
                >
                  <svg
                    className="size-4 shrink-0 text-[var(--quant-muted-foreground)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m3 7 9 6 9-6" />
                  </svg>
                  Mark unread
                </button>
                )}

                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => {
                    close();
                    void handleToggleStar();
                  }}
                  className="flex w-full min-h-[44px] items-center gap-3 px-3.5 text-left text-[13px] font-medium text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-surface-elevated)] focus-visible:outline-none focus-visible:bg-[var(--quant-surface-elevated)]"
                >
                  <svg
                    className="size-4 shrink-0 text-[var(--quant-muted-foreground)]"
                    viewBox="0 0 24 24"
                    fill={starred ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  {starred ? 'Unstar' : 'Star'}
                </button>

                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => {
                    close();
                    setSnoozeMenuOpen(true);
                  }}
                  className="flex w-full min-h-[44px] items-center gap-3 px-3.5 text-left text-[13px] font-medium text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-surface-elevated)] focus-visible:outline-none focus-visible:bg-[var(--quant-surface-elevated)]"
                >
                  <svg
                    className="size-4 shrink-0 text-[var(--quant-muted-foreground)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="13" r="8" />
                    <path d="M12 9v4l2 2" />
                  </svg>
                  Snooze…
                </button>

                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => {
                    void openLabelPicker();
                  }}
                  className="flex w-full min-h-[44px] items-center gap-3 px-3.5 text-left text-[13px] font-medium text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-surface-elevated)] focus-visible:outline-none focus-visible:bg-[var(--quant-surface-elevated)]"
                >
                  <svg
                    className="size-4 shrink-0 text-[var(--quant-muted-foreground)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.42 0l8.58-8.58a1 1 0 0 0 0-1.42L12 2z" />
                    <circle cx="7" cy="7" r="1.5" />
                  </svg>
                  Labels…
                </button>

                <div className="mx-3 border-t border-white/10" aria-hidden="true" />

                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => {
                    if (allExpanded) collapseAll();
                    else expandAll();
                    close();
                  }}
                  disabled={messages.length === 0}
                  className="flex w-full min-h-[44px] items-center gap-3 px-3.5 text-left text-[13px] font-medium text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-surface-elevated)] focus-visible:outline-none focus-visible:bg-[var(--quant-surface-elevated)] disabled:cursor-not-allowed disabled:text-[var(--quant-text-muted)] disabled:hover:bg-transparent"
                >
                  <svg
                    className={`size-4 shrink-0 text-[var(--quant-muted-foreground)] transition-transform ${allExpanded ? 'rotate-180' : ''}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    aria-hidden="true"
                  >
                    <path d="m7 15 5 5 5-5" />
                    <path d="m7 9 5-5 5 5" />
                  </svg>
                  {allExpanded ? 'Collapse all' : 'Expand all'}
                </button>

                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => {
                    close();
                    window.print();
                  }}
                  className="flex w-full min-h-[44px] items-center gap-3 px-3.5 text-left text-[13px] font-medium text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-surface-elevated)] focus-visible:outline-none focus-visible:bg-[var(--quant-surface-elevated)]"
                >
                  <svg
                    className="size-4 shrink-0 text-[var(--quant-muted-foreground)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect width="12" height="8" x="6" y="14" />
                  </svg>
                  Print conversation
                </button>

                {conversationIsArchived && onUnarchive && (
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    onClick={() => {
                      close();
                      onUnarchive(conversationMessageIds);
                    }}
                    className="flex w-full min-h-[44px] items-center gap-3 px-3.5 text-left text-[13px] font-medium text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-surface-elevated)] focus-visible:outline-none focus-visible:bg-[var(--quant-surface-elevated)]"
                  >
                    <svg
                      className="size-4 shrink-0 text-[var(--quant-muted-foreground)]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="m3 7 9 6 9-6" />
                    </svg>
                    Move to inbox
                  </button>
                )}

                {onDelete && (
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    onClick={() => {
                      close();
                      setConfirmTrash(true);
                    }}
                    className="flex w-full min-h-[44px] items-center gap-3 px-3.5 text-left text-[13px] font-medium text-rose-400 transition-colors hover:bg-rose-500/10 focus-visible:outline-none focus-visible:bg-rose-500/10"
                  >
                    <svg
                      className="size-4 shrink-0 text-rose-400"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                    Move to Trash
                  </button>
                )}
              </>
            )}
          </AnchoredMenu>
        </div>
      </div>

      {/* Main Conversation Stream (Chronological Stack) */}
      <div
        ref={scrollContainerRef}
        onScroll={handleStreamScroll}
        onTouchStart={handleSwipeTouchStart}
        onTouchMove={handleSwipeTouchMove}
        onTouchEnd={handleSwipeTouchEnd}
        onTouchCancel={handleSwipeTouchCancel}
        className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-4 max-w-4xl mx-auto w-full"
      >
        {/* QM-UIUX-046: real AI thread-summarization entry point */}
        {!isLoading && messages.length > 0 && (
          <div className="flex justify-start">
            <ThreadSummaryCard onSummarize={handleSummarizeThread} />
          </div>
        )}
        {/* Pull-to-load-older indicator */}
        {(pullDistance > 0 || isLoadingOlder) && (
          <div
            className="flex items-center justify-center overflow-hidden transition-[height]"
            style={{ height: isLoadingOlder ? 44 : pullDistance }}
            aria-hidden="true"
          >
            <span
              className={`size-5 rounded-full border-2 border-[var(--quant-primary)]/30 border-t-[var(--quant-primary)] ${isLoadingOlder ? 'animate-spin' : ''}`}
            />
          </div>
        )}
        {isQuarantined && (
          <div className="p-3.5 sm:p-4 rounded-xl bg-[var(--quant-surface-elevated)] border border-[var(--quant-surface-elevated)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="size-8 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0">
                <svg
                  className="size-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 2 2 12l10 10 10-10L12 2z" />
                  <path d="M12 8v5M12 16h.01" />
                </svg>
              </span>
              <div>
                <h4 className="text-sm font-semibold text-white">This message is in Spam</h4>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleRescueSpam}
                disabled={isRescuingSpam}
                className="px-3 py-1.5 rounded-xl bg-[var(--quant-primary)]/10 hover:bg-[var(--quant-primary)]/15 text-[var(--quant-primary)] border border-[var(--quant-primary)]/30 text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                <svg
                  className="size-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <path d="M3 10h10a5 5 0 0 1 5 5v2" />
                  <path d="M7 6L3 10l4 4" />
                </svg>
                <span>{isRescuingSpam ? 'Moving…' : 'Not spam'}</span>
              </button>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="space-y-4 pt-4">
            <div className="h-20 bg-[var(--quant-surface)]/60 rounded-2xl animate-pulse border border-[var(--quant-surface-elevated)]/60" />
            <div className="h-64 bg-[var(--quant-surface)]/60 rounded-3xl animate-pulse border border-[var(--quant-surface-elevated)]/60" />
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 text-center text-[var(--quant-muted-foreground)]">
            <svg
              className="w-10 h-10 mb-3 text-[var(--quant-text-muted)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <p className="text-sm font-medium text-[var(--quant-muted-foreground)]">No messages in this conversation</p>
          </div>
        )}

        {!isLoading &&
          messages.map((message: Email, index: number) => {
            const isExpanded = expandedIndices.has(index);
            const isDetailsExpanded = !collapsedDetailsIndices.has(index);

            const msgFromAddr = (
              message.from?.email ||
              (message as any).fromAddress ||
              ''
            ).toLowerCase();
            const isOutbound = Boolean(
              message.status === 'sent' ||
              (message as any).isSent ||
              (currentEmail &&
                (msgFromAddr === currentEmail ||
                  (currentHandle && msgFromAddr.startsWith(`${currentHandle}@`)))),
            );

            const msgFromName = isOutbound
              ? 'You'
              : message.from?.name ||
                (message as any).fromName ||
                message.from?.email?.split('@')[0] ||
                (message as any).fromAddress?.split('@')[0] ||
                'Sender';

            const msgFromEmail = message.from?.email || (message as any).fromAddress || '';
            const msgAttachments = message.attachments || [];
            const hasAtt = msgAttachments.length > 0;
            const toDisplay =
              message.to?.map((t) => t.name || t.email).join(', ') ||
              (message as any).toAddresses?.join(', ') ||
              'me';

            /*
             * Letter or line: read from the message, never guessed.
             *
             * This used to infer the kind from `!bodyHtml && bodyText.length < 120`,
             * which called a one-line letter a chat message and a long chat message
             * a letter — and which this component's own optimistic reply defeated
             * outright by filling in `bodyHtml` for everything it had just sent, so
             * a message typed into the bar below was always badged `Mail`. The
             * server records the kind now; `messageKindOf` just reads it back.
             */
            const messageKind = messageKindOf(message);
            // Stable key for per-message local state (reactions, gestures).
            const msgKey = message.id ?? `msg-${index}`;
            const msgReactionList = messageReactions[msgKey] ?? [];

            /*
             * Read receipt: WhatsApp-style ticks on YOUR messages only.
             * `receiptStatusOf` returns null for inbound messages.
             */
            const receipt = receiptStatusOf(message, isOutbound);

            // Day-group divider (chat-bubble vision): a centered pill whenever
            // the day changes — "Today", "Yesterday", weekday, or full date.
            const thisDay = dayKey(message.receivedAt);
            const prevDay = index > 0 ? dayKey(messages[index - 1]?.receivedAt) : null;
            const showDivider = thisDay !== null && thisDay !== prevDay;
            const dividerLabel = showDivider ? formatDayDivider(message.receivedAt) : '';

            return (
              <Fragment key={message.id || index}>
                {showDivider && dividerLabel && (
                  <div
                    className="flex justify-center py-1"
                    role="separator"
                    aria-label={dividerLabel}
                  >
                    <span className="rounded-full bg-[var(--quant-surface-elevated)] px-3 py-1 text-[11px] font-semibold text-[var(--quant-muted-foreground)] shadow-sm">
                      {dividerLabel}
                    </span>
                  </div>
                )}
              <ThreadBubbleShell
                message={message}
                senderName={msgFromName}
                isOutbound={isOutbound}
                onQuoteReply={startQuoteReply}
                onForwardMessage={forwardMessage}
                // "Delete where allowed": only when the host wired `onDelete`.
                onDeleteMessage={onDelete ? deleteMessage : undefined}
              >
              <motion.div
                id={message.id ? `mail-message-${message.id}` : undefined}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`w-full flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}
              >
                {!isExpanded ? (
                  /*
                    Collapsed 1-Line Strip — and the other half of a disclosure.

                    This was a `<div onClick>`: no role, no tab stop, no state. The
                    control that closes a message is a real button further down, so a
                    keyboard or screen-reader user could collapse a message and then
                    had nothing left to press — the body was unreachable for the rest
                    of the session. `aria-expanded` on both ends makes the pair read
                    as one disclosure instead of two unrelated controls.

                    Nothing inside is interactive, so the presentational-children rule
                    costs nothing here: sender, badge, snippet and date flatten into
                    the button's name, which is exactly what a reader needs in order to
                    decide whether to open it. The wrappers are spans for the same
                    reason a button may not contain a div.
                  */
                  <button
                    type="button"
                    onClick={() => toggleMessageExpand(index)}
                    aria-expanded={false}
                    className={`group w-full max-w-[95%] sm:max-w-[88%] flex items-center justify-between gap-3 p-3 sm:p-3.5 rounded-xl md:rounded-none md:border-0 border text-left transition-all cursor-pointer shadow-sm select-none hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] ${
                      isOutbound
                        ? 'border-[var(--quant-primary)]/25 bg-[var(--quant-primary)]/[0.04] hover:border-[var(--quant-primary)]/40 hover:bg-[var(--quant-primary)]/[0.07] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]'
                        : 'border-white/[0.08] bg-[var(--quant-surface)] md:bg-black md:hover:bg-white/[0.02] hover:bg-white/[0.03] hover:border-white/[0.14] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]'
                    }`}
                  >
                    <span className="flex items-center gap-3 min-w-0 flex-1">
                      <IdentityAvatar name={msgFromName} size="sm" />
                      <span className="flex items-center gap-2 min-w-0 flex-1">
                        {/*
                          The name is text, so it takes the text ramp. It used to take
                          the brand accent whenever the message was yours, which in a
                          conversation you had done all the talking in painted every
                          name on the page orange. Which side the bubble sits on and
                          the warm surface under it already say who spoke, and those
                          are surfaces rather than the loudest colour on the palette.
                        */}
                        <span className="truncate text-xs font-semibold text-[var(--quant-foreground)]">
                          {msgFromName}
                        </span>

                        {/* Badges: Mail or Chat */}
                        <span className="flex items-center gap-1.5 shrink-0">
                          {showKindBadges && <MessageKindBadge kind={messageKind} />}
                          {hasAtt && (
                            <span className="px-1.5 py-0.5 rounded bg-[var(--quant-primary)]/10 border border-[var(--quant-primary)]/25 text-[10px] font-semibold text-[var(--quant-primary)] flex items-center gap-1">
                              <svg
                                className="w-2.5 h-2.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"
                                />
                              </svg>
                              <span>{msgAttachments.length}</span>
                              {/*
                                The paperclip is the noun on screen, and it is
                                decorative. Inside the button's flattened name the
                                count would otherwise be a bare number sitting between
                                the sender and the snippet.
                              */}
                              <span className="sr-only">
                                {msgAttachments.length === 1 ? 'attachment' : 'attachments'}
                              </span>
                            </span>
                          )}
                        </span>

                        <span className="text-xs text-[var(--quant-muted-foreground)] truncate max-w-xs sm:max-w-md">
                          —{' '}
                          {sanitizeSnippetText(
                            message.snippet || message.bodyText?.slice(0, 80),
                          ) || '(No preview)'}
                        </span>
                      </span>
                    </span>

                    <span className="flex items-center gap-2 shrink-0">
                      {msgReactionList.length > 0 && (
                        <span
                          className="rounded-full border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)]/95 px-1.5 py-0.5 text-xs leading-none"
                          aria-label={`${msgReactionList.length} reaction${msgReactionList.length > 1 ? 's' : ''}`}
                        >
                          ❤️
                        </span>
                      )}
                      <span className="text-[11px] text-[var(--quant-muted-foreground)] font-mono" title={formatFullDate(message.receivedAt)}>
                        {formatMessageDate(message.receivedAt)}
                      </span>
                      {receipt && (
                        <EmailReadReceipt
                          status={receipt.status}
                          readAt={receipt.readAt}
                          deliveredAt={receipt.deliveredAt}
                        />
                      )}
                      <svg
                        className="size-4 text-[var(--quant-text-muted)] group-hover:text-[var(--quant-muted-foreground)] transition-colors"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </span>
                  </button>
                ) : messageKind === 'chat' ? (
                  /*
                    Chat bubble: WhatsApp-style compact bubble. Side, colour and
                    tail say who spoke — no avatar or header-card chrome, which
                    is what made every chat line read as a Gmail letter. Mail
                    keeps the rich card below.
                  */
                  <div
                    className={`relative max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 shadow-md ${
                      isOutbound
                        ? 'rounded-br-md bg-[#1E5AA8] text-white'
                        : 'rounded-bl-md bg-[#1F232B] text-[var(--quant-foreground)]'
                    }`}
                  >
                    {/* Tail */}
                    <span
                      aria-hidden="true"
                      className={`absolute top-0 h-0 w-0 border-y-[8px] border-y-transparent ${
                        isOutbound
                          ? '-right-[7px] border-l-[8px] border-l-[#1E5AA8]'
                          : '-left-[7px] border-r-[8px] border-r-[#1F232B]'
                      }`}
                    />
                    {!isOutbound && (
                      <p className="mb-0.5 text-[11px] font-semibold text-[var(--brand-accent)]">
                        {msgFromName}
                      </p>
                    )}
                    <ChatBubbleBody
                      text={message.bodyText || message.snippet || '(No content)'}
                    />
                    {hasAtt && (
                      <p
                        className={`mt-1.5 text-[11px] ${
                          isOutbound ? 'text-white/70' : 'text-[var(--quant-muted-foreground)]'
                        }`}
                      >
                        <span aria-hidden="true">📎 </span>
                        {msgAttachments.length}{' '}
                        {msgAttachments.length === 1 ? 'attachment' : 'attachments'}
                      </p>
                    )}
                    <div className="mt-1 flex items-center justify-end gap-1">
                      <span
                        className={`font-mono text-[10px] ${
                          isOutbound ? 'text-white/70' : 'text-[var(--quant-muted-foreground)]'
                        }`}
                        title={formatFullDate(message.receivedAt)}
                      >
                        {formatMessageDate(message.receivedAt)}
                      </span>
                      {receipt && (
                        <EmailReadReceipt
                          status={receipt.status}
                          readAt={receipt.readAt}
                          deliveredAt={receipt.deliveredAt}
                        />
                      )}
                    </div>
                  </div>
                ) : (
                  /* Expanded Rich Card */
                  <div
                    onTouchEnd={handleBubbleTouchEnd(msgKey)}
                    className={`relative w-full max-w-[96%] overflow-hidden rounded-xl transition-all sm:max-w-[92%] sm:rounded-2xl ${
                      isOutbound
                        ? 'bg-[#14100E] shadow-[inset_0_0_0_1px_#3A2416]'
                        : 'bg-[var(--quant-surface)] shadow-[inset_0_0_0_1px_var(--quant-surface-elevated)]'
                    }`}
                  >
                    {/* WhatsApp-style heart burst on double-tap react */}
                    <AnimatePresence>
                      {heartBurst?.msgKey === msgKey && (
                        <motion.span
                          key={heartBurst.key}
                          aria-hidden="true"
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: [0, 1.5, 1.1], opacity: [0, 1, 0] }}
                          transition={{ duration: 0.7, ease: 'easeOut' }}
                          onAnimationComplete={() => setHeartBurst(null)}
                          className="pointer-events-none absolute inset-0 z-30 grid place-items-center text-7xl"
                        >
                          ❤️
                        </motion.span>
                      )}
                    </AnimatePresence>
                    {/*
                      Header Bar — and the way back out.

                      A tap opened this message; a tap has to close it, because that is
                      the gesture the reader just used and the only one they were taught.
                      Collapse lived solely on the chevron at the right edge, so the way
                      in and the way out were different targets and the way out was a
                      24px glyph in the corner.

                      The bar, not the card: the body holds links and selectable letter
                      HTML, and a card-wide handler would close the message out from under
                      anyone tapping a link in it. The chevron stays — it is the visible
                      affordance, and it keeps this reachable from the keyboard without the
                      bar becoming a second tab stop for the same action.
                    */}
                    <div
                      onClick={(e) => {
                        // The two buttons in this bar own their clicks: `to …` opens the
                        // metadata, the chevron closes the card. Acting as well would
                        // reopen what the chevron just closed.
                        if ((e.target as HTMLElement).closest('button,a')) return;
                        // A tap that turned out to be a drag across the name is a
                        // selection, not a tap.
                        if (window.getSelection()?.isCollapsed === false) return;
                        toggleMessageExpand(index);
                      }}
                      className="flex cursor-pointer items-start justify-between gap-3 p-4 sm:p-5 pb-3"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <IdentityAvatar name={msgFromName} size="md" />

                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-[var(--quant-foreground)]">
                              {msgFromName}
                            </span>
                            {showKindBadges && <MessageKindBadge kind={messageKind} />}
                            <span className="text-xs text-[var(--quant-muted-foreground)] font-mono" title={formatFullDate(message.receivedAt)}>
                              {formatMessageDate(message.receivedAt)}
                            </span>
                            {receipt && (
                              <EmailReadReceipt
                                status={receipt.status}
                                readAt={receipt.readAt}
                                deliveredAt={receipt.deliveredAt}
                              />
                            )}
                          </div>

                          {/* "to me ⌵" Security Accordion Trigger */}
                          {/*
                            The hit area is grown with a pseudo-element rather than
                            padding: this is an 18px line of text sitting directly under
                            the sender's name, so 26px of real padding would push every
                            expanded message apart to buy a target. `before` reaches the
                            44px floor and occupies no layout. It cannot swallow a
                            neighbour — the name above it is a span, and the collapse
                            chevron is at the far edge of the bar.
                          */}
                          <button
                            type="button"
                            onClick={() => toggleDetailsExpand(index)}
                            aria-expanded={isDetailsExpanded}
                            /* Gated: the block below is only in the tree while open. */
                            aria-controls={
                              isDetailsExpanded ? `${detailsBaseId}-details-${index}` : undefined
                            }
                            className="group relative inline-flex items-center gap-1 pt-0.5 text-left font-mono text-xs text-[var(--quant-muted-foreground)] before:absolute before:inset-x-0 before:-inset-y-[13px] before:content-[''] hover:text-[var(--brand-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
                          >
                            <span>to {isOutbound ? toDisplay : 'me'}</span>
                            <svg
                              className={`size-3 transition-transform ${isDetailsExpanded ? 'rotate-180' : ''}`}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              aria-hidden="true"
                            >
                              <path d="m6 9 6 6 6-6" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Right Quick Actions: Collapse Card */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleMessageExpand(index)}
                          /*
                            The expanded half of the collapsed strip's disclosure. No
                            `aria-controls`: what this closes is the whole card it sits
                            in, and the strip that replaces it carries no id to point
                            at from the other direction.
                          */
                          aria-expanded={true}
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-2 text-[var(--quant-muted-foreground)] transition-colors hover:bg-[var(--quant-surface-elevated)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--quant-background)] sm:min-h-0 sm:min-w-0"
                          title="Collapse this message"
                        >
                          <svg
                            className="size-[18px]"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            aria-hidden="true"
                          >
                            <path d="m18 15-6-6-6 6" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Expandable "to me ⌵" Security Metadata */}
                    <AnimatePresence>
                      {isDetailsExpanded && (
                        <motion.div
                          id={`${detailsBaseId}-details-${index}`}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="px-4 sm:px-5"
                        >
                          {/* A hairline-ruled block, not a third nested card. */}
                          <div className="space-y-1.5 border-t border-[var(--quant-surface-elevated)] py-3 font-mono text-xs text-[var(--quant-muted-foreground)]">
                            <div className="flex">
                              <span className="w-20 text-[var(--quant-muted-foreground)]">From:</span>
                              <span className="font-medium text-[var(--quant-foreground)]">
                                {msgFromName} {msgFromEmail ? `<${msgFromEmail}>` : ''}
                              </span>
                            </div>
                            <div className="flex">
                              <span className="w-20 text-[var(--quant-muted-foreground)]">Subject:</span>
                              <span className="font-medium text-[var(--quant-foreground)]">
                                {message.subject || threadSubject || '(no subject)'}
                              </span>
                            </div>
                            <div className="flex">
                              <span className="w-20 text-[var(--quant-muted-foreground)]">To:</span>
                              <span className="text-[var(--quant-muted-foreground)]">{toDisplay}</span>
                            </div>
                            <div className="flex">
                              <span className="w-20 text-[var(--quant-muted-foreground)]">Date:</span>
                              <span className="text-[var(--quant-muted-foreground)]">
                                {message.receivedAt
                                  ? new Date(message.receivedAt).toLocaleString()
                                  : 'N/A'}
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/*
                     * Body, rendered flat.
                     *
                     * `EmailLetterCard` used to draw its own `#0c0e14` card with a
                     * border and an `shadow-xl`, nested inside this `var(--quant-surface)` card —
                     * two frames around one paragraph of text. The letter card is now
                     * chrome-free and this wrapper owns the only padding.
                     */}
                    <div className="px-4 pb-4 sm:px-5 sm:pb-5">
                      <EmailLetterCard email={message} />
                    </div>
                    {/*
                      Attachments were tracked on the message but never rendered —
                      the `AttachmentPreview` component existed with zero usages.
                      Its lightbox now supports pinch-to-zoom.
                    */}
                    {hasAtt && (
                      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
                        <AttachmentPreview
                          attachments={(msgAttachments as any[]).map((a, i) => {
                            /*
                             * QM-M39-010: the backend can only read bytes for
                             * AttachmentService rows (id "att_<uuid>"). Inbound
                             * attachments are metadata-only (partIndex) — pass
                             * no attachmentId so no Save button is rendered.
                             */
                            const rawId = typeof a.id === 'string' ? a.id : null;
                            return {
                              id: a.id ?? `att-${index}-${i}`,
                              filename: a.filename ?? a.name ?? 'attachment',
                              mimeType: a.mimeType ?? a.contentType ?? 'application/octet-stream',
                              size: a.size ?? 0,
                              url: a.url,
                              attachmentId: rawId && rawId.startsWith('att_') ? rawId : null,
                            };
                          })}
                          messageId={message.id ?? undefined}
                          onBackToMail={() => {
                            const el = message.id
                              ? document.getElementById(`mail-message-${message.id}`)
                              : null;
                            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }}
                        />
                      </div>
                    )}
                    {/* Reaction badge: shows the ❤️ (and future reactions) on the bubble */}
                    {msgReactionList.length > 0 && (
                      <div
                        className="absolute bottom-2 right-3 z-20 flex items-center gap-0.5 rounded-full border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)]/95 px-2 py-0.5 shadow-lg"
                        aria-label={`${msgReactionList.length} reaction${msgReactionList.length > 1 ? 's' : ''}`}
                      >
                        {msgReactionList.map((r, i) => (
                          <span key={i} className="text-sm leading-none">
                            {r}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
              </ThreadBubbleShell>
              </Fragment>
            );
          })}

        {/* "↓ N new" jump pill: arrivals while the reader was up in history */}
        {newArrivedCount > 0 && (
          <div className="sticky bottom-4 z-30 flex justify-center pointer-events-none">
            <button
              type="button"
              onClick={scrollToLatest}
              className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--quant-primary)] px-4 py-2 text-[13px] font-semibold text-black shadow-lg shadow-black/40 transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              aria-label={`${newArrivedCount} new message${newArrivedCount === 1 ? '' : 's'} — jump to latest`}
            >
              <svg
                className="size-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                aria-hidden="true"
              >
                <path d="M12 5v14m0 0 6-6m-6 6-6-6" />
              </svg>
              {newArrivedCount} new
            </button>
          </div>
        )}

        {/* Email-chat P0-4: realtime "X is typing…" bubble. Peers expire
            client-side, so a dead socket can never stick the indicator. */}
        {(() => {
          const typingNames = Object.values(typingPeers)
            .map((p) => p.displayName)
            .filter(Boolean);
          if (typingNames.length === 0) return null;
          const typingLabel =
            typingNames.length === 1
              ? `${typingNames[0]} is typing`
              : typingNames.length === 2
                ? `${typingNames[0]} and ${typingNames[1]} are typing`
                : `${typingNames[0]} and ${typingNames.length - 1} others are typing`;
          return (
            <AnimatePresence>
              <motion.div
                key="typing-indicator"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.15 }}
                className="flex justify-start px-4 sm:px-5 py-1"
                role="status"
                aria-live="polite"
                aria-label={typingLabel}
              >
                <div className="rounded-2xl rounded-bl-md border border-[var(--quant-surface-elevated)]/60 bg-[var(--quant-surface-elevated)] px-4 py-2.5 shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <span className="flex items-end gap-1" aria-hidden="true">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="size-1.5 rounded-full bg-[var(--quant-muted-foreground)] animate-bounce"
                          style={{ animationDelay: `${i * 150}ms` }}
                        />
                      ))}
                    </span>
                    <span className="text-xs text-[var(--quant-muted-foreground)] italic">{typingLabel}</span>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          );
        })()}

        <div ref={messagesEndRef} />
      </div>

      {/* Chatbot-Style Bottom Floating Quick Reply Bar — Gmail-style: no divider on desktop */}
      <div className="p-3 sm:p-4 bg-[#08090d]/95 md:bg-black border-t border-[var(--quant-surface-elevated)]/60 md:border-t-0 backdrop-blur-md sticky bottom-0 z-20 space-y-2">
        {/*
          AI quick-reply chips: suggestions for the latest message. One tap
          fills the reply bar — previously imported but never rendered, so
          users never saw any AI suggestions.
        */}
        {composeMode === 'chat' && messages.length > 0 && (
          <SmartReplySuggestions
            emailId={messages[messages.length - 1]?.id || threadId}
            onSelectReply={(text) => {
              setQuickReplyText(text);
              setTimeout(() => {
                document.getElementById('chatbot-reply-input')?.focus();
              }, 50);
            }}
          />
        )}
        {/*
          Quoted-reply chip: what a swipe-right or menu Reply targeted. One tap
          on the × (or Escape in the input) stands the bar back down to replying
          to the latest message.
        */}
        {quotedMessage && (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[var(--quant-primary)]/[0.06] border border-[var(--quant-primary)]/25">
            <svg
              className="size-4 shrink-0 text-[var(--quant-primary)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 17l-5-5 5-5" />
              <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-[var(--quant-primary)]">
                Replying to{' '}
                {quotedMessage.from?.name ||
                  quotedMessage.from?.email?.split('@')[0] ||
                  'message'}
              </p>
              <p className="truncate text-xs text-[var(--quant-muted-foreground)]">
                {sanitizeSnippetText(
                  quotedMessage.snippet || quotedMessage.bodyText?.slice(0, 80),
                ) || '(No preview)'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setQuotedMessage(null)}
              aria-label="Cancel quoted reply"
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--quant-muted-foreground)] transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
            >
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        {/*
          Message or Mail: the choice, stated.

          It lives on its own line rather than in the bar because the bar is already
          five controls wide at 360px, and because the choice governs everything to
          its right — putting it above reads as a heading for the input, which is
          what it is. `role="group"` with `aria-pressed` on each half, not a
          `radiogroup`: these are two buttons that change what the next one does,
          and a screen reader should hear which is active without the arrow-key
          navigation a radio group promises.
        */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div
            role="group"
            aria-label="Send as"
            className="flex items-center gap-1 rounded-xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface)] p-1 w-fit"
          >
            {[
              { mode: 'chat' as const, label: 'Message', Glyph: IconChat },
              { mode: 'mail' as const, label: 'Mail', Glyph: IconMail },
            ].map(({ mode, label, Glyph }) => {
              const isActive = composeMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setComposeMode(mode)}
                  aria-pressed={isActive}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors min-h-[44px] sm:min-h-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] ${
                    isActive
                      ? 'bg-[var(--quant-primary)]/10 text-[var(--quant-primary)] shadow-[inset_0_0_0_1px_rgba(255,140,66,0.30)]'
                      : 'text-[var(--quant-muted-foreground)] hover:bg-white/[0.04] hover:text-[#EDEDED]'
                  }`}
                  title={
                    mode === 'chat'
                      ? 'Send a line straight into this conversation'
                      : 'Write a full letter — subject, cc, formatting'
                  }
                >
                  <Glyph size={13} aria-hidden="true" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Pending Attachment Previews */}
        {pendingAttachments.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap px-2 py-1">
            {pendingAttachments.map((att, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[var(--quant-surface-elevated)] border border-[var(--quant-surface-elevated)] text-xs text-[var(--quant-foreground)]"
              >
                <svg
                  className="w-3.5 h-3.5 text-[var(--quant-primary)]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"
                  />
                </svg>
                <span className="truncate max-w-[150px]">{att.name}</span>
                <button
                  type="button"
                  onClick={() => removePendingAttachment(index)}
                  className="text-[var(--quant-text-muted)] hover:text-[#F87171] p-0.5 rounded transition-colors"
                  aria-label="Remove attachment"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Main Floating Input Bar */}
        <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-2xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface)] shadow-2xl">
          {/* File Attachment Hidden Input */}
          <input aria-label="Attach file"
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            multiple
            className="hidden"
          />

          {/*
            Attachment. The complaint was that there was no way to send a photo, and
            there had been one here all along — behind a `size-4.5` that Tailwind's
            scale does not define, so the paperclip compiled to `width: 0`. What was
            left was twelve pixels of padding with nothing in it: an option that
            existed, did work, and could not be seen or reliably hit. Sized in pixels
            now, and given the 44px target the bar's Send button already had.
          */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl p-1.5 text-[var(--quant-muted-foreground)] transition-all hover:bg-[var(--quant-surface-elevated)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--quant-surface)] sm:min-h-0 sm:min-w-0 sm:p-2"
            title="Attach Files / Photos"
            aria-label="Attach files or photos"
          >
            <svg
              className="size-[18px] sm:size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>

          {/* Quanty AI Assistant Trigger */}
          <button
            type="button"
            onClick={() => setIsQuantyOpen(true)}
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl p-1 text-[var(--quant-primary)] transition-all hover:bg-[var(--quant-primary)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--quant-surface)] sm:min-h-0 sm:min-w-0 sm:p-1.5"
            title="Ask Quanty AI to write response"
            aria-label="Ask Quanty AI to write a response"
          >
            <Quanty size={20} expression={quantyFace} bob={false} />
          </button>

          {/* Chat Input Text Area */}
          <input
            id="chatbot-reply-input"
            ref={quickReplyInputRef}
            type="text"
            value={quickReplyText}
            onChange={(e) => handleQuickReplyChange(e.target.value)}
            onKeyDown={(e) => {
              // SIA-P1-4: plain Enter never SENDS — Cmd/Ctrl+Enter only. Mail
              // mode keeps Enter-to-open-the-composer (nothing sends from the
              // bar in mail mode).
              if (e.key === 'Enter' && (composeMode === 'mail' || e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleBarSend();
              }
              if (e.key === 'Escape' && quotedMessage) {
                setQuotedMessage(null);
              }
            }}
            placeholder={
              composeMode === 'mail'
                ? 'Write a reply — Enter opens the composer…'
                : 'Reply… (⌘/Ctrl+Enter to send)'
            }
            aria-label={composeMode === 'mail' ? 'Write a reply' : 'Reply'}
            className="min-h-[44px] min-w-0 flex-1 bg-transparent border-none text-xs sm:text-sm text-white placeholder-[var(--quant-muted-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] rounded px-1 sm:px-2 py-1.5 sm:min-h-0"
          />

          {/* Send Button — sends the line, or carries it into the full composer */}
          <button
            type="button"
            onClick={handleBarSend}
            disabled={
              composeMode === 'chat' &&
              ((!quickReplyText.trim() && pendingAttachments.length === 0) || isSendingQuickReply)
            }
            className="px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-[var(--quant-primary)] hover:bg-[var(--quant-primary-hover)] active:bg-[var(--brand-primary-pressed)] text-[#111111] text-xs font-semibold transition-all shadow-sm active:scale-95 disabled:opacity-30 disabled:pointer-events-none shrink-0 flex items-center gap-1.5 min-h-[44px] sm:min-h-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--quant-surface)]"
          >
            <span>{composeMode === 'mail' ? 'Compose' : isSendingQuickReply ? '…' : 'Send'}</span>
            {composeMode === 'mail' ? (
              <IconMail size={14} aria-hidden="true" />
            ) : (
              <svg
                className="size-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <path d="m22 2-7 20-4-9-9-4Z" />
                <path d="M22 2 11 13" />
              </svg>
            )}
          </button>
        </div>

        {replyError && <p className="text-xs text-rose-400 px-2">{replyError}</p>}
      </div>

      {/* Quanty Assistant Copilot Drawer */}
      {activeGroup && (
        <GroupInfoModal
          open={groupInfoOpen}
          group={activeGroup}
          messages={messages}
          currentUserEmail={currentEmail}
          onClose={() => setGroupInfoOpen(false)}
          onAddMembers={() => {
            setGroupInfoOpen(false);
            setAddingMembersGroup(activeGroup);
          }}
          onEditGroup={() => {
            setGroupInfoOpen(false);
            setEditingGroup(activeGroup);
          }}
        />
      )}
      {addingMembersGroup && (
        <AddMemberModal
          open={Boolean(addingMembersGroup)}
          groupName={addingMembersGroup.name}
          existingEmails={addingMembersGroup.emails}
          onClose={() => {
            setAddingMembersGroup(null);
            setGroupInfoOpen(true);
          }}
          onAdd={async (newEmails) => {
            const merged = Array.from(new Set([...addingMembersGroup.emails, ...newEmails]));
            await updateGroup.mutateAsync({
              id: addingMembersGroup.id,
              data: {
                name: addingMembersGroup.name,
                color: addingMembersGroup.color,
                emails: merged,
              },
            });
            setAddingMembersGroup(null);
            setGroupInfoOpen(true);
          }}
        />
      )}
      {!activeGroup && otherParticipant.email && (
        <ContactProfileInspector
          open={profileOpen}
          email={otherParticipant.email}
          name={otherParticipant.name}
          messages={messages}
          onClose={() => setProfileOpen(false)}
        />
      )}
      {/* Self-threads and participant-less threads have no other participant
          email, so ContactProfileInspector can't render — without this branch
          the header "details and shared media" button was dead (BB-P0-1).
          The shared-media panel still exists via Inspector's media/files/links
          tabs, so wire the button to it instead of removing it. */}
      {!activeGroup && !otherParticipant.email && (
        <Inspector
          open={profileOpen}
          title={threadSubject || participantSummary || 'Thread details'}
          subtitle={`${messages.length} ${
            messages.length === 1 ? 'message' : 'messages'
          } · shared media & files`}
          accent="var(--quant-primary)"
          avatarLabel={threadSubject || participantSummary || 'Thread details'}
          messages={messages}
          onClose={() => setProfileOpen(false)}
        />
      )}
      {editingGroup && (
        <GroupEditorModal
          group={editingGroup}
          onClose={() => setEditingGroup(null)}
          onSave={async (draft: GroupDraft) => {
            await updateGroup.mutateAsync({ id: editingGroup.id, data: draft });
            setEditingGroup(null);
            setGroupInfoOpen(true);
          }}
          onDelete={async (group) => {
            await deleteGroup.mutateAsync(group.id);
            setEditingGroup(null);
            setGroupInfoOpen(false);
          }}
        />
      )}
      {confirmTrash && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="trash-title"
            className="w-full max-w-sm rounded-2xl border border-[#3A404D] bg-[var(--quant-surface)] p-5"
          >
            <h2 id="trash-title" className="text-base font-bold text-white">
              Move conversation to Trash?
            </h2>
            <p className="mt-2 text-xs text-[var(--quant-muted-foreground)]">
              The complete conversation will be moved to Trash.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmTrash(false)}
                className="min-h-[44px] rounded-xl border border-[var(--quant-surface-elevated)] px-4 text-xs font-semibold text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmTrash(false);
                  onDelete?.(conversationMessageIds);
                }}
                className="min-h-[44px] rounded-xl bg-rose-500 px-4 text-xs font-bold text-white"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Single-message delete, from the bubble's long-press/right-click menu. */}
      {confirmDeleteMessage && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-message-title"
            className="w-full max-w-sm rounded-2xl border border-[#3A404D] bg-[var(--quant-surface)] p-5"
          >
            <h2 id="delete-message-title" className="text-base font-bold text-white">
              Delete this message?
            </h2>
            <p className="mt-2 text-xs text-[var(--quant-muted-foreground)]">
              This message will be moved to Trash. The rest of the conversation stays.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteMessage(null)}
                className="min-h-[44px] rounded-xl border border-[var(--quant-surface-elevated)] px-4 text-xs font-semibold text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = confirmDeleteMessage.id;
                  setConfirmDeleteMessage(null);
                  if (id) onDelete?.([id]);
                }}
                className="min-h-[44px] rounded-xl bg-rose-500 px-4 text-xs font-bold text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showQuanty && (
        <QuantyCopilotDrawer
          isOpen={isQuantyOpen}
          onClose={() => setIsQuantyOpen(false)}
          contextEmail={primaryMessage}
          contextThreadSubject={threadSubject}
          onInsertReply={(text) => {
            setQuickReplyText(text);
            setTimeout(() => {
              document.getElementById('chatbot-reply-input')?.focus();
            }, 50);
          }}
        />
      )}
    </div>
  );
}
