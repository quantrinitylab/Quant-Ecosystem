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
import {
  buildQuantyDraftSendNow,
  quantyDraftSendCopy,
  type QuantyDraftSendDeps,
} from '../QuantyCopilotDrawer';

function makeDeps(overrides: Partial<QuantyDraftSendDeps> = {}): QuantyDraftSendDeps & {
  notes: string[];
  toasts: Array<{ text: string; type: 'success' | 'error' }>;
  settled: boolean;
} {
  const notes: string[] = [];
  const toasts: Array<{ text: string; type: 'success' | 'error' }> = [];
  let settled = false;
  return {
    to: 'friend@example.com',
    subject: 'Hello',
    body: 'Hi there',
    copy: quantyDraftSendCopy('en'),
    composeEmail: async () => ({ success: true, data: { id: 'email-1' } }),
    sendEmail: async () => ({ success: true }),
    appendAssistantNote: (text: string) => {
      notes.push(text);
    },
    showToast: (toast: { text: string; type: 'success' | 'error' }) => {
      toasts.push(toast);
    },
    onSettled: () => {
      settled = true;
    },
    notes,
    toasts,
    get settled() {
      return settled;
    },
    ...overrides,
  };
}

describe('buildQuantyDraftSendNow: the onSendNow contract', () => {
  it('resolves after a truly completed send, with exactly one success surface', async () => {
    const deps = makeDeps();
    await buildQuantyDraftSendNow(deps)();
    expect(deps.settled).toBe(true);
    expect(deps.notes).toHaveLength(1);
    expect(deps.notes[0]).toMatch(/friend@example\.com/);
    expect(deps.toasts).toEqual([{ text: 'Email sent to friend@example.com', type: 'success' }]);
  });

  it('REJECTS when the send fails — no swallow, failure surface still honest', async () => {
    const deps = makeDeps({
      sendEmail: async () => ({ success: false, error: { message: 'SMTP down' } }),
    });
    // The core regression: this used to resolve, letting the undo-send bar
    // claim "Message sent!" for a send that never happened.
    await expect(buildQuantyDraftSendNow(deps)()).rejects.toThrow('SMTP down');
    expect(deps.settled).toBe(true);
    // Exactly one honest failure surface: the drawer's own note + error toast.
    expect(deps.notes).toHaveLength(1);
    expect(deps.notes[0]).toMatch(/SMTP down/);
    expect(deps.notes[0]).toMatch(/Nothing was sent/);
    expect(deps.toasts).toHaveLength(1);
    expect(deps.toasts[0].type).toBe('error');
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

describe('quantyDraftSendCopy: locale-following send-state copy', () => {
  it('English default has no Hinglish/Roman-script Hindi', () => {
    const copy = quantyDraftSendCopy('en');
    const all = [
      copy.composeFailed,
      copy.sendFailed,
      copy.sentNote('a@b.c'),
      copy.failedNote('x'),
      copy.sendFailedToast,
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
  });
});
