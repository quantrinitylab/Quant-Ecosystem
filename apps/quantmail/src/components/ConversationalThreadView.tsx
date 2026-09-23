'use client';

import { useState, useCallback, useEffect, useId, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { apiClient } from '../services/api-client';
import type { ContactGroup, Email, EmailAttachment, EmailThread, MessageKind } from '../types';
import {
  useContactGroups,
  useUpdateContactGroup,
  useDeleteContactGroup,
} from '../hooks/useContactGroups';
import { GroupInfoModal, ContactProfileInspector } from './GroupInfoModal';
import { GroupEditorModal, type GroupDraft } from './GroupEditorModal';
import { AddMemberModal } from './AddMemberModal';
import { AnchoredMenu } from './AnchoredMenu';
import { showToast } from './InboxToast';
import { IdentityAvatar } from './IdentityAvatar';
import { EmailLetterCard } from './EmailLetterCard';
import { MessageKindBadge } from './MessageKindBadge';
import { Quanty } from './Quanty';
import { quantyReact, useQuantyMood } from '../lib/quanty/reactions';
import { IconChat, IconMail } from './icons';
import {
  findConversation,
  groupEmailsIntoThreads,
  messageKindOf,
  messageRowIds,
  summarizeParticipants,
  threadKindMix,
  threadParticipants,
} from '../lib/threading';
import { invalidateMailLists } from '../lib/offline/folders';
import { plainTextToHtml } from '../lib/email-body';
import { useAuth } from '../providers/auth-provider';
import { useDeferredMount } from '../hooks/useDeferredMount';
import { useInbox } from '../hooks/useInbox';

/**
 * The thread reader is what a mail click lands on, so its chunk is on the
 * critical path — and Quanty's drawer is not. Deferred until the assistant is
 * first opened; latched from then on so the conversation survives a close.
 */
const QuantyCopilotDrawer = dynamic(() => import('./QuantyCopilotDrawer'), { ssr: false });

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
  onDelete?: (messageIds: string[]) => void;
  onStarToggle?: (starred: boolean) => void;
  isStarred?: boolean;
  className?: string;
  variant?: 'pane' | 'full';
  isSpam?: boolean;
  onNotSpam?: (messageIds: string[]) => void;
}

export function ConversationalThreadView({
  threadId,
  initialThread,
  initialEmails = [],
  subject = '(No Subject)',
  onClose,
  onArchive,
  onDelete,
  onStarToggle,
  isStarred = false,
  className = '',
  variant = 'pane',
  isSpam = false,
  onNotSpam,
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
  const [expandedDetailsIndices, setExpandedDetailsIndices] = useState<Set<number>>(new Set());

  // Quick reply & AI state
  const [quickReplyText, setQuickReplyText] = useState('');
  const [isSendingQuickReply, setIsSendingQuickReply] = useState(false);
  const [isQuantyOpen, setIsQuantyOpen] = useState(false);
  const showQuanty = useDeferredMount(isQuantyOpen);
  const [replyError, setReplyError] = useState<string | null>(null);

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

  const openReplyComposer = useCallback(() => {
    const recipient = primaryMessage?.from?.email || '';
    const subj = threadSubject.startsWith('Re:') ? threadSubject : `Re: ${threadSubject}`;
    router.push(
      `/compose?to=${encodeURIComponent(recipient)}&subject=${encodeURIComponent(subj)}&replyTo=${primaryMessage?.id || threadId}`,
    );
  }, [primaryMessage, router, threadId, threadSubject]);

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

  const isQuarantined =
    isSpam || messages.some((m) => (m as any).isSpam || (m as any).folderId === 'SPAM');
  const [isRescuingSpam, setIsRescuingSpam] = useState(false);

  const handleRescueSpam = useCallback(async () => {
    const targetId = messages[0]?.id || threadId;
    if (!targetId) return;
    setIsRescuingSpam(true);
    try {
      await apiClient.markNotSpam(targetId);
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
      setExpandedIndices(new Set(msgs.length <= 2 ? msgs.map((_, i) => i) : [msgs.length - 1]));
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
        setExpandedIndices(new Set([initialEmails.length - 1]));
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
            if (msgs.length <= 2) {
              setExpandedIndices(new Set(msgs.map((_, i) => i)));
            } else {
              setExpandedIndices(new Set([msgs.length - 1]));
            }
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
                setExpandedIndices(
                  new Set(fullMsgs.length <= 2 ? fullMsgs.map((_, i) => i) : [fullMsgs.length - 1]),
                );
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
    setExpandedDetailsIndices((prev) => {
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
        await apiClient.toggleStar(targetId);
        showToast({ text: nextState ? 'Thread starred' : 'Thread unstarred', type: 'info' });
      } catch {
        setStarred(!nextState);
      }
    }
  };

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

  // Send quick reply
  const handleSendReply = useCallback(async () => {
    if ((!quickReplyText.trim() && pendingAttachments.length === 0) || isSendingQuickReply) return;
    setIsSendingQuickReply(true);
    setReplyError(null);
    // A latch, cleared by whichever outcome arrives below. The reply bar has no spinner of
    // its own beyond the button label going to `…`, so the mascot beside it is the only
    // thing on screen that says a send is in flight.
    quantyReact('mail:sending');

    const replyContent = quickReplyText.trim();
    const replyTarget = messages.length > 0 ? messages[messages.length - 1].id : threadId;

    try {
      // `'chat'` is the whole point of the bar: what is typed here is a line in the
      // conversation, and the server records that so the mark on it is a fact rather
      // than a guess about its length.
      const res = await apiClient.replyToEmail(replyTarget, replyContent, undefined, 'chat');
      if (!res.success) {
        quantyReact('mail:sendFailed');
        setReplyError(res.error?.message || 'Failed to send reply');
        showToast({ text: res.error?.message || 'Failed to send reply', type: 'error' });
        return;
      }

      const targetTo = messages[0]?.from ? [messages[0].from] : [];

      // Optimistic update: inject the sent reply into the active conversation timeline
      const newReplyMsg: Email = {
        id: (res.data as any)?.id || `reply-${Date.now()}`,
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
        attachments: pendingAttachments.map((a, i) => ({
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
        const next = [...prev, newReplyMsg];
        setExpandedIndices(new Set([...Array.from(expandedIndices), next.length - 1]));
        return next;
      });

      setQuickReplyText('');
      setPendingAttachments([]);
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
    } finally {
      setIsSendingQuickReply(false);
    }
  }, [
    quickReplyText,
    pendingAttachments,
    isSendingQuickReply,
    messages,
    threadId,
    threadSubject,
    expandedIndices,
    queryClient,
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
    const cleanSubject =
      threadSubject?.replace(/^(Re:\s*)+/i, '').trim() ||
      primary?.subject?.replace(/^(Re:\s*)+/i, '').trim() ||
      '';

    const params = new URLSearchParams();
    if (recipientEmail) params.set('to', recipientEmail);
    if (cleanSubject) params.set('subject', cleanSubject);
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
    <div className={`flex flex-col h-full bg-[#090A0C] text-white select-text ${className}`}>
      {/* Top Header Actions Bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-[#282C35]/90 bg-[#090A0C]/95 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 -ml-1.5 rounded-xl text-[#A1A4AC] hover:text-white hover:bg-[#282C35]/80 active:bg-[#3A404D]/60 transition-all active:scale-95 flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-[40px] sm:min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
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
              className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1.5 text-left transition-colors hover:bg-[#16181D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
              aria-label={`Open details and shared media for ${activeGroup.name}`}
            >
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-black text-[#090A0C]"
                style={{
                  backgroundColor: activeGroup.color ?? '#FF8C42',
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
                <span className="truncate text-sm font-bold text-white sm:text-base">
                  {activeGroup.name}
                </span>
                <span className="truncate text-[11px] text-[#A1A4AC] transition-colors group-hover:text-[#FF9B5A]">
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
              className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1.5 text-left transition-colors hover:bg-[#16181D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
              aria-label={`Open details and shared media for ${otherParticipant.name || participantSummary}`}
            >
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-black text-[#090A0C] bg-[#FF8C42]"
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
                <span className="truncate text-sm font-bold text-white sm:text-base">
                  {otherParticipant.name || participantSummary}
                </span>
                <span className="truncate text-[11px] text-[#A1A4AC] transition-colors group-hover:text-[#FF9B5A]">
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
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-2 text-[#A1A4AC] transition-all hover:bg-[#282C35] hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] sm:min-h-0 sm:min-w-0"
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
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-2 text-[#A1A4AC] transition-all hover:bg-[#282C35] hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] sm:min-h-0 sm:min-w-0"
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
            className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-2 transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] focus-visible:ring-offset-2 focus-visible:ring-offset-[#090A0C] sm:min-h-0 sm:min-w-0 ${
              starred
                ? 'text-[#FF8C42] bg-[#FF8C42]/10'
                : 'text-[#A1A4AC] hover:text-[#FFB875] hover:bg-[#282C35]'
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
              className="p-2 rounded-xl text-[#A1A4AC] hover:text-[#FFB875] hover:bg-[#282C35] transition-all min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
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

          {/* 5. Archive */}
          {onArchive && (
            <button
              type="button"
              onClick={() => onArchive(conversationMessageIds)}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-2 text-[#A1A4AC] transition-all hover:bg-[#282C35] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] focus-visible:ring-offset-2 focus-visible:ring-offset-[#090A0C] sm:min-h-0 sm:min-w-0"
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
          )}

          {/* 6. Not Spam (Rescue) */}
          {isQuarantined && (
            <button
              type="button"
              onClick={handleRescueSpam}
              disabled={isRescuingSpam}
              className="flex min-h-[44px] sm:min-h-0 items-center gap-1.5 rounded-xl px-3 py-1.5 bg-[#FF8C42]/10 hover:bg-[#FF8C42]/15 text-xs font-semibold text-[#FF8C42] border border-[#FF8C42]/30 shadow-sm transition-all disabled:opacity-50"
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
          <AnchoredMenu
            icon={
              <svg className="size-[18px]" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="1.9" />
                <circle cx="12" cy="12" r="1.9" />
                <circle cx="12" cy="19" r="1.9" />
              </svg>
            }
            triggerLabel="More conversation actions"
            triggerClassName="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-2 text-[#A1A4AC] transition-all hover:bg-[#282C35] hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] focus-visible:ring-offset-2 focus-visible:ring-offset-[#090A0C]"
            wrapperClassName="inline-flex"
            menuLabel="Conversation actions"
            menuClassName="w-52 overflow-hidden rounded-2xl border border-[#282C35] bg-[#16181D] py-1 shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
            scope="thread-header-menu"
            height={180}
          >
            {(close) => (
              <>
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => {
                    close();
                    openReplyAllComposer();
                  }}
                  className="flex w-full min-h-[44px] items-center gap-3 px-3.5 text-left text-[13px] font-medium text-[#F5F5F5] transition-colors hover:bg-[#282C35] focus-visible:outline-none focus-visible:bg-[#282C35]"
                >
                  <svg
                    className="size-4 shrink-0 text-[#A1A4AC]"
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
                  className="flex w-full min-h-[44px] items-center gap-3 px-3.5 text-left text-[13px] font-medium text-[#F5F5F5] transition-colors hover:bg-[#282C35] focus-visible:outline-none focus-visible:bg-[#282C35] disabled:cursor-not-allowed disabled:text-[#6B6E76] disabled:hover:bg-transparent"
                >
                  <svg
                    className={`size-4 shrink-0 text-[#A1A4AC] transition-transform ${allExpanded ? 'rotate-180' : ''}`}
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
                  className="flex w-full min-h-[44px] items-center gap-3 px-3.5 text-left text-[13px] font-medium text-[#F5F5F5] transition-colors hover:bg-[#282C35] focus-visible:outline-none focus-visible:bg-[#282C35]"
                >
                  <svg
                    className="size-4 shrink-0 text-[#A1A4AC]"
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
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-4 max-w-4xl mx-auto w-full">
        {isQuarantined && (
          <div className="p-3.5 sm:p-4 rounded-xl bg-[#16181D] border border-[#282C35] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                className="px-3 py-1.5 rounded-xl bg-[#FF8C42]/10 hover:bg-[#FF8C42]/15 text-[#FF8C42] border border-[#FF8C42]/30 text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
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
            <div className="h-20 bg-[#111318]/60 rounded-2xl animate-pulse border border-[#282C35]/60" />
            <div className="h-64 bg-[#111318]/60 rounded-3xl animate-pulse border border-[#282C35]/60" />
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 text-center text-[#A1A4AC]">
            <svg
              className="w-10 h-10 mb-3 text-[#6B6E76]"
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
            <p className="text-sm font-medium text-[#A1A4AC]">No messages in this conversation</p>
          </div>
        )}

        {!isLoading &&
          messages.map((message: Email, index: number) => {
            const isExpanded = expandedIndices.has(index);
            const isDetailsExpanded = expandedDetailsIndices.has(index);

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

            return (
              <motion.div
                key={message.id || index}
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
                    className={`group w-full max-w-[95%] sm:max-w-[88%] flex items-center justify-between gap-3 p-3 sm:p-3.5 rounded-xl border text-left transition-all cursor-pointer shadow-sm select-none hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                      isOutbound
                        ? 'border-[#FF8C42]/25 bg-[#FF8C42]/[0.04] hover:border-[#FF8C42]/40 hover:bg-[#FF8C42]/[0.07] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]'
                        : 'border-white/[0.08] bg-[#111318] hover:bg-white/[0.03] hover:border-white/[0.14] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]'
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
                        <span className="truncate text-xs font-semibold text-[#F5F5F5]">
                          {msgFromName}
                        </span>

                        {/* Badges: Mail or Chat */}
                        <span className="flex items-center gap-1.5 shrink-0">
                          {showKindBadges && <MessageKindBadge kind={messageKind} />}
                          {hasAtt && (
                            <span className="px-1.5 py-0.5 rounded bg-[#FF8C42]/10 border border-[#FF8C42]/25 text-[10px] font-semibold text-[#FF8C42] flex items-center gap-1">
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

                        <span className="text-xs text-[#A1A4AC] truncate max-w-xs sm:max-w-md">
                          — {message.snippet || message.bodyText?.slice(0, 80) || '(No preview)'}
                        </span>
                      </span>
                    </span>

                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-[#A1A4AC] font-mono">
                        {formatMessageDate(message.receivedAt)}
                      </span>
                      <svg
                        className="size-4 text-[#6B6E76] group-hover:text-[#A1A4AC] transition-colors"
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
                ) : (
                  /* Expanded Rich Card */
                  <div
                    className={`w-full max-w-[96%] overflow-hidden rounded-xl transition-all sm:max-w-[92%] sm:rounded-2xl ${
                      isOutbound
                        ? 'bg-[#14100E] shadow-[inset_0_0_0_1px_#3A2416]'
                        : 'bg-[#111318] shadow-[inset_0_0_0_1px_#282C35]'
                    }`}
                  >
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
                            <span className="text-sm font-semibold text-[#F5F5F5]">
                              {msgFromName}
                            </span>
                            {showKindBadges && <MessageKindBadge kind={messageKind} />}
                            <span className="text-xs text-[#A1A4AC] font-mono">
                              {formatMessageDate(message.receivedAt)}
                            </span>
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
                            className="group relative inline-flex items-center gap-1 pt-0.5 text-left font-mono text-xs text-[#A1A4AC] before:absolute before:inset-x-0 before:-inset-y-[13px] before:content-[''] hover:text-[#FFB875] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
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
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-2 text-[#A1A4AC] transition-colors hover:bg-[#282C35] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] focus-visible:ring-offset-2 focus-visible:ring-offset-[#090A0C] sm:min-h-0 sm:min-w-0"
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
                          <div className="space-y-1.5 border-t border-[#282C35] py-3 font-mono text-xs text-[#A1A4AC]">
                            <div className="flex">
                              <span className="w-20 text-[#A1A4AC]">From:</span>
                              <span className="font-medium text-[#F5F5F5]">
                                {msgFromName} {msgFromEmail ? `<${msgFromEmail}>` : ''}
                              </span>
                            </div>
                            <div className="flex">
                              <span className="w-20 text-[#A1A4AC]">To:</span>
                              <span className="text-[#A1A4AC]">{toDisplay}</span>
                            </div>
                            <div className="flex">
                              <span className="w-20 text-[#A1A4AC]">Date:</span>
                              <span className="text-[#A1A4AC]">
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
                     * border and an `shadow-xl`, nested inside this `#111318` card —
                     * two frames around one paragraph of text. The letter card is now
                     * chrome-free and this wrapper owns the only padding.
                     */}
                    <div className="px-4 pb-4 sm:px-5 sm:pb-5">
                      <EmailLetterCard email={message} />
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}

        <div ref={messagesEndRef} />
      </div>

      {/* Chatbot-Style Bottom Floating Quick Reply Bar */}
      <div className="p-3 sm:p-4 bg-[#08090d]/95 border-t border-[#282C35]/60 backdrop-blur-md sticky bottom-0 z-20 space-y-2">
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
            className="flex items-center gap-1 rounded-xl border border-[#282C35] bg-[#111318] p-1 w-fit"
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
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors min-h-[44px] sm:min-h-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                    isActive
                      ? 'bg-[#FF8C42]/10 text-[#FF8C42] shadow-[inset_0_0_0_1px_rgba(255,140,66,0.30)]'
                      : 'text-[#A1A4AC] hover:bg-white/[0.04] hover:text-[#EDEDED]'
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
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#16181D] border border-[#282C35] text-xs text-[#F5F5F5]"
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
                    strokeWidth={1.8}
                    d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"
                  />
                </svg>
                <span className="truncate max-w-[150px]">{att.name}</span>
                <button
                  type="button"
                  onClick={() => removePendingAttachment(index)}
                  className="text-[#6B6E76] hover:text-[#F87171] p-0.5 rounded transition-colors"
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
        <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-2xl border border-[#282C35] bg-[#111318] shadow-2xl">
          {/* File Attachment Hidden Input */}
          <input
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
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl p-1.5 text-[#A1A4AC] transition-all hover:bg-[#282C35] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] focus-visible:ring-offset-2 focus-visible:ring-offset-[#111318] sm:min-h-0 sm:min-w-0 sm:p-2"
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
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl p-1 text-[#FF8C42] transition-all hover:bg-[#FF8C42]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] focus-visible:ring-offset-2 focus-visible:ring-offset-[#111318] sm:min-h-0 sm:min-w-0 sm:p-1.5"
            title="Ask Quanty AI to write response"
            aria-label="Ask Quanty AI to write a response"
          >
            <Quanty size={20} expression={quantyFace} bob={false} />
          </button>

          {/* Chat Input Text Area */}
          <input
            id="chatbot-reply-input"
            type="text"
            value={quickReplyText}
            onChange={(e) => setQuickReplyText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleBarSend();
              }
            }}
            placeholder={
              composeMode === 'mail'
                ? 'Start the letter — Enter opens the composer…'
                : 'Message (↵ to send)…'
            }
            aria-label={composeMode === 'mail' ? 'Start a letter reply' : 'Message'}
            className="min-h-[44px] min-w-0 flex-1 bg-transparent border-none text-xs sm:text-sm text-white placeholder-[#A1A4AC] focus:outline-none px-1 sm:px-2 py-1.5 sm:min-h-0"
          />

          {/* Send Button — sends the line, or carries it into the full composer */}
          <button
            type="button"
            onClick={handleBarSend}
            disabled={
              composeMode === 'chat' &&
              ((!quickReplyText.trim() && pendingAttachments.length === 0) || isSendingQuickReply)
            }
            className="px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-[#FF8C42] hover:bg-[#FF9B5A] active:bg-[#E8752F] text-[#111111] text-xs font-semibold transition-all shadow-sm active:scale-95 disabled:opacity-30 disabled:pointer-events-none shrink-0 flex items-center gap-1.5 min-h-[44px] sm:min-h-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] focus-visible:ring-offset-2 focus-visible:ring-offset-[#111318]"
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
            className="w-full max-w-sm rounded-2xl border border-[#3A404D] bg-[#111318] p-5"
          >
            <h2 id="trash-title" className="text-base font-bold text-white">
              Move conversation to Trash?
            </h2>
            <p className="mt-2 text-xs text-[#A1A4AC]">
              The complete conversation will be moved to Trash.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmTrash(false)}
                className="min-h-[44px] rounded-xl border border-[#282C35] px-4 text-xs font-semibold text-white"
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
