'use client';

// ============================================================================
// QuantChat - Foreground Toast Bridge (QC-F-341)
//
// The in-app toast system (InAppToast.tsx) was complete but production-dead:
// the container was mounted nowhere and nothing ever called it. This bridge
// is the ONE real trigger: it rides the shared chatSocket singleton, joins
// every listed conversation room (the chat-list pattern — realtime publish
// is per-conversation-channel only, so unjoined rooms can never signal),
// and runs each `new_message` event through the pure gate below. Events
// that pass are handed to handleForegroundPush, which owns the actual
// show/suppress decision (visibility, Req 9.10) and the deep-link
// resolution — this bridge never calls showInAppToast directly and never
// invents a route or a sender name (the socket payload carries senderId
// only, so the title is the backend generic-push title: 'QuantChat').
//
// Gates (evaluateForegroundToast, in order):
//   G1  only `new_message` events
//   G2  envelope present -> only chat.message.created.v1 (the legacy type
//       folds created/updated/deleted into one `new_message`; an edit or
//       delete is NOT a new message)
//   G3  a conversation id must be resolvable (data.conversationId, else
//       the envelope cursor `conversation.<id>:<seq>`) — the empty
//       snapshot_required hint stops here
//   G4  not the currently open conversation (it is already on screen)
//   G5  logged-in user required; own messages never toast; a message with
//       NO sender identity never toasts (fail-closed)
//   G6  muted conversations never toast — DORMANT today: the list
//       payload's participant DTOs carry no isMuted and the Conversation
//       record has none either (QC-F-341 U1 spot-check), so the muted set
//       is empty in practice; the gate wakes up by itself if the payload
//       ever starts carrying the field
//   G7  ephemeral/view-once content is NEVER the toast body (generic
//       'New message'); real content is shown verbatim, cut at 120 chars
//   G8  MESSAGES notification category must be enabled (read fresh from
//       the same localStorage settings the settings UI writes)
//   G9  visibility — delegated to handleForegroundPush, not re-checked
//   G10 the same message id never toasts twice (bounded seen-set)
//   G11 burst cap: at most 3 active toasts
//
// Socket pattern: the shipped useChatSocket hook (acquire/onMessage/
// release on the shared singleton) — chosen over direct chatSocket use so
// the refcounted connection lifecycle stays identical to every other
// consumer. There is deliberately NO demo/sample toast anywhere here.
// ============================================================================

import { useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@quant/shared-ui';
import { useChatSocket } from '../../hooks/useChatSocket';
import { useConversations } from '../../hooks/useConversations';
import { loadNotificationSettings } from '../settings/NotificationSettings';
import { handleForegroundPush, toastManager } from './InAppToast';

export interface ForegroundToastContext {
  /** The signed-in user's id, or null when logged out / unresolved. */
  currentUserId: string | null;
  /** Conversation id open on screen (`/chat/<id>`), or null elsewhere. */
  activeConversationId: string | null;
  /** Whether the MESSAGES notification category is enabled. */
  messagesEnabled: boolean;
  /** Conversations the user has muted (G6 — dormant, see header). */
  mutedConversationIds: ReadonlySet<string>;
  /** Message ids that already produced a toast (G10). */
  alreadySeen: ReadonlySet<string>;
  /** How many toasts are currently active (G11). */
  activeToastCount: number;
}

export type ForegroundToastDecision =
  | { fire: true; title: string; body: string; conversationId: string }
  | { fire: false; reason: string };

const TOAST_TITLE = 'QuantChat';
const GENERIC_BODY = 'New message';
const MAX_BODY_CHARS = 120;
const MAX_ACTIVE_TOASTS = 3;
const MAX_SEEN_IDS = 500;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** `conversation.<id>:<seq>` (realtime envelope cursor) -> `<id>`. */
function conversationIdFromCursor(cursor: unknown): string | null {
  if (typeof cursor !== 'string') return null;
  const match = /^conversation\.([^:]+):/.exec(cursor);
  return match ? match[1]! : null;
}

function senderIdOf(data: Record<string, unknown>): string | null {
  const direct = nonEmptyString(data.senderId) ?? nonEmptyString(data.sender);
  if (direct) return direct;
  const sender = asRecord(data.sender);
  return sender ? nonEmptyString(sender.id) : null;
}

function isEphemeral(data: Record<string, unknown>): boolean {
  const metadata = asRecord(data.metadata);
  if (metadata?.viewOnce === true || metadata?.isSnap === true) return true;
  const mode = metadata?.disappearMode ?? data.disappearMode;
  return Boolean(mode) && mode !== 'off';
}

/**
 * Pure gate for one normalized socket event. Every check is fail-closed:
 * anything unrecognised stops the toast instead of guessing.
 */
export function evaluateForegroundToast(
  event: unknown,
  ctx: ForegroundToastContext,
): ForegroundToastDecision {
  const ev = asRecord(event);
  // G1 — only new-message events.
  if (!ev || ev.type !== 'new_message') {
    return { fire: false, reason: 'not-new-message' };
  }
  const data = asRecord(ev.data ?? ev.payload ?? ev) ?? {};
  const envelope = asRecord(ev.envelope);

  // G2 — an envelope, when present, must say "created" (not edit/delete).
  if (envelope && envelope.event_type !== 'chat.message.created.v1') {
    return { fire: false, reason: 'not-created' };
  }

  // G3 — a conversation id must be resolvable.
  const conversationId =
    nonEmptyString(data.conversationId) ??
    (envelope ? conversationIdFromCursor(envelope.cursor) : null);
  if (!conversationId) {
    return { fire: false, reason: 'no-conversation' };
  }

  // G4 — the open conversation is already on screen.
  if (ctx.activeConversationId && conversationId === ctx.activeConversationId) {
    return { fire: false, reason: 'active-conversation' };
  }

  // G5 — identity: logged-in only, never own messages, never anonymous.
  if (!ctx.currentUserId) {
    return { fire: false, reason: 'unauthenticated' };
  }
  const senderId = senderIdOf(data);
  if (!senderId) {
    return { fire: false, reason: 'unknown-sender' };
  }
  if (senderId === ctx.currentUserId) {
    return { fire: false, reason: 'own-message' };
  }

  // G6 — muted conversations (dormant today, see header).
  if (ctx.mutedConversationIds.has(conversationId)) {
    return { fire: false, reason: 'muted' };
  }

  // G8 — the MESSAGES category gate (settings the user controls).
  if (!ctx.messagesEnabled) {
    return { fire: false, reason: 'messages-disabled' };
  }

  // G10 — duplicate delivery of the same message.
  const messageId = nonEmptyString(data.id);
  if (messageId && ctx.alreadySeen.has(messageId)) {
    return { fire: false, reason: 'duplicate' };
  }

  // G11 — burst cap.
  if (ctx.activeToastCount >= MAX_ACTIVE_TOASTS) {
    return { fire: false, reason: 'burst-cap' };
  }

  // G7 — body: ephemeral content never surfaces; real content verbatim
  // (cut at 120 chars, nothing appended); empty content -> generic.
  let body = GENERIC_BODY;
  if (!isEphemeral(data) && typeof data.content === 'string' && data.content.trim()) {
    body = data.content.slice(0, MAX_BODY_CHARS);
  }

  return { fire: true, title: TOAST_TITLE, body, conversationId };
}

function activeConversationIdFromPath(pathname: string | null): string | null {
  if (!pathname) return null;
  const match = /^\/chat\/([^/]+)/.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return match[1]!;
  }
}

interface ConversationShape {
  id: string;
  isMuted?: unknown;
  participants?: unknown;
}

/**
 * Builds the muted set from the conversation list: a conversation-level
 * flag, or the signed-in user's own member row when it carries one.
 * Dormant with today's payload (neither is sent) — see the header.
 */
function mutedConversationIdsOf(
  conversations: readonly ConversationShape[],
  currentUserId: string | null,
): Set<string> {
  const muted = new Set<string>();
  for (const conversation of conversations) {
    if (conversation.isMuted === true) {
      muted.add(conversation.id);
      continue;
    }
    if (currentUserId && Array.isArray(conversation.participants)) {
      const mine = conversation.participants
        .map(asRecord)
        .find((p) => p !== null && p.userId === currentUserId);
      if (mine && mine.isMuted === true) muted.add(conversation.id);
    }
  }
  return muted;
}

/**
 * Invisible bridge: subscribes to the shared chat socket and turns real
 * foreground `new_message` events into in-app toasts through the gates
 * above. Mounted once by AppProviders. Renders nothing.
 */
export function ForegroundToastBridge() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { conversations } = useConversations();
  const seenRef = useRef<Set<string>>(new Set());

  // Latest gate inputs, read by the (stable) socket handler at event time:
  // settings are re-read per event, so a settings change applies to the
  // very next message without remounting anything.
  const gateInputsRef = useRef({
    currentUserId: null as string | null,
    activeConversationId: null as string | null,
    mutedConversationIds: new Set<string>() as ReadonlySet<string>,
  });
  gateInputsRef.current = {
    currentUserId: user?.id ?? null,
    activeConversationId: activeConversationIdFromPath(pathname),
    mutedConversationIds: mutedConversationIdsOf(conversations, user?.id ?? null),
  };

  const handleEvent = useCallback((event: unknown) => {
    const inputs = gateInputsRef.current;
    const decision = evaluateForegroundToast(event, {
      currentUserId: inputs.currentUserId,
      activeConversationId: inputs.activeConversationId,
      messagesEnabled: loadNotificationSettings().MESSAGES !== false,
      mutedConversationIds: inputs.mutedConversationIds,
      alreadySeen: seenRef.current,
      activeToastCount: toastManager.getToasts().length,
    });
    if (!decision.fire) return;

    // G10 bookkeeping: remember fired message ids (bounded, oldest out —
    // the chat-socket known-ids pattern).
    const ev = asRecord(event);
    const data = ev ? asRecord(ev.data ?? ev.payload ?? ev) : null;
    const messageId = data ? nonEmptyString(data.id) : null;
    if (messageId) {
      const seen = seenRef.current;
      seen.add(messageId);
      if (seen.size > MAX_SEEN_IDS) {
        const oldest = seen.values().next().value as string | undefined;
        if (oldest !== undefined) seen.delete(oldest);
      }
    }

    // G9: visibility + deep-link resolution live in handleForegroundPush.
    handleForegroundPush({
      title: decision.title,
      body: decision.body,
      category: 'MESSAGES',
      contentId: decision.conversationId,
    });
  }, []);

  const { subscribe } = useChatSocket(handleEvent);

  // Join every listed conversation room (chat-list pattern). Subscribing
  // is set-based on the socket, so re-running for the same ids is a no-op;
  // like the chat list, there is no unsubscribe-on-shrink.
  useEffect(() => {
    for (const conversation of conversations) {
      subscribe(conversation.id);
    }
  }, [conversations, subscribe]);

  return null;
}

export default ForegroundToastBridge;
