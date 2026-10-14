'use client';

import { useContext, useEffect, useRef, useState } from 'react';
import { apiClient } from '../services/api-client';
import { showToast } from '../components/InboxToast';
import { UndoSendContext } from './UndoSendCountdownBar';
import type { PersonConversation } from '../lib/peopleGrouping';
import {
  clearThreadDraft,
  ensureThreadDraftNamespaceV3,
  isThreadDraftEmpty,
  loadThreadDraft,
  saveThreadDraft,
  switchThreadDraft,
  threadDraftAccountKey,
  windowThreadDraftStorage,
} from '../lib/threadReplyDrafts';
import { draftSaveStateLabel } from './useDraftAutosave';

export interface ThreadComposerProps {
  conversation: PersonConversation;
  /**
   * The backend-verified IMMUTABLE user id (`AuthUser.id` — the
   * access-token `sub`, the users-table primary key). The thread-reply
   * draft namespace is keyed by this id (+ the fixed single-tenant scope),
   * never by the mutable email: an address change keeps the account's
   * drafts, and a reassigned address cannot inherit them (P0
   * qm-draft-privacy-isolation, CODEX-REVIEW 6157628718). Empty string =
   * unknown account = no draft persistence at all (fail closed).
   */
  currentUserId: string;
  /**
   * Fired when the send is CONFIRMED — i.e. after the undo window closes and
   * the real compose+send resolved. The host refetches and swaps the
   * optimistic bubble for the confirmed message. Carries (text, subject) so
   * the host can withdraw only this send's bubble: a second send may still
   * be inside its own recall window.
   */
  onSent?: (text: string, subject: string) => void;
  /**
   * P1-C: fired the moment the user hits send, before the network round-trip.
   * The host renders an optimistic "Sending…" bubble so the thread never
   * looks empty on slow mobile data. The text stays in the box only when the
   * send actually fails (see handleSend).
   */
  onSendStart?: (text: string, subject: string) => void;
  /**
   * Fired when the send fails (compose or delivery), right after the error
   * toast. The host must withdraw the optimistic "Sending…" bubble that
   * `onSendStart` added — a failed send must never look like a sent message.
   * The typed text is handed back to the box (the failure contract is
   * unchanged).
   */
  onSendError?: (text: string, subject: string) => void;
  /**
   * Fired when the user recalls a queued send inside the undo window (the
   * bar's Undo button, or the Z key). Nothing was sent, so this is neither
   * success nor failure: the host must withdraw the optimistic "Sending…"
   * bubble exactly like `onSendError`, and the composer itself hands the
   * words back to the box.
   */
  onSendUndo?: (text: string, subject: string) => void;
  /**
   * QM fix qm-personthread-smart-replies: a smart-reply chip the user tapped
   * above the box (SmartReplySuggestions). `{ text, nonce }` — the host
   * mints a fresh nonce per tap so re-tapping the same chip still refills
   * the box. Applied by overwriting the draft: a chip tap is an explicit
   * "use these words" gesture, mirroring ConversationalThreadView's
   * setQuickReplyText. The box keeps its own state afterwards — typing,
   * sending, and the person-switch reset behave exactly as before.
   */
  suggestedReply?: { text: string; nonce: number } | null;
}

/**
 * The subject a reply in this thread carries.
 *
 * Pure function so the no-double-"Re:" rule is unit-testable: an existing
 * "Re:" (any casing, optional trailing space) is left alone, a bare subject
 * gets one prefix, and a subject-less thread falls back to a lone "Re:" so
 * the send path never ships an empty subject.
 */
export function defaultReplySubject(lastSubject: string): string {
  const trimmed = (lastSubject ?? '').trim();
  if (!trimmed) return 'Re:';
  return /^re:\s*/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

/**
 * The backend calls the send path runs against.
 *
 * Injected so the send orchestration is unit-testable without a DOM or a
 * live server. It is exactly the two calls PR #771's fixed path makes —
 * compose then send — plus the toast callback. There is deliberately no
 * discard handler, no router, and no navigation anywhere in this contract:
 * a failed send must never discard the draft or leave the thread.
 */
export interface ThreadSendDeps {
  composeEmail: (data: {
    to: Array<{ email: string }>;
    subject: string;
    bodyText: string;
    messageKind: 'chat';
    inReplyTo: string;
  }) => Promise<{ success: boolean; data?: { id?: string }; error?: { message?: string } }>;
  sendEmail: (draftId: string) => Promise<{ success: boolean; error?: { message?: string } }>;
  toast: (text: string, type: 'success' | 'error') => void;
}

export interface ThreadSendOutcome {
  ok: boolean;
  errorMessage?: string;
}

/**
 * The fixed #771 send path for a thread reply: compose a chat-kind draft
 * addressed to the person, in-reply-to the thread's last message, then send
 * it. Success toasts "Message sent"; failure toasts the server's own message
 * and reports `ok: false` so the caller keeps the typed text.
 */
export async function executeThreadSend(
  deps: ThreadSendDeps,
  conversation: PersonConversation,
  subject: string,
  bodyText: string,
): Promise<ThreadSendOutcome> {
  try {
    const composeRes = await deps.composeEmail({
      to: [{ email: conversation.email }],
      subject,
      bodyText,
      messageKind: 'chat',
      inReplyTo: conversation.lastMessage.id,
    });
    if (!composeRes.success || !composeRes.data?.id) {
      throw new Error(composeRes.error?.message || 'Failed to compose email');
    }
    const sendRes = await deps.sendEmail(composeRes.data.id);
    if (!sendRes.success) {
      throw new Error(sendRes.error?.message || 'Failed to deliver email');
    }
    deps.toast('Message sent', 'success');
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send message';
    deps.toast(message, 'error');
    return { ok: false, errorMessage: message };
  }
}

/**
 * The message box pinned at the bottom of a person thread.
 *
 * Chat-style: textarea with auto-grow, Enter sends, Shift+Enter inserts a
 * newline. The subject is automatic (`Re: <last subject>`, never doubled);
 * "New topic" reveals a small inline field to start a fresh subject instead.
 *
 * Send-failure contract (from the #771 fix): the error toasts, the typed
 * text is preserved, nothing navigates, and no discard handler is ever
 * called — there is no `onDiscard` prop on this component by design.
 */
export function ThreadComposer({ conversation, currentUserId, suggestedReply, onSent, onSendStart, onSendError, onSendUndo }: ThreadComposerProps) {
  // QM fix qm-threadcomposer-draft-persist: a draft restore on mount. If the
  // user left unsent text for this person (same-device localStorage draft),
  // it comes back instead of an empty box — and survives a full reload, not
  // just in-app navigation. An explicit `suggestedReply` still wins the box:
  // a chip tap is an intentional "use these words" gesture (this also matches
  // the mount-time effect below, which overwrites the box on a fresh tap).
  //
  // QM fix qm-draft-privacy-isolation (P0, CODEX-REVIEW 6157628718): drafts
  // are namespaced by the authenticated account — `threadDraftAccountKey`
  // derives the namespace from the IMMUTABLE backend-verified user id
  // (currentUserId, never the mutable email) plus the fixed single-tenant
  // scope, with length-prefixed (unambiguous) tuple encoding. A different
  // account on this browser gets a different namespace and can never
  // restore this account's drafts. An empty account key means no
  // persistence at all (fail closed).
  const accountKey = threadDraftAccountKey(currentUserId);
  const [restoredDraft] = useState(() =>
    loadThreadDraft(windowThreadDraftStorage(), conversation.personKey, accountKey),
  );
  const [body, setBody] = useState(suggestedReply?.text ?? restoredDraft?.body ?? '');
  const [newTopic, setNewTopic] = useState(restoredDraft?.newTopic ?? false);
  const [customSubject, setCustomSubject] = useState(restoredDraft?.customSubject ?? '');
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // The honest save indicator state. 'pristine' shows nothing (draftSaveStateLabel
  // returns null); 'saved'/'error' show the real outcome of the last write.
  const [draftSaveState, setDraftSaveState] = useState<'pristine' | 'saved' | 'error'>(
    restoredDraft ? 'saved' : 'pristine',
  );
  const draftSaveLabel = draftSaveStateLabel(draftSaveState);

  // Mirror of the latest composer values, assigned during render so the
  // person-switch flush below can never lose a keystroke that raced the tap.
  const latestDraftRef = useRef({ body, newTopic, customSubject });
  latestDraftRef.current = { body, newTopic, customSubject };
  // Which person's draft is currently settled in the box, and under which
  // account namespace. Guards the write-through effect during a switch so it
  // can't write one person's text under another person's key — or one
  // account's text under another account's key.
  const settledPersonKeyRef = useRef(conversation.personKey);
  const settledAccountKeyRef = useRef(accountKey);

  // qm-draft-privacy-isolation: once per page load, drop the retired v1
  // (unscoped) and v2 (mutable-email-scoped) draft keys — neither is
  // attributable to a stable account identity, and the next sign-in on
  // this browser could otherwise restore them. v3 keys (tenant +
  // immutable-id-scoped) are left alone — they partition safely.
  useEffect(() => {
    ensureThreadDraftNamespaceV3(windowThreadDraftStorage());
  }, []);

  // Write-through persistence: every edit lands in the current (account,
  // person) draft immediately. Switching people only ever swaps which saved
  // draft is shown — typed text is never silently discarded. An emptied box
  // deletes its draft, so cleared text never resurfaces (e.g. after a send).
  // No account identity → no writes at all (fail closed, never a shared key).
  useEffect(() => {
    if (settledPersonKeyRef.current !== conversation.personKey) return;
    if (settledAccountKeyRef.current !== accountKey) return;
    if (!accountKey) return;
    const store = windowThreadDraftStorage();
    const draft = { body, newTopic, customSubject, updatedAt: Date.now() };
    if (isThreadDraftEmpty(draft)) {
      clearThreadDraft(store, conversation.personKey, accountKey);
      setDraftSaveState('pristine');
      return;
    }
    setDraftSaveState(
      saveThreadDraft(store, conversation.personKey, accountKey, draft) ? 'saved' : 'error',
    );
  }, [body, newTopic, customSubject, conversation.personKey, accountKey]);

  // A different person is a different draft: flush the outgoing person's
  // latest text synchronously, then restore the incoming person's saved
  // draft (or an empty box when they have none). Declared AFTER the
  // write-through effect so that effect's guard sees the stale
  // settledPersonKey and yields to this one during a switch.
  //
  // qm-draft-privacy-isolation: a different ACCOUNT is also a different
  // draft namespace. The outgoing account's text is flushed under ITS OWN
  // account key first (it stays that account's draft), then the incoming
  // account loads from its own namespace — a switch can never write
  // account A's words into account B's draft or hand A back B's text.
  useEffect(() => {
    const prevKey = settledPersonKeyRef.current;
    const prevAccount = settledAccountKeyRef.current;
    const nextKey = conversation.personKey;
    const nextAccount = accountKey;
    if (prevKey === nextKey && prevAccount === nextAccount) return;
    const store = windowThreadDraftStorage();
    const latest = latestDraftRef.current;
    const now = Date.now();
    let incoming: { body: string; newTopic: boolean; customSubject: string } | null;
    let hadSavedDraft = false;
    if (prevAccount !== nextAccount) {
      // Account switch (no remount): keep the outgoing account's text in its
      // own namespace, then start the new account from its own.
      if (prevAccount && !isThreadDraftEmpty(latest)) {
        saveThreadDraft(store, prevKey, prevAccount, { ...latest, updatedAt: now });
      }
      incoming = loadThreadDraft(store, nextKey, nextAccount, now);
      hadSavedDraft = incoming !== null;
    } else {
      const restored = switchThreadDraft({
        store,
        prevPersonKey: prevKey,
        nextPersonKey: nextKey,
        accountKey: nextAccount,
        latest,
        now,
      });
      incoming = { body: restored.body, newTopic: restored.newTopic, customSubject: restored.customSubject };
      hadSavedDraft = restored.hadSavedDraft;
    }
    setBody(incoming?.body ?? '');
    setNewTopic(incoming?.newTopic ?? false);
    setCustomSubject(incoming?.customSubject ?? '');
    setDraftSaveState(hadSavedDraft ? 'saved' : 'pristine');
    settledPersonKeyRef.current = nextKey;
    settledAccountKeyRef.current = nextAccount;
  }, [conversation.personKey, accountKey]);

  // QM fix qm-personthread-smart-replies: a tapped smart-reply chip lands
  // here. Fill the box and put the caret at the end so the user can edit or
  // hit Enter to send — the same gesture as ConversationalThreadView's quick
  // reply bar. Keyed on object identity (the host mints a fresh `{text,
  // nonce}` per tap), so re-tapping the same chip refills the box.
  useEffect(() => {
    if (!suggestedReply) return;
    setBody(suggestedReply.text);
    const el = textareaRef.current;
    if (el) {
      el.focus();
      // setBody flushes async — move the caret after paint so it lands at
      // the end of the filled text rather than position 0.
      requestAnimationFrame(() => {
        el.setSelectionRange(el.value.length, el.value.length);
      });
    }
  }, [suggestedReply]);

  // Auto-grow: the box follows its content instead of scrolling internally.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [body]);

  const subject =
    newTopic && customSubject.trim()
      ? customSubject.trim()
      : defaultReplySubject(conversation.lastMessage.subject);

  const canSend = body.trim().length > 0 && !isSending;

  /**
   * The undo queue shared by the whole app (AppShell's UndoSendProvider).
   * Null when the composer renders without a provider above it — the send
   * then falls back to the direct path with today's exact behavior, so the
   * composer is never broken by its host's wiring.
   */
  const undoSend = useContext(UndoSendContext);

  const handleSend = async () => {
    const text = body.trim();
    if (!text || isSending) return;
    setIsSending(true);
    // P1-C: optimistic bubble first — the host shows it as "Sending…".
    onSendStart?.(text, subject);
    // The box clears the moment Send is pressed (like quick reply's bar and
    // the composer closing on Send): the words now live in the optimistic
    // bubble, and the undo queue below owns the in-flight state. A failed
    // send or an Undo hands them back via restoreDraft.
    const wasNewTopic = newTopic;
    const savedCustomSubject = customSubject;
    setBody('');
    setCustomSubject('');
    setNewTopic(false);

    // Never clobber a newer draft the user started typing during the recall
    // window — same guard as quick reply's restoreToReplyBar.
    const restoreDraft = () => {
      setBody((prev) => (prev.trim() ? prev : text));
      if (wasNewTopic) {
        setNewTopic(true);
        setCustomSubject((prev) => (prev.trim() ? prev : savedCustomSubject));
      }
    };

    const deps: ThreadSendDeps = {
      composeEmail: (data) => apiClient.composeEmail(data),
      sendEmail: (draftId) => apiClient.sendEmail(draftId),
      toast: (t, type) => showToast({ text: t, type }),
    };

    try {
      if (undoSend) {
        // The 10-second recall window shared with EmailComposer,
        // DockedComposer, quick reply and QuantyCopilotDrawer. compose+send
        // run ONLY when the window closes (`onSendNow`); until then the
        // provider's countdown bar is the undo control (Undo button, Z key,
        // Send Now). The failure contract stays P1-C: the optimistic bubble
        // is withdrawn and the words come back — and the bar never claims
        // "sent" for a failed send (`onSendNow` rejects on failure;
        // `executeThreadSend` already showed the honest error toast, so no
        // second toast is fired here).
        undoSend.queueSend({
          to: conversation.name || conversation.email,
          subject,
          body: text,
          onSendNow: async () => {
            const outcome = await executeThreadSend(deps, conversation, subject, text);
            if (!outcome.ok) {
              throw new Error(outcome.errorMessage || 'Failed to send message');
            }
            onSent?.(text, subject);
          },
          onSendFailed: () => {
            onSendError?.(text, subject);
            restoreDraft();
          },
          onUndo: () => {
            onSendUndo?.(text, subject);
            restoreDraft();
            // The words are back — put the caret there so the user can edit.
            requestAnimationFrame(() => textareaRef.current?.focus());
          },
        });
      } else {
        // No undo provider above this composer: the direct send keeps
        // today's exact behavior — success toasts and clears, failure toasts
        // and keeps the text. Nothing navigates, nothing is discarded.
        const outcome = await executeThreadSend(deps, conversation, subject, text);
        if (outcome.ok) {
          onSent?.(text, subject);
        } else {
          onSendError?.(text, subject);
          restoreDraft();
        }
      }
      // No navigation, no discard — `executeThreadSend` has no access to either.
    } finally {
      // In the queued path the undo queue owns the in-flight state from
      // here — the box is usable again immediately (a second send flushes
      // the first, the manager's documented contract). In the direct path
      // the send has settled by now, so this is a plain reset.
      setIsSending(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="bg-black px-3 pb-3 pt-2 sm:px-4">
      {newTopic && (
        <input
          type="text"
          value={customSubject}
          onChange={(event) => setCustomSubject(event.target.value)}
          placeholder="New topic subject…"
          aria-label="New topic subject"
          maxLength={200}
          className="mb-2 w-full rounded-xl bg-[var(--quant-surface-elevated)] px-3.5 py-2.5 text-sm text-white placeholder-[#6B6E76] focus:outline-none focus:ring-2 focus:ring-[#F97316]"
        />
      )}
      <div className="flex items-end gap-2 rounded-2xl bg-[var(--quant-surface-elevated)] px-2 py-2">
        <button
          type="button"
          onClick={() => setNewTopic((prev) => !prev)}
          aria-pressed={newTopic}
          title={newTopic ? 'Reply with the thread subject' : 'Start a new topic subject'}
          className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316] ${
            newTopic ? 'bg-[#F97316] text-black' : 'text-[#9BA0AA] hover:text-white'
          }`}
        >
          {newTopic ? 'Re:' : 'New topic'}
        </button>
        <textarea
          id="people-reply-input"
          ref={textareaRef}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={handleKeyDown}
          // P1-1 (mobile): when the iOS keyboard opens, make sure the box
          // is scrolled into the resized visible area.
          onFocus={() => {
            textareaRef.current?.scrollIntoView({ block: 'nearest' });
          }}
          rows={1}
          placeholder={`Message ${conversation.name}…`}
          aria-label={`Message ${conversation.name}`}
          disabled={isSending}
          className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-white placeholder-[#6B6E76] focus:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!canSend}
          aria-label={isSending ? 'Sending message' : 'Send message'}
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl bg-[#F97316] px-4 text-sm font-bold text-black transition-all hover:bg-[#FB8A3D] disabled:opacity-40 disabled:hover:bg-[#F97316] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          {isSending ? (
            // P2-7: icon-only while sending — the "Sending" label used to
            // widen the button and squeeze the textarea. Sending state is
            // conveyed by the spinner + disabled opacity instead.
            <span
              className="size-4 rounded-full border-2 border-black/30 border-t-black animate-spin"
              aria-hidden="true"
            />
          ) : (
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
      <p className="mt-1.5 px-1 text-[11px] text-[#6B6E76]">
        {newTopic ? 'Starting a new topic' : `Replying: ${subject}`} · Enter to send
        {/* P2-3: the Shift+Enter hint is meaningless on phone keyboards. */}
        <span className="hidden sm:inline">, Shift+Enter for a new line</span>
        {/* QM fix qm-threadcomposer-draft-persist: honest autosave indicator —
            real state of the last localStorage write (null when pristine, so
            the chat-style bar stays quiet), mirroring EmailComposer. */}
        {draftSaveLabel && <span> · {draftSaveLabel}</span>}
      </p>
    </div>
  );
}
