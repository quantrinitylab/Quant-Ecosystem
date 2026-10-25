'use client';

import { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiClient } from '../services/api-client';
import { showToast } from '../components/InboxToast';
import { UndoSendContext } from './UndoSendCountdownBar';
import { ScheduleSendModal, isPastScheduleTime } from './ScheduleSendModal';
import { EmailTemplates, type EmailTemplate } from './EmailTemplates';
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
import { useReadReceiptsPreference } from '../hooks/useReadReceiptsPreference';

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
   * optimistic bubble for the confirmed message. Carries (text, subject,
   * clientId): `clientId` is the id this send's `onSendStart` minted, so the
   * host withdraws exactly this send's bubble — a second send may still be
   * inside its own recall window with identical text+subject, and its bubble
   * must stay (qm-optimistic-bubble-miscorrelation).
   */
  onSent?: (text: string, subject: string, clientId?: string) => void;
  /**
   * P1-C: fired the moment the user hits send, before the network round-trip.
   * The host renders an optimistic "Sending…" bubble so the thread never
   * looks empty on slow mobile data. The text stays in the box only when the
   * send actually fails (see handleSend). The `clientId` returned in the
   * call is this send's correlation id — the host must key its bubble by it
   * and pass it back through onSent/onSendError/onSendUndo.
   */
  onSendStart?: (text: string, subject: string, clientId?: string) => void;
  /**
   * Fired when the send fails (compose or delivery), right after the error
   * toast. The host must withdraw the optimistic "Sending…" bubble that
   * `onSendStart` added — a failed send must never look like a sent message.
   * The typed text is handed back to the box (the failure contract is
   * unchanged). Correlated by the send's `clientId`.
   */
  onSendError?: (text: string, subject: string, clientId?: string) => void;
  /**
   * Fired when the user recalls a queued send inside the undo window (the
   * bar's Undo button, or the Z key). Nothing was sent, so this is neither
   * success nor failure: the host must withdraw the optimistic "Sending…"
   * bubble exactly like `onSendError`, and the composer itself hands the
   * words back to the box. Correlated by the send's `clientId`.
   */
  onSendUndo?: (text: string, subject: string, clientId?: string) => void;
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
 * Mint the per-send correlation id threaded through onSendStart / onSent /
 * onSendError / onSendUndo. The host keys optimistic "Sending…" bubbles by
 * it, so identical rapid sends (same text+subject) withdraw the RIGHT bubble
 * even when the undo queue's flush-previous contract delivers an earlier
 * send while a later identical one is still queued — match-by-(text,subject)
 * would remove the newest match, i.e. the wrong bubble.
 */
export function mintSendClientId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * The backend calls the send path runs against.
 *
 * Injected so the send orchestration is unit-testable without a DOM or a
 * live server. It is exactly the two calls PR #771's fixed path makes —
 * compose then send — plus the toast callback, with an optional
 * `sendAt` carrying the ScheduleSendModal contract (POST /emails/:id/send
 * with `{ sendAt }`, the same contract DockedComposer and the /compose
 * page's EmailComposer use). There is deliberately no discard handler, no
 * router, and no navigation anywhere in this contract: a failed send must
 * never discard the draft or leave the thread.
 */
export interface ThreadSendDeps {
  composeEmail: (data: {
    to: Array<{ email: string }>;
    subject: string;
    bodyText: string;
    messageKind: 'chat';
    inReplyTo: string;
    /**
     * Per-message open-tracking beacon opt-out (fix/qm-read-receipts).
     * Omitted = the server's read-receipts default for the user (see
     * routes/emails.ts), so older callers keep working; pass an explicit
     * boolean only from the composer's own toggle.
     */
    trackOpens?: boolean;
  }) => Promise<{ success: boolean; data?: { id?: string }; error?: { message?: string } }>;
  sendEmail: (
    draftId: string,
    options?: { sendAt?: string },
  ) => Promise<{ success: boolean; error?: { message?: string } }>;
  toast: (text: string, type: 'success' | 'error') => void;
}

export interface ThreadSendOutcome {
  ok: boolean;
  errorMessage?: string;
}

/**
 * Merge a saved template's body into the thread-reply draft, non-destructively.
 *
 * Pure function so the merge rule is unit-testable: an empty draft is
 * replaced by the template text; a non-empty draft gets the template text
 * appended with a blank-line separator — the user's own words are never
 * silently clobbered. Same convention as DockedComposer's saved-templates
 * apply (thread replies have no format ranges to reconcile, so only the
 * text matters).
 */
export function mergeSavedTemplateIntoDraft(currentBody: string, templateBody: string): string {
  const trimmed = templateBody ?? '';
  return currentBody.trim() ? `${currentBody}\n\n${trimmed}` : trimmed;
}

export interface ThreadTemplateApplyInput {
  body: string;
  newTopic: boolean;
  customSubject: string;
  template: EmailTemplate;
}

/**
 * The full saved-template apply for a thread reply, as pure data so the
 * subject rule is unit-testable alongside the body rule. The thread subject
 * is automatic (`Re: …`); only a New-topic draft whose subject field is
 * still empty inherits the template's subject — never clobbering a typed one.
 *
 * Honest scope: backend /email-templates stores name/subject/body only
 * (no attachments, no per-template CC/BCC), so only body (+ new-topic
 * subject) are inserted — nothing is faked.
 */
export function applyThreadTemplateToDraft(input: ThreadTemplateApplyInput): {
  body: string;
  customSubject: string;
} {
  const body = mergeSavedTemplateIntoDraft(input.body, input.template.body);
  const customSubject =
    input.newTopic && !input.customSubject.trim() && input.template.subject.trim()
      ? input.template.subject.trim()
      : input.customSubject;
  return { body, customSubject };
}

// Schedule-send clock icon — pure SVG like the file's icon set (mirrors
// DockedComposer's IconScheduleClock).
function IconScheduleClock({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

// Saved email templates (backend /email-templates CRUD) — document icon, pure
// SVG like the file's icon set (mirrors DockedComposer's IconTemplate).
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

/**
 * The fixed #771 send path for a thread reply: compose a chat-kind draft
 * addressed to the person, in-reply-to the thread's last message, then send
 * it. Success toasts "Message sent" (or "Message scheduled" for a scheduled
 * send); failure toasts the server's own message and reports `ok: false` so
 * the caller keeps the typed text.
 *
 * `scheduledAt` (ISO, future) is the ScheduleSendModal contract — carried
 * into POST /emails/:id/send as `{ sendAt }`, exactly like DockedComposer
 * and the /compose page's EmailComposer. The backend 400s past times and
 * the modal rejects them client-side; the component's `handleSend` repeats
 * the past-time guard as belt-and-braces.
 *
 * `trackOpens` (fix/qm-read-receipts) is this composer's per-message
 * open-tracking choice: omitted means the server applies the user's
 * read-receipts default, an explicit boolean overrides it for this message.
 */
export async function executeThreadSend(
  deps: ThreadSendDeps,
  conversation: PersonConversation,
  subject: string,
  bodyText: string,
  scheduledAt?: string,
  // fix/qm-read-receipts: the thread composer's own per-message toggle.
  // Undefined keeps the payload byte-identical to before (the server then
  // applies the user's read-receipts default); an explicit boolean rides
  // the compose payload and wins for this message.
  trackOpens?: boolean,
): Promise<ThreadSendOutcome> {
  try {
    const composeRes = await deps.composeEmail({
      to: [{ email: conversation.email }],
      subject,
      bodyText,
      messageKind: 'chat',
      inReplyTo: conversation.lastMessage.id,
      ...(trackOpens !== undefined ? { trackOpens } : {}),
    });
    if (!composeRes.success || !composeRes.data?.id) {
      throw new Error(composeRes.error?.message || 'Failed to compose email');
    }
    // The schedule contract: sendAt carries the future time; omit it for
    // an immediate send (the immediate-send call stays byte-identical).
    // Past times never reach here (guarded above) and the backend 400s
    // them as backstop — never a silent immediate send.
    const sendRes = scheduledAt
      ? await deps.sendEmail(composeRes.data.id, { sendAt: scheduledAt })
      : await deps.sendEmail(composeRes.data.id);
    if (!sendRes.success) {
      throw new Error(sendRes.error?.message || 'Failed to deliver email');
    }
    deps.toast(scheduledAt ? 'Message scheduled' : 'Message sent', 'success');
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

  // Saved email templates (backend /email-templates CRUD, via the
  // EmailTemplates picker) — the same backend-backed surface the docked
  // composer wires. The picker is portaled to document.body and anchored
  // above the toolbar button so the chat bar's layout can never clip it.
  const [showTemplates, setShowTemplates] = useState(false);
  const [templatesMenuPos, setTemplatesMenuPos] = useState<{ left: number; bottom: number } | null>(null);
  const templatesAnchorRef = useRef<HTMLButtonElement>(null);

  // Schedule-send: this thread composer is a compose surface like any other,
  // and Gmail ships schedule-send on every compose surface — so it reuses
  // the same ScheduleSendModal the /compose page's EmailComposer and the
  // docked composer wire (same pick logic, same past-time rejection, same
  // POST /emails/:id/send `{ sendAt }` contract).
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Read receipts (fix/qm-read-receipts): this composer — the person-thread
  // bar, the default home surface — previously had NO open-tracking toggle
  // at all, so thread replies always sent tracked. The toggle starts from
  // the user's persisted read-receipts default once it loads, and a tap
  // wins over the seed (same convention as EmailComposer/DockedComposer).
  const [trackOpens, setTrackOpens] = useState(true);
  const readReceiptsPreference = useReadReceiptsPreference();
  const trackOpensTouchedRef = useRef(false);
  useEffect(() => {
    if (readReceiptsPreference.loaded && !trackOpensTouchedRef.current) {
      setTrackOpens(readReceiptsPreference.enabled);
    }
  }, [readReceiptsPreference.loaded, readReceiptsPreference.enabled]);

  /**
   * Insert a saved template into the reply draft, non-destructively: the
   * body is replaced only when empty, otherwise appended — the user's own
   * words are never silently clobbered (same convention as DockedComposer).
   * State math lives in the pure `applyThreadTemplateToDraft` above so the
   * subject rule is unit-testable; this is the thin state/toast wrapper.
   */
  const applySavedTemplate = (template: EmailTemplate) => {
    setShowTemplates(false);
    const next = applyThreadTemplateToDraft({ body, newTopic, customSubject, template });
    setBody(next.body);
    setCustomSubject(next.customSubject);
    showToast({ text: `Template "${template.name}" applied`, type: 'success' });
    textareaRef.current?.focus();
  };

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

  /**
   * The send entry: immediate (no `scheduledAt`) or scheduled (ISO, future,
   * from the ScheduleSendModal). A scheduled send DEFERS to the same
   * 10-second recall window as an immediate one — it never bypasses it:
   * during the window nothing has been delivered, so Undo genuinely cancels
   * the schedule before it exists server-side. The bar claims "Email
   * scheduled!" via successLabel so it never says "Message sent!" for a
   * future schedule.
   */
  const handleSend = async (scheduledAt?: string) => {
    const text = body.trim();
    if (!text || isSending) return;
    // Schedule-send: the modal rejects past times and the backend 400s
    // them — a past scheduledAt must never be queued, or the queue below
    // would deliver it IMMEDIATELY while the UI claimed "scheduled".
    // Belt-and-braces here in case the modal's clock raced the confirm
    // (same convention as DockedComposer, PR #908).
    if (scheduledAt && isPastScheduleTime(new Date(scheduledAt))) {
      showToast({
        text: 'That time has already passed — pick a future time to schedule your send.',
        type: 'error',
      });
      return;
    }
    setIsSending(true);
    // P1-C: optimistic bubble first — the host shows it as "Sending…".
    // qm-optimistic-bubble-miscorrelation: mint ONE correlation id per
    // handleSend and thread it through every callback below, so the host
    // withdraws exactly this send's bubble (identical rapid sends share
    // text+subject and cannot be told apart any other way).
    const sendClientId = mintSendClientId();
    onSendStart?.(text, subject, sendClientId);
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
      // Forward the schedule options only when present: the immediate-send
      // call stays byte-identical (one arg, no options object), the same
      // contract the ThreadComposerUndoSend suite pins.
      sendEmail: (draftId, options) =>
        options ? apiClient.sendEmail(draftId, options) : apiClient.sendEmail(draftId),
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
          scheduledAt,
          successLabel: scheduledAt ? 'Email scheduled!' : undefined,
          onSendNow: async () => {
            const outcome = await executeThreadSend(deps, conversation, subject, text, scheduledAt, trackOpens);
            if (!outcome.ok) {
              throw new Error(outcome.errorMessage || 'Failed to send message');
            }
            onSent?.(text, subject, sendClientId);
          },
          onSendFailed: () => {
            onSendError?.(text, subject, sendClientId);
            restoreDraft();
          },
          onUndo: () => {
            onSendUndo?.(text, subject, sendClientId);
            restoreDraft();
            // The words are back — put the caret there so the user can edit.
            requestAnimationFrame(() => textareaRef.current?.focus());
          },
        });
      } else {
        // No undo provider above this composer: the direct send keeps
        // today's exact behavior — success toasts and clears, failure toasts
        // and keeps the text. Nothing navigates, nothing is discarded.
        const outcome = await executeThreadSend(deps, conversation, subject, text, scheduledAt, trackOpens);
        if (outcome.ok) {
          onSent?.(text, subject, sendClientId);
        } else {
          onSendError?.(text, subject, sendClientId);
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
        {/* Saved email templates — the real backend-backed picker
            (EmailTemplates.tsx, /email-templates CRUD), the same surface the
            docked composer wires. Anchored above the chat bar via the portaled
            popover below. */}
        <button
          type="button"
          ref={templatesAnchorRef}
          onClick={() => {
            // Capture the anchor rect BEFORE toggling, so the portaled
            // popover can position itself above the button even though the
            // chat bar sits at the bottom of a scrolled thread view.
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
          title="Insert a saved email template"
          disabled={isSending}
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-[#9BA0AA] hover:text-[#F97316] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316] disabled:opacity-40"
        >
          <IconTemplate className="size-4" />
        </button>
        {/* Read receipts (fix/qm-read-receipts) — the per-message
            open-tracking toggle this bar never had: double-tick, Mail
            orange when on, grey when off, 44px hit target like its
            neighbours. Starts from the user's read-receipts default; a tap
            overrides it for this message only. */}
        <button
          type="button"
          onClick={() => {
            trackOpensTouchedRef.current = true;
            setTrackOpens((prev) => !prev);
          }}
          aria-pressed={trackOpens}
          aria-label={trackOpens ? 'Read receipts on — tap to turn off' : 'Read receipts off — tap to turn on'}
          title={trackOpens
            ? 'Read receipts: ON — a tiny invisible image tells you when this message is opened. Tap to send without tracking.'
            : 'Read receipts: OFF — this message sends with no open tracking. Tap to turn tracking on.'}
          disabled={isSending}
          className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316] disabled:opacity-40 ${
            trackOpens ? 'text-[#F97316]' : 'text-[#9BA0AA] hover:text-white'
          }`}
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="1 12 5 16 11 9" />
            <polyline points="8 12 12 16 18 9" />
          </svg>
        </button>
        {/* Schedule send — the same ScheduleSendModal the /compose page's
            EmailComposer and the docked composer use: Mail orange accent,
            chat-bar icon-button sizing, 44px hit target. Disabled until there
            is text to schedule (chat-style reply: an empty message is never
            scheduled). */}
        <button
          type="button"
          onClick={() => setShowScheduleModal(true)}
          disabled={!canSend}
          data-testid="thread-composer-schedule-button"
          aria-label="Schedule send"
          title="Schedule send — pick a future date & time"
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-[#9BA0AA] hover:text-[#F97316] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316] disabled:opacity-40"
        >
          <IconScheduleClock className="size-4" />
        </button>
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
      {/* Saved-templates picker — portaled to document.body with fixed
          positioning so the chat bar's layout can never clip it. Reads from
          the real backend /email-templates CRUD via the Next proxy. */}
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
      {/* Schedule Send Modal — the same component EmailComposer uses on the
          /compose page and DockedComposer wires (same pick logic, same
          past-time rejection, same backend contract). Its own fixed z-50
          backdrop, so no portal is needed — identical to DockedComposer. */}
      {showScheduleModal && (
        <ScheduleSendModal
          isOpen={showScheduleModal}
          onClose={() => setShowScheduleModal(false)}
          onSchedule={(at) => {
            setShowScheduleModal(false);
            void handleSend(at);
          }}
        />
      )}
    </div>
  );
}
