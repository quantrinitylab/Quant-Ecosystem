// @vitest-environment jsdom
// ============================================================================
// QuantyCopilotDrawer send honesty P1: onSendNow must REJECT on failure.
//
// Before the fix, the drawer's onSendNow wrapped compose+send in a try/catch
// that swallowed EVERYTHING, so the promise always resolved. The undo-send
// manager then ran markSent and the bar celebrated "Message sent!" WHILE the
// drawer itself showed an "Email nahi bheja ja saka" error — the false
// success bar for a failed send. This violated the QueueSendOptions.onSendNow
// contract ("MUST resolve only after the send truly completed").
//
// These tests pin the extracted builder (buildQuantyDraftSendNow) used by
// confirmSendDraft:
//   (a) compose+send succeed -> resolves; exactly one honest success surface
//       (assistant note + toast); onSettled runs.
//   (b) send fails -> REJECTS (no swallow); the drawer's own failure surface
//       (error toast + assistant note) still fires; onSettled still runs.
//   (c) compose fails -> REJECTS with the server's message.
//   (d) compose throws (network) -> REJECTS with the thrown error.
//   (e) send-state copy follows the app locale (English default, Devanagari
//       for 'hi') — no Roman-script Hinglish for every user (PR #868
//       convention).
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildQuantyDraftSendNow,
  quantyConfirmCardCopy,
  quantyDraftSendCopy,
  isUnknownSendOutcome,
  newQuantySendKey,
  type QuantyDraftSendDeps,
  type QuantyDraftSendTaskState,
} from '../QuantyCopilotDrawer';

// qm-auto finding: the copilot's send path had no schedule-send at all.
const FUTURE_ISO = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();

function makeDeps(overrides: Partial<QuantyDraftSendDeps> = {}): QuantyDraftSendDeps & {
  notes: string[];
  toasts: Array<{ text: string; type: 'success' | 'error' }>;
  settled: boolean;
  settledOk: boolean | null;
  taskState: QuantyDraftSendTaskState;
} {
  const notes: string[] = [];
  const toasts: Array<{ text: string; type: 'success' | 'error' }> = [];
  let settled = false;
  let settledOk: boolean | null = null;
  // One task record per makeDeps — shared across buildQuantyDraftSendNow
  // invocations in a test, exactly like the drawer's per-card record, so
  // retry tests exercise the real reconcile path.
  const taskState: QuantyDraftSendTaskState = {};
  return {
    to: 'friend@example.com',
    subject: 'Hello',
    body: 'Hi there',
    copy: quantyDraftSendCopy('en'),
    composeEmail: async () => ({ success: true, data: { id: 'email-1' } }),
    sendEmail: async () => ({ success: true }),
    taskState,
    newSendKey: () => 'key-1',
    appendAssistantNote: (text: string) => {
      notes.push(text);
    },
    showToast: (toast: { text: string; type: 'success' | 'error' }) => {
      toasts.push(toast);
    },
    onSettled: ({ ok }: { ok: boolean }) => {
      settled = true;
      settledOk = ok;
    },
    notes,
    toasts,
    get settled() {
      return settled;
    },
    get settledOk() {
      return settledOk;
    },
    taskState,
    ...overrides,
  };
}

describe('buildQuantyDraftSendNow: the onSendNow contract', () => {
  it('resolves after a truly completed send, with exactly one success surface', async () => {
    const deps = makeDeps();
    await buildQuantyDraftSendNow(deps)();
    expect(deps.settled).toBe(true);
    expect(deps.settledOk).toBe(true);
    expect(deps.notes).toHaveLength(1);
    expect(deps.notes[0]).toMatch(/friend@example\.com/);
    // 202/queued != delivered: the default mock returns no deliveryStatus,
    // so the honest surface is "queued for delivery", never "delivered".
    expect(deps.notes[0]).toMatch(/queued for delivery/);
    expect(deps.notes[0]).not.toMatch(/delivered/);
    expect(deps.toasts).toEqual([{ text: 'Email queued — will deliver to friend@example.com', type: 'success' }]);
    // The task record holds the reconcile handles for any later retry.
    expect(deps.taskState.composedEmailId).toBe('email-1');
    expect(deps.taskState.sendKey).toBe('key-1');
  });

  it('claims "delivered" only when deliveryStatus is literally delivered', async () => {
    const deps = makeDeps({
      sendEmail: async () => ({
        success: true,
        data: { deliveryStatus: 'delivered', emailId: 'email-1' },
      }),
    });
    await buildQuantyDraftSendNow(deps)();
    expect(deps.settledOk).toBe(true);
    expect(deps.notes[0]).toMatch(/Sent — email delivered to friend@example\.com/);
    expect(deps.toasts).toEqual([{ text: 'Email sent to friend@example.com', type: 'success' }]);
  });

  it('maps a 202/queued deliveryStatus to the honest accepted copy', async () => {
    const deps = makeDeps({
      sendEmail: async () => ({
        success: true,
        data: { deliveryStatus: 'queued', emailId: 'email-1' },
      }),
    });
    await buildQuantyDraftSendNow(deps)();
    expect(deps.settledOk).toBe(true);
    expect(deps.notes[0]).toMatch(/queued for delivery/);
    expect(deps.notes[0]).not.toMatch(/delivered/);
  });

  it('REJECTS when the send fails — no swallow, failure surface still honest', async () => {
    const deps = makeDeps({
      sendEmail: async () => ({ success: false, error: { message: 'SMTP down' } }),
    });
    // The core regression: this used to resolve, letting the undo-send bar
    // claim "Message sent!" for a send that never happened.
    await expect(buildQuantyDraftSendNow(deps)()).rejects.toThrow('SMTP down');
    expect(deps.settled).toBe(true);
    expect(deps.settledOk).toBe(false);
    // Exactly one honest failure surface: the drawer's own note + error toast.
    expect(deps.notes).toHaveLength(1);
    expect(deps.notes[0]).toMatch(/SMTP down/);
    expect(deps.notes[0]).toMatch(/Nothing was sent/);
    expect(deps.toasts).toHaveLength(1);
    expect(deps.toasts[0].type).toBe('error');
    // Authoritative 4xx-style rejection (no code/status): the send never ran,
    // so the next attempt is a genuinely new operation — identities reset.
    expect(deps.taskState.composedEmailId).toBeUndefined();
    expect(deps.taskState.sendKey).toBeUndefined();
  });

  it('REJECTS with the default copy when the send fails without a server message', async () => {
    const deps = makeDeps({ sendEmail: async () => ({ success: false }) });
    await expect(buildQuantyDraftSendNow(deps)()).rejects.toThrow(
      deps.copy.sendFailed,
    );
    expect(deps.toasts[0].type).toBe('error');
  });

  it('REJECTS when compose fails', async () => {
    const deps = makeDeps({
      composeEmail: async () => ({ success: false, error: { message: 'draft boom' } }),
    });
    await expect(buildQuantyDraftSendNow(deps)()).rejects.toThrow('draft boom');
    expect(deps.notes[0]).toMatch(/draft boom/);
    expect(deps.toasts[0].type).toBe('error');
    expect(deps.settled).toBe(true);
  });

  it('REJECTS when compose throws (network failure)', async () => {
    const deps = makeDeps({
      composeEmail: async () => {
        throw new Error('network unreachable');
      },
    });
    await expect(buildQuantyDraftSendNow(deps)()).rejects.toThrow('network unreachable');
    expect(deps.settled).toBe(true);
  });
});

describe('buildQuantyDraftSendNow: schedule-send via the one sendAt contract', () => {
  it('scheduled: carries scheduledAt + the durable send key into sendEmail, with honest scheduled copy', async () => {
    const sendMock = vi.fn(async () => ({ success: true }));
    const deps = makeDeps({ sendEmail: sendMock, scheduledAt: FUTURE_ISO });
    await buildQuantyDraftSendNow(deps)();
    expect(deps.settled).toBe(true);
    expect(deps.settledOk).toBe(true);
    // The one sendAt contract: POST /emails/:id/send `{ sendAt }`, plus the
    // task's durable idempotencyKey (minted once, sent verbatim) so a retry
    // reconciles the original schedule instead of creating a second one.
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith('email-1', { sendAt: FUTURE_ISO, idempotencyKey: 'key-1' });
    // Exactly one honest success surface — "scheduled", never "sent".
    expect(deps.notes).toHaveLength(1);
    expect(deps.notes[0]).toMatch(/Scheduled/);
    expect(deps.notes[0]).not.toMatch(/delivered/i);
    expect(deps.toasts).toEqual([
      { text: 'Email scheduled — will send to friend@example.com', type: 'success' },
    ]);
  });

  it('immediate: sendEmail always carries the durable idempotencyKey (the reconcile handle)', async () => {
    const sendMock = vi.fn(async () => ({ success: true }));
    const deps = makeDeps({ sendEmail: sendMock });
    await buildQuantyDraftSendNow(deps)();
    expect(sendMock).toHaveBeenCalledTimes(1);
    // Deliberately NOT a bare one-arg call anymore: the key must travel on
    // every attempt or a retry after a lost response mints a new operation.
    expect(sendMock).toHaveBeenCalledWith('email-1', { idempotencyKey: 'key-1' });
    expect(deps.notes[0]).toMatch(/queued for delivery/);
    expect(deps.toasts).toEqual([
      { text: 'Email queued — will deliver to friend@example.com', type: 'success' },
    ]);
  });

  it('scheduled: REJECTS when the scheduled send fails — failure surface still honest', async () => {
    const deps = makeDeps({
      sendEmail: async () => ({ success: false, error: { message: 'scheduler full' } }),
      scheduledAt: FUTURE_ISO,
    });
    await expect(buildQuantyDraftSendNow(deps)()).rejects.toThrow('scheduler full');
    expect(deps.settled).toBe(true);
    // The schedule was never created — "Nothing was sent" stays honest.
    expect(deps.notes).toHaveLength(1);
    expect(deps.notes[0]).toMatch(/Nothing was sent/);
    expect(deps.toasts[0].type).toBe('error');
  });
});

describe('buildQuantyDraftSendNow: response-loss / retry reconcile (the finding)', () => {
  // The previous harness asserted the compose+send contract but never the
  // response-loss case: a send whose response never arrived was labeled
  // "Nothing was sent", the composed ID was discarded, and the retry
  // recomposed a fresh email with a fresh send key — two accepted sends for
  // one user intent. These tests pin the reconcile contract instead.

  it('a thrown send (network loss) REJECTS with the unknown-outcome copy — never "Nothing was sent"', async () => {
    const deps = makeDeps({
      sendEmail: async () => {
        throw new Error('socket hang up');
      },
    });
    await expect(buildQuantyDraftSendNow(deps)()).rejects.toThrow('socket hang up');
    expect(deps.settled).toBe(true);
    expect(deps.settledOk).toBe(false);
    expect(deps.notes).toHaveLength(1);
    expect(deps.notes[0]).toMatch(/outcome uncertain/i);
    expect(deps.notes[0]).not.toMatch(/Nothing was sent/);
    expect(deps.toasts).toEqual([{ text: deps.copy.unknownOutcomeToast, type: 'error' }]);
    // Identities are KEPT for the reconcile retry.
    expect(deps.taskState.composedEmailId).toBe('email-1');
    expect(deps.taskState.sendKey).toBe('key-1');
  });

  it('retry after a lost response reuses the composed ID + send key — compose runs once', async () => {
    const composeMock = vi.fn(async () => ({ success: true, data: { id: 'email-1' } }));
    const sendMock = vi
      .fn()
      // First attempt: the response never arrives (server may have committed).
      .mockRejectedValueOnce(new Error('timeout of 30000ms exceeded'))
      // Retry: the server replays the original receipt for the same key.
      .mockResolvedValueOnce({
        success: true,
        data: { deliveryStatus: 'queued', emailId: 'email-1' },
      });
    const deps = makeDeps({ composeEmail: composeMock, sendEmail: sendMock });
    await expect(buildQuantyDraftSendNow(deps)()).rejects.toThrow();
    expect(deps.taskState.composedEmailId).toBe('email-1');
    // The retry is a fresh invocation sharing the task's record — exactly
    // what the drawer does when the user taps Send again on the kept card.
    await buildQuantyDraftSendNow(deps)();
    expect(composeMock).toHaveBeenCalledTimes(1); // no blind recompose
    expect(sendMock).toHaveBeenCalledTimes(2);
    // Both attempts hit the SAME draft with the SAME durable key.
    expect(sendMock.mock.calls[1]).toEqual(['email-1', { idempotencyKey: 'key-1' }]);
    expect(deps.settledOk).toBe(true);
    expect(deps.notes[1]).toMatch(/queued for delivery/);
  });

  it('TIMEOUT / NETWORK_ERROR / PARSE_ERROR codes are unknown-outcome, never "Nothing was sent"', async () => {
    for (const code of ['TIMEOUT', 'NETWORK_ERROR', 'PARSE_ERROR']) {
      const deps = makeDeps({
        sendEmail: async () => ({
          success: false,
          error: { code, message: 'boom', statusCode: 0 },
        }),
      });
      await expect(buildQuantyDraftSendNow(deps)()).rejects.toThrow('boom');
      expect(deps.notes[0]).toMatch(/outcome uncertain/i);
      expect(deps.notes[0]).not.toMatch(/Nothing was sent/);
      expect(deps.taskState.composedEmailId).toBe('email-1');
      expect(deps.taskState.sendKey).toBe('key-1');
    }
  });

  it('a 5xx is unknown-outcome (may have committed before the gateway timed out)', async () => {
    const deps = makeDeps({
      sendEmail: async () => ({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'bad gateway', statusCode: 502 },
      }),
    });
    await expect(buildQuantyDraftSendNow(deps)()).rejects.toThrow('bad gateway');
    expect(deps.notes[0]).toMatch(/outcome uncertain/i);
    expect(deps.notes[0]).not.toMatch(/Nothing was sent/);
    expect(deps.taskState.composedEmailId).toBe('email-1');
  });

  it('409 IDEMPOTENCY_IN_FLIGHT is unknown-outcome (the operation is still unanswered)', async () => {
    const deps = makeDeps({
      sendEmail: async () => ({
        success: false,
        error: { code: 'IDEMPOTENCY_IN_FLIGHT', message: 'in flight', statusCode: 409 },
      }),
    });
    await expect(buildQuantyDraftSendNow(deps)()).rejects.toThrow('in flight');
    expect(deps.notes[0]).toMatch(/outcome uncertain/i);
    expect(deps.taskState.sendKey).toBe('key-1');
  });

  it('409 EMAIL_NOT_SENDABLE resolves as already-sent (the earlier attempt went through)', async () => {
    const deps = makeDeps({
      sendEmail: async () => ({
        success: false,
        error: {
          code: 'EMAIL_NOT_SENDABLE',
          message: 'Only an unsent draft can be sent',
          statusCode: 409,
        },
      }),
    });
    await buildQuantyDraftSendNow(deps)();
    expect(deps.settledOk).toBe(true);
    expect(deps.notes[0]).toMatch(/Already sent/);
    expect(deps.toasts[0].type).toBe('success');
  });

  it('scheduled retry reuses the same composed ID + key with the same sendAt', async () => {
    const composeMock = vi.fn(async () => ({ success: true, data: { id: 'email-9' } }));
    const sendMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        success: true,
        data: { deliveryStatus: 'queued', emailId: 'email-9' },
      });
    const deps = makeDeps({
      composeEmail: composeMock,
      sendEmail: sendMock,
      scheduledAt: FUTURE_ISO,
    });
    await expect(buildQuantyDraftSendNow(deps)()).rejects.toThrow();
    await buildQuantyDraftSendNow(deps)();
    expect(composeMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(sendMock.mock.calls[1]).toEqual([
      'email-9',
      { sendAt: FUTURE_ISO, idempotencyKey: 'key-1' },
    ]);
    expect(deps.notes[1]).toMatch(/Scheduled/);
  });
});

describe('isUnknownSendOutcome', () => {
  it('flags transport unknowns', () => {
    expect(isUnknownSendOutcome({ code: 'TIMEOUT' })).toBe(true);
    expect(isUnknownSendOutcome({ code: 'NETWORK_ERROR' })).toBe(true);
    expect(isUnknownSendOutcome({ code: 'PARSE_ERROR' })).toBe(true);
    expect(isUnknownSendOutcome({ statusCode: 0 })).toBe(true);
    expect(isUnknownSendOutcome({ statusCode: 502 })).toBe(true);
    expect(isUnknownSendOutcome({ statusCode: 409 })).toBe(true);
  });

  it('does not flag authoritative rejections or empty errors', () => {
    expect(isUnknownSendOutcome({ code: 'VALIDATION_ERROR', statusCode: 400 })).toBe(false);
    expect(isUnknownSendOutcome({ message: 'SMTP down' })).toBe(false);
    expect(isUnknownSendOutcome(null)).toBe(false);
    expect(isUnknownSendOutcome(undefined)).toBe(false);
  });
});

describe('newQuantySendKey', () => {
  it('mints a non-empty unique key per call', () => {
    const a = newQuantySendKey();
    const b = newQuantySendKey();
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });
});

describe('QuantyCopilotDrawer schedule-send wiring (source pins)', () => {
  // These fail on the pre-fix code, which had no modal import, no schedule
  // button, and no sendAt/successLabel wiring anywhere on this path.
  const drawerSource = readFileSync(
    join(import.meta.dirname, '../QuantyCopilotDrawer.tsx'),
    'utf8',
  );

  it('imports the same ScheduleSendModal + isPastScheduleTime the other compose surfaces use', () => {
    expect(drawerSource).toMatch(
      /import\s*\{\s*ScheduleSendModal,\s*isPastScheduleTime\s*\}\s*from\s*['"]\.\/ScheduleSendModal['"]/,
    );
  });

  it('the confirmation card has a schedule button that opens the modal', () => {
    expect(drawerSource).toContain('data-testid="quanty-draft-schedule-button"');
    expect(drawerSource).toContain('aria-label="Schedule send"');
    expect(drawerSource).toMatch(/onClick=\{\(\)\s*=>\s*setShowScheduleModal\(true\)\}/);
  });

  it('the modal hands its pick back to the confirmation gate', () => {
    expect(drawerSource).toMatch(
      /onSchedule=\{\(at\)\s*=>\s*\{\s*setShowScheduleModal\(false\);\s*confirmSendDraft\(at\);/,
    );
  });

  it('confirmSendDraft carries scheduledAt + honest successLabel into the undo-send queue', () => {
    expect(drawerSource).toContain('scheduledAt,');
    expect(drawerSource).toContain("successLabel: scheduledAt ? 'Email scheduled!' : undefined");
    // The send always carries the task's durable idempotencyKey (the retry
    // reconcile handle) alongside sendAt.
    expect(drawerSource).toContain('idempotencyKey: taskState.sendKey');
  });

  it('a failed attempt keeps the confirmation card AND the task state (no blind recompose)', () => {
    // onSettled clears the card only on ok — on failure the card stays so
    // Send retries the same composed draft with the same send key.
    expect(drawerSource).toMatch(/onSettled:\s*\(\{\s*ok\s*\}\)\s*=>\s*\{/);
    expect(drawerSource).toMatch(/if\s*\(ok\)\s*\{[\s\S]*?setPendingEmailDraft\(null\)/);
  });

  it('a past scheduledAt is rejected before anything is queued (belt-and-braces, PR #908 convention)', () => {
    expect(drawerSource).toMatch(
      /if\s*\(scheduledAt\s*&&\s*isPastScheduleTime\(new Date\(scheduledAt\)\)\)/,
    );
  });

  it('the primary Send button never passes its click event as the scheduledAt arg', () => {
    expect(drawerSource).toContain('onClick={() => confirmSendDraft()}');
    expect(drawerSource).not.toContain('onClick={confirmSendDraft}');
  });
});

describe('quantyDraftSendCopy: locale-following send-state copy', () => {
  it('English default has no Hinglish/Roman-script Hindi', () => {
    const copy = quantyDraftSendCopy('en');
    const all = [
      copy.composeFailed,
      copy.sendFailed,
      copy.sentNote('a@b.c'),
      copy.acceptedNote('a@b.c'),
      copy.acceptedToast('a@b.c'),
      copy.unknownOutcomeNote('x'),
      copy.unknownOutcomeToast,
      copy.alreadySentNote('a@b.c'),
      copy.alreadySentToast('a@b.c'),
      copy.failedNote('x'),
      copy.sendFailedToast,
      copy.scheduledNote('a@b.c'),
      copy.scheduledToast('a@b.c'),
    ].join(' ');
    expect(all).not.toMatch(/nahi|payi|saka|Bhej|kuch|dobara|karein/i);
    expect(copy.sendFailedToast).toBe('Email could not be sent');
  });

  it('Hindi locale uses Devanagari (no Roman Hinglish)', () => {
    const copy = quantyDraftSendCopy('hi');
    expect(copy.composeFailed).toBe('ड्राफ्ट नहीं बन पाया');
    expect(copy.sendFailed).toBe('भेजा नहीं जा सका');
    expect(copy.sendFailedToast).toBe('ईमेल नहीं भेजा जा सका');
    expect(copy.sentNote('a@b.c')).toMatch(/भेज दिया/);
    expect(copy.failedNote('x')).toMatch(/भेजने में दिक्कत हुई/);
    expect(copy.scheduledNote('a@b.c')).toMatch(/शेड्यूल कर दिया/);
    expect(copy.scheduledToast('a@b.c')).toMatch(/शेड्यूल हो गया/);
    expect(copy.acceptedNote('a@b.c')).toMatch(/कतार/);
    expect(copy.unknownOutcomeNote('x')).toMatch(/नतीजा पक्का नहीं/);
    expect(copy.unknownOutcomeToast).toMatch(/नतीजा पक्का नहीं/);
    expect(copy.alreadySentNote('a@b.c')).toMatch(/पहले ही भेजा/);
  });

  it('cancel/undo assistant notes follow the locale too (same send-state surface)', () => {
    const en = quantyDraftSendCopy('en');
    expect(en.sendCancelledNote).toBe('Send cancelled — nothing was sent.');
    expect(en.draftCancelledNote).toBe('Draft discarded — nothing was sent.');
    expect(`${en.sendCancelledNote} ${en.draftCancelledNote}`).not.toMatch(
      /kar diya|kuch nahi|bheja/i,
    );
    const hi = quantyDraftSendCopy('hi');
    expect(hi.sendCancelledNote).toBe('भेजना रद्द कर दिया — कुछ नहीं भेजा गया।');
    expect(hi.draftCancelledNote).toBe('ड्राफ्ट रद्द कर दिया — कुछ नहीं भेजा गया।');
  });

  it('scheduled copy is honest: "scheduled", never "sent"/"delivered"', () => {
    const copy = quantyDraftSendCopy('en');
    expect(copy.scheduledNote('a@b.c')).toMatch(/Scheduled/);
    expect(copy.scheduledNote('a@b.c')).not.toMatch(/delivered/i);
    expect(copy.scheduledToast('a@b.c')).toMatch(/Email scheduled/);
  });

  it('accepted copy is honest: "queued for delivery", never "delivered"', () => {
    const copy = quantyDraftSendCopy('en');
    expect(copy.acceptedNote('a@b.c')).toMatch(/queued for delivery/);
    expect(copy.acceptedNote('a@b.c')).not.toMatch(/delivered/);
    expect(copy.acceptedToast('a@b.c')).toMatch(/queued/i);
    expect(copy.acceptedToast('a@b.c')).not.toMatch(/delivered/i);
  });

  it('unknown-outcome copy never claims "Nothing was sent"', () => {
    const copy = quantyDraftSendCopy('en');
    expect(copy.unknownOutcomeNote('x')).not.toMatch(/Nothing was sent/);
    expect(copy.unknownOutcomeNote('x')).toMatch(/uncertain/i);
  });
});

describe('quantyConfirmCardCopy: locale-following confirmation-card copy', () => {
  // qm-auto findings-queue P2: the send-confirmation card hardcoded Roman
  // Hinglish ("Email bhejne se pehle confirm karein" aria-label, "Bhejne se
  // pehle dekhein" heading, "Bheja ja raha…" button) mixed with the English
  // "Send" label. Every string now flows through this copy map — English
  // default, Devanagari for 'hi' (PR #868 convention).
  it('English default has no Hinglish/Roman-script Hindi', () => {
    const copy = quantyConfirmCardCopy('en');
    const all = [
      copy.groupAriaLabel,
      copy.heading,
      copy.unknownRecipient,
      copy.noSubject,
      copy.emptyBody,
      copy.invalidRecipientAlert,
      copy.sendIdle,
      copy.sendBusy,
    ].join(' ');
    expect(all).not.toMatch(/bhej|khaali|pata|karein|dobara|nahi|dekhein/i);
    expect(copy.groupAriaLabel).toBe('Confirm before sending the email');
    expect(copy.sendIdle).toBe('Send');
    expect(copy.sendBusy).toBe('Sending…');
  });

  it('Hindi locale uses Devanagari (no Roman Hinglish)', () => {
    const copy = quantyConfirmCardCopy('hi');
    expect(copy.groupAriaLabel).toBe('ईमेल भेजने से पहले पुष्टि करें');
    expect(copy.heading).toBe('भेजने से पहले देखें');
    expect(copy.sendIdle).toBe('भेजें');
    expect(copy.sendBusy).toBe('भेजा जा रहा…');
    expect(copy.invalidRecipientAlert).toMatch(/Quanty/);
  });

  it('the card JSX wires cardCopy — no hardcoded aria-label or button strings', () => {
    const drawerSource = readFileSync(
      join(import.meta.dirname, '../QuantyCopilotDrawer.tsx'),
      'utf8',
    );
    expect(drawerSource).not.toContain('Email bhejne se pehle confirm karein');
    expect(drawerSource).not.toContain('Bhejne se pehle dekhein');
    expect(drawerSource).not.toContain("'Bheja ja raha…'");
    expect(drawerSource).not.toContain('(pata nahi)');
    expect(drawerSource).not.toContain('(koi subject nahi)');
    expect(drawerSource).not.toContain('(khaali body)');
    expect(drawerSource).toContain('aria-label={cardCopy.groupAriaLabel}');
    expect(drawerSource).toContain('{draftSending ? cardCopy.sendBusy : cardCopy.sendIdle}');
  });
});
