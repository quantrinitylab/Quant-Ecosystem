// ============================================================================
// Quick group-chat deck undo-send — regression tests for the P1 false-success
// finding (2026-10-18).
//
// Before this fix, the WhatsApp-style quick group-chat deck on the main page
// fired `composeEmail` + `sendEmail` the instant Send was pressed, never read
// the `sendEmail` result, and toasted "Message sent" unconditionally — a
// failed send still celebrated (false-success class) — while bypassing the
// undo-send queue entirely, so an accidental tap delivered with zero recall.
// Every other compose surface (EmailComposer, DockedComposer, ThreadComposer,
// quick reply, copilot drawer) gets the shared 10-second window.
//
// The fix extracts the deck into `QuickGroupChatDeck` and routes its send
// through `queueSend`: the API call lives in `onSendNow` and runs only when
// the recall window closes; `onSendNow` REJECTS on any failure (compose or
// send) so the countdown bar can never claim "sent" for a message that never
// went out; Undo (or a failed send) reopens the deck with the words intact.
//
// Two layers, following this repo's established test conventions:
//  1. Behavioural: the REAL UndoSendManager driven exactly as the fixed deck
//     drives it (same queueSend shape — deferred send spy, failure spy,
//     restore spy) under fake timers, as in undo-send-bar.test.tsx.
//  2. Wiring pins: readFileSync source assertions on the real deck component,
//     as in the other QM-UIUX honesty suites — these are what fail on the
//     pre-fix code, where the deck fired the API directly and toasted
//     success unconditionally.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  UndoSendManager,
  UNDO_SEND_COUNTDOWN_SEC,
} from '../components/UndoSendCountdownBar';

const deckSource = readFileSync(
  fileURLToPath(new URL('../components/QuickGroupChatDeck.tsx', import.meta.url)),
  'utf8',
);
const pageSource = readFileSync(
  fileURLToPath(new URL('../app/page.tsx', import.meta.url)),
  'utf8',
);

describe('quick group-chat deck — send behaviour through the shared undo queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('(a) queueing a group message enters the undo window — the send is NOT fired on submit', () => {
    const manager = new UndoSendManager();
    const performSend = vi.fn(async () => {});
    const handleSendFailed = vi.fn();
    const restoreDeck = vi.fn();

    // Exactly the call QuickGroupChatDeck.handleSubmit makes on Send.
    manager.queueSend({
      to: 'Family',
      subject: '[Group] Family',
      body: 'Dinner at 8?',
      onSendNow: performSend,
      onSendFailed: handleSendFailed,
      onUndo: restoreDeck,
    });

    const state = manager.getState();
    expect(state.status).toBe('counting');
    expect(state.remainingSeconds).toBe(UNDO_SEND_COUNTDOWN_SEC);
    expect(state.pendingItem?.to).toBe('Family');
    expect(performSend).not.toHaveBeenCalled();
    expect(restoreDeck).not.toHaveBeenCalled();
    expect(handleSendFailed).not.toHaveBeenCalled();

    // 9.9s in, the send still has not fired — the accidental tap has a way back.
    vi.advanceTimersByTime(9900);
    expect(manager.getState().status).toBe('counting');
    expect(performSend).not.toHaveBeenCalled();

    manager.destroy();
  });

  it('(b) undo inside the window recalls the send — nothing is ever delivered', () => {
    const manager = new UndoSendManager();
    const performSend = vi.fn(async () => {});
    const restoreDeck = vi.fn();

    manager.queueSend({
      to: 'Family',
      subject: '[Group] Family',
      body: 'Dinner at 8?',
      onSendNow: performSend,
      onUndo: restoreDeck,
    });

    vi.advanceTimersByTime(4000);
    manager.undoSend();

    expect(restoreDeck).toHaveBeenCalledTimes(1);
    expect(performSend).not.toHaveBeenCalled();
    expect(manager.getState().status).toBe('idle');
    expect(manager.getState().pendingItem).toBeNull();

    // The window is gone — the send must not fire late either.
    vi.advanceTimersByTime(10000);
    expect(performSend).not.toHaveBeenCalled();

    manager.destroy();
  });

  it('(c) when the window closes the real send fires — "sent" is claimed only on resolve', async () => {
    const manager = new UndoSendManager();
    const performSend = vi.fn(async () => {});
    const restoreDeck = vi.fn();

    manager.queueSend({
      to: 'Family',
      subject: '[Group] Family',
      body: 'Dinner at 8?',
      onSendNow: performSend,
      onUndo: restoreDeck,
    });

    vi.advanceTimersByTime(10050);
    expect(performSend).toHaveBeenCalledTimes(1);
    expect(restoreDeck).not.toHaveBeenCalled();
    expect(manager.getState().status).toBe('sending');

    await vi.advanceTimersByTimeAsync(0);
    expect(manager.getState().status).toBe('sent');

    await vi.advanceTimersByTimeAsync(2000);
    expect(manager.getState().status).toBe('idle');

    manager.destroy();
  });

  it('(d) a FAILED send rejects — the bar never claims "sent", the honest failure path runs', async () => {
    const manager = new UndoSendManager();
    // The fixed performSend throws when sendEmail's result is not successful.
    const performSend = vi.fn(async () => {
      throw new Error('Failed to send message');
    });
    const handleSendFailed = vi.fn();
    const restoreDeck = vi.fn();

    manager.queueSend({
      to: 'Family',
      subject: '[Group] Family',
      body: 'Dinner at 8?',
      onSendNow: performSend,
      onSendFailed: handleSendFailed,
      onUndo: restoreDeck,
    });

    vi.advanceTimersByTime(10050);
    expect(performSend).toHaveBeenCalledTimes(1);

    // Let the rejection propagate through flushSend's handlers.
    await vi.advanceTimersByTimeAsync(0);

    // THE false-success regression pin: 'sent' must NEVER appear for this item.
    expect(manager.getState().status).not.toBe('sent');
    expect(handleSendFailed).toHaveBeenCalledTimes(1);
    const err = handleSendFailed.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('Failed to send message');
    // The dedicated failure hook takes precedence over the undo hook.
    expect(restoreDeck).not.toHaveBeenCalled();
    // The bar goes quiet after handing the words back.
    expect(manager.getState().status).toBe('idle');
    expect(manager.getState().pendingItem).toBeNull();

    manager.destroy();
  });

  it('(e) a double-tap on Send does not double-deliver', async () => {
    const manager = new UndoSendManager();
    const performSend = vi.fn(async () => {});
    const queueIdentical = () =>
      manager.queueSend({
        to: 'Family',
        subject: '[Group] Family',
        body: 'Dinner at 8?',
        onSendNow: performSend,
      });

    queueIdentical();
    queueIdentical(); // accidental second tap while the window is open

    vi.advanceTimersByTime(10050);
    await vi.advanceTimersByTimeAsync(0);
    expect(performSend).toHaveBeenCalledTimes(1);

    manager.destroy();
  });
});

describe('quick group-chat deck — wiring pins (fail on the pre-fix code)', () => {
  it('the deck routes its send through queueSend, not a direct fire-and-forget API call', () => {
    expect(deckSource).toContain('useUndoSend()');
    expect(deckSource).toContain('queueSend({');
    // The real API call is deferred to the recall window closing.
    expect(deckSource).toContain('onSendNow');
  });

  it('the sendEmail result is read and a failed send REJECTS (the bar can never celebrate it)', () => {
    expect(deckSource).toContain('if (!sendRes.success)');
    expect(deckSource).toContain('throw new Error');
    expect(deckSource).toContain('onSendFailed');
  });

  it('undo and failed-send hand the words back by reopening the deck', () => {
    expect(deckSource).toContain('onUndo');
    expect(deckSource).toContain('onRestore(');
  });

  it('the "Message sent" toast fires only AFTER the awaited send truly completed', () => {
    const toastAt = deckSource.indexOf('Message sent to');
    const sendAt = deckSource.indexOf('await apiClient.sendEmail');
    expect(toastAt).toBeGreaterThan(-1);
    expect(sendAt).toBeGreaterThan(-1);
    // Pre-fix, the toast fired at submit time with no send-result check.
    expect(toastAt).toBeGreaterThan(sendAt);
  });

  it('page.tsx no longer owns the direct send — it renders the deck component', () => {
    expect(pageSource).toContain('<QuickGroupChatDeck');
    // The old unchecked call lived inline in the page's onSubmit.
    expect(pageSource).not.toContain('await apiClient.sendEmail(res.data.id)');
    expect(pageSource).not.toContain('apiClient.composeEmail({');
  });
});
