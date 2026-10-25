'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { EmailComposer } from '../../components/EmailComposer';
import type { Attachment, ComposerMessageData } from '../../components/EmailComposer';
import { showToast } from '../../components/InboxToast';
import {
  buildReplyQuote,
  stripTrailingSignature,
} from '../../lib/email-body';
import {
  carryForwardAttachments,
  type ForwardDroppedAttachment,
} from '../../lib/forward-attachments';
import {
  FORWARD_LOAD_FAILURE_COPY,
  forwardComposeReducer,
  forwardPrefillFor,
  forwardSendDisabledReason,
  initialForwardComposeState,
  resolveForwardOriginal,
} from '../../lib/forward-load';
import { loadAttachmentBytes } from '../../lib/mail-attachments';
import { filterValidRecipients } from '../../lib/email-validation';
import { invalidateMailLists } from '../../lib/offline/folders';
import { apiClient } from '../../services/api-client';
import type { MessageKind } from '../../types';
import { UndoSendProvider } from '../../components/UndoSendCountdownBar';
import { ServerDraftRef, saveServerDraft } from '../../lib/serverDraft';

/**
 * REG-1: the prefill used to strip *every* "Re:" via /^(Re:\s*)+/i, so a reply
 * link carrying ?subject=Re:… rendered with a bare subject. Normalize stacked
 * prefixes down to exactly ONE "Re: " — never zero, never two.
 */
function normalizeReplySubject(subject: string): string {
  const base = subject.replace(/^(Re:\s*)+/i, '').trim();
  return base ? `Re: ${base}` : '';
}

export default function ComposePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const replyTo = searchParams?.get('replyTo') ?? null;
  const forwardId = searchParams?.get('forward') ?? null;
  const draftId = searchParams?.get('draftId') ?? null;
  const prefillBody = searchParams?.get('body') ?? null;
  const prefillSubject = searchParams?.get('subject') ?? null;
  const prefillTo = searchParams?.get('to') ?? null;
  // The server draft this page is saving to, plus the optimistic-concurrency
  // version it last observed. (qm-draft-conflict-tabs: two tabs on the same
  // ?draftId= used to keep only a per-tab id and save with no version, so
  // they silently overwrote each other's drafts. Updates now carry
  // expectedVersion: a 409 retries once with the server's fresh version
  // (last-writer-wins) with a toast, and a 404 drops the id so the next save
  // honestly mints one fresh draft instead of 404ing forever.)
  // A ref, not state: discard can run right after an autosave lands — before
  // React would re-render a new id into this page's callbacks — and a stale
  // `null` there skipped the delete and left an orphan draft in Drafts.
  const pageDraftRef = useRef<ServerDraftRef | null>(null);
  if (!pageDraftRef.current) {
    const ref = new ServerDraftRef();
    if (draftId) ref.adopt(draftId);
    pageDraftRef.current = ref;
  }
  const serverDraftRef = pageDraftRef.current;

  const [draftData, setDraftData] = useState<{
    to?: Array<{ email: string }>;
    subject?: string;
    body?: string;
  } | null>(null);
  const [draftLoading, setDraftLoading] = useState(Boolean(draftId));

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('quant_undo_draft');
      if (saved) {
        sessionStorage.removeItem('quant_undo_draft');
        const parsed = JSON.parse(saved);
        setDraftData({
          to: parsed.toRecipients || (parsed.to ? [{ email: parsed.to }] : []),
          subject: parsed.subject || '',
          body: parsed.body || '',
        });
      }
    } catch {}
  }, []);

  // Persisted-draft attachment restoration: a draft saved with files must
  // reopen WITH those files, not as a bare body. The stored attachments go
  // through the same carryover resolver as forwarded files (inline data
  // URLs, AttachmentService rows, QuantDrive picks — same caps, same
  // never-silent drops), and resolve behind the draft loading gate, so the
  // composer mounts with its files already applied. A file that cannot be
  // restored lands in `draftAttachmentWarnings` and renders persistently
  // in the composer, exactly like a dropped forwarded file.
  const [draftAttachments, setDraftAttachments] = useState<Attachment[] | null>(null);
  const [draftAttachmentWarnings, setDraftAttachmentWarnings] = useState<
    ForwardDroppedAttachment[] | null
  >(null);

  useEffect(() => {
    if (!draftId) return;
    let active = true;
    const controller = new AbortController();
    setDraftLoading(true);
    setDraftAttachments(null);
    setDraftAttachmentWarnings(null);
    const loadDraft = async () => {
      try {
        const response = await apiClient.getEmail(draftId);
        if (!active) return;
        if (response.success && response.data) {
          const storedDraft = response.data as typeof response.data & {
            toAddresses?: string[];
            bodyPlain?: string;
            attachments?: unknown;
          };
          // Adopt the row version the server just reported, so the first
          // autosave is version-guarded — but only if no save has landed
          // since (its fresher version would be regressed by this older read).
          if (
            serverDraftRef.getId() === draftId &&
            serverDraftRef.getExpectedVersion() === undefined
          ) {
            serverDraftRef.adopt(draftId, response.data.version ?? null);
          }
          setDraftData({
            to: storedDraft.to ?? storedDraft.toAddresses?.map((email) => ({ email })),
            subject: storedDraft.subject ?? '',
            // A saved draft's plain-text half ends with the appended signature,
            // behind the RFC 3676 "-- " line. It must not come back into the
            // editable body: the signature is attached from the saved default at
            // send time, so a restored copy would be appended a second time and
            // would freeze whatever the signature said on the day of the draft.
            body: stripTrailingSignature(
              storedDraft.bodyText ?? storedDraft.bodyPlain ?? storedDraft.snippet ?? '',
            ),
          });
          const raw = Array.isArray(storedDraft.attachments)
            ? storedDraft.attachments
            : [];
          if (raw.length > 0) {
            try {
              const { carried, dropped } = await carryForwardAttachments(
                raw,
                (source, signal) => loadAttachmentBytes(source, signal),
                { signal: controller.signal },
              );
              if (!active) return;
              if (carried.length > 0) setDraftAttachments(carried as Attachment[]);
              if (dropped.length > 0) setDraftAttachmentWarnings(dropped);
            } catch {
              // carryForwardAttachments only rejects on abort; per-file
              // failures are drops, never throws. An abort here means the
              // page moved on — the active guard below already covers it.
            }
          }
        }
      } catch {
        // A draft that cannot be loaded honestly opens as fresh compose
        // below (draftLoading clears); the draft load is not a forward load,
        // so the forward error screen does not apply to it.
      } finally {
        if (active) setDraftLoading(false);
      }
    };
    void loadDraft();
    return () => {
      active = false;
      controller.abort();
    };
  }, [draftId]);

  // Reply quote: `?replyTo=<id>` used to open with a blank body — the page
  // fetched nothing, so there was no "On <date>, <who> wrote:" quote. Fetch
  // the original and prefill a Gmail-class quoted body. Explicit `?body=`,
  // a restored draft (undo-draft or `?draftId=`), or a saved server draft
  // always win: the quote is only the fallback when the page has no other
  // body to show.
  //
  // `replyTo` may be a message id (thread view's reply action) or a thread
  // id (the inbox keyboard's reply command passes `focusedRow.threadId`) —
  // try the message endpoint first, then fall back to the thread's latest
  // message. If the original cannot be loaded the composer honestly stays
  // blank; nothing is invented.
  //
  // The composer is held behind the load on purpose: EmailComposer applies a
  // changed `initialBody` to its editable body, so a quote arriving after the
  // user has started typing would silently clobber their words.
  const [quoteBody, setQuoteBody] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(
    () => Boolean(replyTo && !prefillBody && !draftId),
  );

  useEffect(() => {
    if (!replyTo || prefillBody || draftId || draftData?.body) {
      setQuoteLoading(false);
      return;
    }
    let active = true;
    const loadQuote = async () => {
      try {
        const one = await apiClient.getEmail(replyTo);
        if (!active) return;
        if (one.success && one.data) {
          setQuoteBody(buildReplyQuote(one.data));
          return;
        }
        const thread = await apiClient.getThread(replyTo);
        if (!active || !thread.success || !thread.data?.messages?.length) return;
        const latest = [...thread.data.messages].sort(
          (a, b) =>
            new Date(b.receivedAt ?? b.createdAt ?? 0).getTime() -
            new Date(a.receivedAt ?? a.createdAt ?? 0).getTime(),
        )[0];
        if (latest) setQuoteBody(buildReplyQuote(latest));
      } catch {
        // No quote — the composer stays honestly blank.
      } finally {
        if (active) setQuoteLoading(false);
      }
    };
    void loadQuote();
    return () => {
      active = false;
    };
  }, [replyTo, prefillBody, draftId, draftData?.body]);

  // Forward prefill + attachment carryover, as ONE load through the state
  // machine in lib/forward-load.ts (`?forward=<id>`). Every forward entry
  // point (thread view's `f` key, the inbox/people keyboards, the person
  // view) resolves the original — message id first, thread id fallback to
  // its latest message, exactly like the reply loader above — and prefills
  // a Gmail-class forwarded subject + body AND carries the original's
  // attachments into the composer.
  //
  // Precedence, enforced by the machine + render below: a reply
  // (`?replyTo=`) always wins over a forward; a restored draft always wins
  // over a forward (and owns its own attachments, restored above); an
  // explicit `?body=` always wins over the forwarded body — BUT it does
  // not suppress the forwarded subject or the attachments, so a
  // body-only prefill still loads `Fwd: ` + the original's files. An
  // explicit `?subject=` always wins over the forwarded subject (render).
  //
  // Two phases, two different gates — do not collapse them:
  //  * Phase 1 (original): the composer is HELD behind it, for the same
  //    reason as the reply quote — EmailComposer applies a changed
  //    initialBody/initialSubject to its editable fields, so a prefill
  //    arriving after the user started typing would clobber their words.
  //    A FAILED phase 1 renders the honest error screen (denied / deleted
  //    / offline + Retry) instead of any composer: failure-as-success
  //    blank compose is forbidden, nothing is invented, nothing is sent.
  //  * Phase 2 (attachments): the composer IS mounted (subject + body are
  //    final), but Send stays DISABLED until resolution settles — see
  //    `forwardSendDisabledReason`. A send can never go out before the
  //    carryover lands, and dropped files warn persistently instead of
  //    vanishing silently.
  //
  // A->B reset: `start-run` wipes the previous run's subject, body,
  // attachments, warnings and failure before B loads; the effect's abort
  // cancels A's in-flight fetches and byte reads; and the composer below
  // is keyed by forward/draft/reply id, so its apply-once attachment ref
  // resets too. A can never leak into B — not state, not files, not
  // warnings.
  const [forwardState, dispatchForward] = useReducer(
    forwardComposeReducer,
    initialForwardComposeState,
  );
  const [forwardRetryNonce, setForwardRetryNonce] = useState(0);

  useEffect(() => {
    if (!forwardId || replyTo || draftId || draftData) {
      dispatchForward({ type: 'clear' });
      return;
    }
    const controller = new AbortController();
    dispatchForward({ type: 'start-run', runId: forwardId });
    const run = async () => {
      let resolved;
      try {
        resolved = await resolveForwardOriginal(
          {
            getEmail: (id) => apiClient.getEmail(id),
            getThread: (id) => apiClient.getThread(id),
          },
          forwardId,
          controller.signal,
        );
      } catch {
        // resolveForwardOriginal only rejects on abort; anything else here
        // is a superseded run, and the abort guard below drops it.
        return;
      }
      if (controller.signal.aborted) return;
      if (!resolved.ok) {
        dispatchForward({ type: 'original-failed', kind: resolved.kind });
        return;
      }
      const prefill = forwardPrefillFor({
        explicitSubject: prefillSubject,
        explicitBody: prefillBody,
        original: resolved.message,
      });
      const raw = resolved.message.attachments;
      dispatchForward({
        type: 'original-loaded',
        subject: prefill.subject,
        body: prefill.body,
        hasAttachments: raw.length > 0,
      });
      if (raw.length === 0) return;
      try {
        const { carried, dropped } = await carryForwardAttachments(
          raw,
          (source, signal) => loadAttachmentBytes(source, signal),
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        dispatchForward({ type: 'attachments-settled', carried, dropped });
      } catch {
        if (controller.signal.aborted) return;
        // carryForwardAttachments only rejects on abort; a non-abort throw
        // here is unexpected, so settle honestly with the files missing
        // and a warning — never leave Send disabled forever, and never
        // settle silently as if the files had arrived.
        dispatchForward({
          type: 'attachments-settled',
          carried: [],
          dropped: [
            {
              filename: 'Original message',
              reason: 'its attachments could not be read',
            },
          ],
        });
      }
    };
    void run();
    return () => {
      controller.abort();
    };
  }, [
    forwardId,
    replyTo,
    prefillBody,
    prefillSubject,
    draftId,
    draftData,
    forwardRetryNonce,
  ]);

  // `?kind=chat` (from the inbox's "New chat" button) starts a chat thread
  // instead of a letter; the kind travels to the backend compose call and to
  // the composer itself.
  const composeKind: MessageKind = searchParams?.get('kind') === 'chat' ? 'chat' : 'mail';

  const composeDraft = useCallback(
    async (data: ComposerMessageData) => {
      // Compose validation: malformed chips are EXCLUDED from the wire
      // payload — the backend's compose/updateDraft schemas are
      // `z.string().email()`, so shipping one is a guaranteed 400. (The
      // composer already filters before calling onSaveDraft; this is the
      // host-side belt-and-braces so no caller can ship an undeliverable
      // address through this adapter.)
      const toAddresses: import('../../types').EmailAddress[] = filterValidRecipients(
        Array.isArray(data.to)
          ? (data.to as any[]).map((t) =>
              typeof t === 'string' ? { email: t } : { email: t.email || '' },
            )
          : typeof data.to === 'string'
            ? data.to
                .split(/[,;\s]+/)
                .filter(Boolean)
                .map((email) => ({ email }))
            : [],
      );

      const rawCc: import('../../types').EmailAddress[] | undefined = data.cc
        ? typeof data.cc === 'string'
          ? data.cc
              .split(/[,;\s]+/)
              .filter(Boolean)
              .map((email) => ({ email }))
          : Array.isArray(data.cc)
            ? (data.cc as any[]).map((t) =>
                typeof t === 'string' ? { email: t } : { email: t.email || '' },
              )
            : undefined
        : undefined;
      const ccAddresses: import('../../types').EmailAddress[] | undefined = rawCc
        ? filterValidRecipients(rawCc)
        : undefined;

      const rawBcc: import('../../types').EmailAddress[] | undefined = data.bcc
        ? typeof data.bcc === 'string'
          ? data.bcc
              .split(/[,;\s]+/)
              .filter(Boolean)
              .map((email) => ({ email }))
          : Array.isArray(data.bcc)
            ? (data.bcc as any[]).map((t) =>
                typeof t === 'string' ? { email: t } : { email: t.email || '' },
              )
            : undefined
        : undefined;
      const bccAddresses: import('../../types').EmailAddress[] | undefined = rawBcc
        ? filterValidRecipients(rawBcc)
        : undefined;

      // `?kind=chat` travels via composeKind from the page's search params.
      const payload = {
        to: toAddresses,
        cc: ccAddresses,
        bcc: bccAddresses,
        subject:
          data.subject ||
          (composeKind === 'chat' ? `Chat with ${toAddresses.map((t) => t.email).join(', ')}` : ''),
        bodyText: data.bodyText || data.body || '',
        bodyHtml: data.bodyHtml || data.body || '',
        priority: data.priority || 'normal',
        scheduledAt: data.scheduledAt
          ? typeof data.scheduledAt === 'string'
            ? data.scheduledAt
            : new Date(data.scheduledAt).toISOString()
          : undefined,
        inReplyTo: replyTo || undefined,
        attachments: (data.attachments as any) || [],
        isDraft: true,
        // Stated rather than left to the server's default so the thread's mark
        // comes from what the sender actually chose.
        messageKind: composeKind,
      };
      const ref = serverDraftRef;
      const runGuardedSave = () =>
        saveServerDraft({
          ref,
          create: () => apiClient.composeEmail(payload),
          update: (id, expectedVersion) =>
            apiClient.updateDraft(id, payload, { expectedVersion }),
          onConflict: () => {
            showToast({
              text: 'Another tab or device edited this draft too — your latest changes were saved.',
              type: 'warning',
            });
          },
          onDeleted: () => {
            showToast({
              text: 'This draft was deleted elsewhere — saving as a new draft.',
              type: 'warning',
            });
          },
        });
      let saved = await runGuardedSave();
      if (!saved && !ref.getId()) {
        // The draft died server-side (sent or deleted elsewhere): the ref was
        // cleared, so exactly one more attempt honestly mints a single fresh
        // draft instead of failing the save. (A false from a network error or
        // a lost conflict-retry keeps the id, so this never double-mints.)
        saved = await runGuardedSave();
      }
      const id = ref.getId();
      if (!saved || !id) {
        throw new Error('Draft could not be saved.');
      }
      return { id };
    },
    [replyTo, searchParams],
  );

  const handleSend = useCallback(
    async (data: ComposerMessageData) => {
      const draft = await composeDraft(data);

      // QM-UIUX-050: a scheduled send must actually queue the draft for
      // delivery — the backend expects `sendAt` (its compose schema silently
      // strips `scheduledAt`). Previously this returned early and the draft
      // sat in Drafts forever while the UI claimed "Email scheduled".
      if (data.scheduledAt) {
        const scheduledAt =
          typeof data.scheduledAt === 'string'
            ? data.scheduledAt
            : new Date(data.scheduledAt).toISOString();
        const schedRes = await apiClient.sendEmail(draft.id, { sendAt: scheduledAt });
        if (!schedRes.success) {
          throw new Error(schedRes.error?.message || 'Email could not be scheduled.');
        }
        return;
      }

      const response = await apiClient.sendEmail(draft.id, { delayMs: 10000 });
      if (!response.success) {
        throw new Error(response.error?.message || 'Message could not be sent.');
      }

      // Before the redirect, not after: `/` renders from the React Query cache, so
      // a list left marked fresh would paint without the message that was just sent.
      invalidateMailLists(queryClient);

      // QM-UIUX-025: this toast lives for exactly the 10s recall window
      // (`delayMs: 10000` above) — the message has NOT been sent yet while
      // it is on screen, so it must not claim "Message sent". Say what is
      // true: it is sending, and there are 10s to undo.
      //
      // The recall window closing is NOT delivery confirmation — it is only
      // the moment the send becomes un-undoable and the worker STARTS
      // transmitting (the server enqueues a BullMQ job with the same 10s
      // delay and answers 202 "Email queued for delivery"; SES can still
      // fail afterwards). So the second toast must never claim "Email
      // sent" either — that would be a timer guess with zero knowledge of
      // the delivery outcome. Say what is true instead: the send is
      // confirmed and delivery is underway — unless the user undid the
      // send, in which case the undo toast has already said what happened.
      let sendUndone = false;
      showToast({
        text: 'Sending… (10s to undo)',
        type: 'success',
        duration: 10000,
        countdown: 10,
        undoAction: async () => {
          sendUndone = true;
          try {
            const undoRes = await apiClient.undoSend(draft.id);
            if (undoRes.success) {
              showToast({ text: 'Sending undone. Message restored to Drafts.', type: 'info' });
              invalidateMailLists(queryClient);
            } else {
              showToast({
                text: undoRes.error?.message || 'Could not undo send.',
                type: 'warning',
              });
            }
          } catch {
            showToast({ text: 'Could not undo send.', type: 'error' });
          }
        },
      });
      window.setTimeout(() => {
        if (!sendUndone) {
          // Honest copy: at t=10s the undo window closes and transmission
          // starts — delivery itself is still unconfirmed (see above), so
          // never claim "Email sent" on this timer.
          showToast({ text: 'Send confirmed — delivering', type: 'success' });
        }
      }, 10000);
      router.push('/');
    },
    [composeDraft, queryClient, router],
  );

  const handleSaveDraft = useCallback(
    async (data: ComposerMessageData) => {
      await composeDraft(data);
    },
    [composeDraft],
  );

  const handleDiscard = useCallback(async () => {
    // Delete the saved server draft (if any) so "Discard" actually discards.
    const savedId = serverDraftRef.getId();
    if (savedId) {
      try {
        await apiClient.deleteEmail(savedId);
      } catch {
        // Best-effort: still navigate away even if the delete fails.
      }
      serverDraftRef.clear();
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  }, [router]);

  // No page-level edge swipe: it used to call handleDiscard, so a stray swipe
  // from the left edge DELETED the draft with no prompt. The composer owns the
  // gesture now and treats it as Back — save the draft, then leave.

  const handleAIAssist = useCallback(
    async (action: 'compose' | 'improve' | 'shorten' | 'formalize', text: string) => {
      const response = await apiClient.aiCompose({
        instructions: `${action}: ${text}`,
        tone: action === 'formalize' ? 'formal' : 'professional',
        length: action === 'shorten' ? 'short' : 'medium',
      });

      if (!response.success) {
        throw new Error(response.error?.message || 'AI writing assistance is unavailable.');
      }

      return response.data?.body || text;
    },
    [],
  );

  if (draftLoading || quoteLoading || forwardState.phase === 'loading-original') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--quant-surface-subtle)] text-[var(--quant-muted-foreground)] text-sm">
        <p>
          {draftLoading
            ? 'Loading draft…'
            : quoteLoading
              ? 'Loading quoted message…'
              : 'Loading forwarded message…'}
        </p>
      </div>
    );
  }

  // Honest forward failure: the original could not be loaded, so there is
  // NO composer here — a blank composer would be failure-as-success, and
  // anything typed into it would send without the forwarded original.
  // Retry re-runs the load; Back leaves without sending anything.
  if (forwardState.phase === 'failed' && forwardState.failureKind) {
    const copy = FORWARD_LOAD_FAILURE_COPY[forwardState.failureKind];
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--quant-surface-subtle)] px-6">
        <div className="w-full max-w-[480px] text-center">
          <h1 className="text-base font-semibold text-[var(--quant-foreground)]">
            {copy.title}
          </h1>
          <p className="mt-2 text-sm text-[var(--quant-muted-foreground)]">{copy.body}</p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setForwardRetryNonce((n) => n + 1)}
              className="rounded-xl bg-[var(--quant-primary)] px-4 py-2 min-h-[44px] text-sm font-semibold text-[#111111]"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => router.push('/')}
              className="rounded-xl border border-[var(--quant-surface-elevated)] px-4 py-2 min-h-[44px] text-sm text-[var(--quant-muted-foreground)]"
            >
              Back to inbox
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Carried + restored attachments, and the files that could not ride along.
  // A forward run and a draft restore never coexist (a draft clears the
  // forward run), so the forward list wins when present, else the draft's.
  const attachmentWarnings = [
    ...forwardState.warnings,
    ...(draftAttachmentWarnings ?? []),
  ];

  return (
    <UndoSendProvider>
      <div className="h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-[var(--quant-surface-subtle)] flex justify-center">
        <div className="w-full max-w-[880px] h-full">
        <EmailComposer
          // Keyed per compose session: navigating forward A -> forward B
          // (or draft A -> draft B) remounts the composer, so B starts
          // with no trace of A — typed text, attachments, and the
          // apply-once carryover ref all reset with the run.
          key={forwardId ?? draftId ?? replyTo ?? 'compose'}
          // Handed over as the raw string, not wrapped in a one-entry array: `?to=`
          // can carry a whole group's members, and the composer is the thing that
          // knows how to cut a list of addresses into one chip each.
          initialTo={draftData?.to ?? prefillTo ?? undefined}
          initialSubject={
            draftData?.subject ??
            (prefillSubject
              ? normalizeReplySubject(prefillSubject)
              : (forwardState.subject ?? ''))
          }
          // `initialBody` precedence: a restored draft (undo-draft or
          // `?draftId=`) wins, then an explicit `?body=`, then the fetched
          // reply quote, then the fetched forwarded original. An empty
          // explicit body counts as absent (falsy check, matching the
          // load effects): `?body=` with nothing in it must not blank
          // out the forwarded quote. A failed forward load never reaches
          // here — it renders the error screen above instead.
          initialBody={
            draftData?.body ??
            (prefillBody || (quoteBody ?? forwardState.body ?? undefined))
          }
          // Forwarded + restored attachments (null until resolved, or when
          // the original/draft had none) — the composer appends them
          // exactly once. Warnings render persistently inside the composer
          // body. Send stays disabled while forward attachments resolve.
          initialAttachments={
            forwardState.attachments ?? draftAttachments ?? undefined
          }
          initialAttachmentWarnings={
            attachmentWarnings.length > 0 ? attachmentWarnings : undefined
          }
          sendDisabledReason={forwardSendDisabledReason(forwardState)}
          inReplyTo={replyTo || undefined}
          onSend={handleSend}
          onSaveDraft={handleSaveDraft}
          onDiscard={handleDiscard}
          onAIAssist={handleAIAssist}
          initialMessageKind={composeKind}
        />
        </div>
      </div>
    </UndoSendProvider>
  );
}
