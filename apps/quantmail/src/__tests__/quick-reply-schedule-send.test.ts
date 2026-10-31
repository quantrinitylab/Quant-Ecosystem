// ============================================================================
// Quick-reply schedule-send — the fastest reply surface gets the same
// schedule mechanism as the composers (one sendAt contract, no second
// implementation).
//
// Before this fix, `handleSendReply` in ConversationalThreadView queued an
// immediate-only send via `queueSend({ to, body, onSendNow, ... })` — no
// scheduledAt, no successLabel, no ScheduleSendModal, and the reply route had
// no sendAt field. The finding: the fastest reply surface could not schedule.
//
// Two layers, following this repo's established test conventions:
//  1. Behavioural: the REAL UndoSendManager driven exactly as the fixed
//     handler drives it for a scheduled send (same queueSend shape —
//     scheduledAt + successLabel) under fake timers.
//  2. Wiring pins: readFileSync source assertions on the real component —
//     these fail on the pre-fix code, where the handler had no schedule path.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  UndoSendManager,
  UNDO_SEND_COUNTDOWN_SEC,
} from '../components/UndoSendCountdownBar';

const componentSource = readFileSync(
  fileURLToPath(new URL('../components/ConversationalThreadView.tsx', import.meta.url)),
  'utf8',
);

/** The `handleSendReply` useCallback body, from its declaration to its dep array. */
function handleSendReplyBody(source: string): string {
  const start = source.indexOf('const handleSendReply = useCallback(');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\n  ]);', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('quick-reply schedule-send — behavioural (real UndoSendManager)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('(a) a scheduled quick reply rides the same 10-second recall window — nothing is delivered during it', () => {
    const manager = new UndoSendManager();
    const performSend = vi.fn(async () => {});
    const restoreToReplyBar = vi.fn();

    // Exactly the call the fixed handleSendReply makes for a scheduled send.
    manager.queueSend({
      to: 'asha@quantmail.in',
      body: 'Pakka, kal 5 baje milte hain',
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
      successLabel: 'Reply scheduled!',
      onSendNow: performSend,
      onUndo: restoreToReplyBar,
    });

    const state = manager.getState();
    expect(state.status).toBe('counting');
    expect(state.remainingSeconds).toBe(UNDO_SEND_COUNTDOWN_SEC);
    // The bar must claim "scheduled", never "Message sent!", for a future send.
    expect(state.pendingItem?.successLabel).toBe('Reply scheduled!');
    expect(state.pendingItem?.scheduledAt).toBeTruthy();
    expect(performSend).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5000);
    expect(manager.getState().status).toBe('counting');
    expect(performSend).not.toHaveBeenCalled();

    manager.destroy();
  });

  it('(b) scheduledAt joins the duplicate-guard identity — same words at a different time is a different send', () => {
    const manager = new UndoSendManager();
    const firstSend = vi.fn(async () => {});
    const secondSend = vi.fn(async () => {});
    const noop = vi.fn();

    const at1 = new Date(Date.now() + 3_600_000).toISOString();
    const at2 = new Date(Date.now() + 7_200_000).toISOString();

    manager.queueSend({ to: 'a@b.c', body: 'same words', scheduledAt: at1, onSendNow: firstSend, onUndo: noop });
    // Same content, DIFFERENT time: genuinely different send — must NOT dedupe.
    // The manager flushes the previous item (fires its send) and queues the new one.
    manager.queueSend({ to: 'a@b.c', body: 'same words', scheduledAt: at2, onSendNow: secondSend, onUndo: noop });

    expect(firstSend).toHaveBeenCalledTimes(1);
    expect(manager.getState().pendingItem?.scheduledAt).toBe(at2);
    expect(secondSend).not.toHaveBeenCalled();

    manager.destroy();
  });

  it('(c) same words at the SAME scheduled time is a duplicate — the second queueSend is a no-op', () => {
    const manager = new UndoSendManager();
    const firstSend = vi.fn(async () => {});
    const secondSend = vi.fn(async () => {});
    const noop = vi.fn();
    const at = new Date(Date.now() + 3_600_000).toISOString();

    manager.queueSend({ to: 'a@b.c', body: 'same words', scheduledAt: at, onSendNow: firstSend, onUndo: noop });
    manager.queueSend({ to: 'a@b.c', body: 'same words', scheduledAt: at, onSendNow: secondSend, onUndo: noop });

    // Duplicate guard: nothing flushed, nothing requeued.
    expect(firstSend).not.toHaveBeenCalled();
    expect(secondSend).not.toHaveBeenCalled();
    expect(manager.getState().pendingItem?.scheduledAt).toBe(at);

    manager.destroy();
  });

  it('(d) Undo inside the window cancels a scheduled send before anything is delivered', () => {
    const manager = new UndoSendManager();
    const performSend = vi.fn(async () => {});
    const restoreToReplyBar = vi.fn();

    manager.queueSend({
      to: 'asha@quantmail.in',
      body: 'Pakka, kal 5 baje milte hain',
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
      successLabel: 'Reply scheduled!',
      onSendNow: performSend,
      onUndo: restoreToReplyBar,
    });

    vi.advanceTimersByTime(3000);
    manager.undoSend();

    expect(restoreToReplyBar).toHaveBeenCalledTimes(1);
    expect(manager.getState().status).toBe('idle');

    vi.advanceTimersByTime(15000);
    expect(performSend).not.toHaveBeenCalled();

    manager.destroy();
  });
});

describe('quick-reply schedule-send — wiring pins on the real component', () => {
  const body = handleSendReplyBody(componentSource);

  it('handleSendReply accepts a scheduledAt parameter (the pre-fix signature took none)', () => {
    expect(body).toMatch(/const handleSendReply = useCallback\(\(scheduledAt\?: string\)/);
  });

  it('the queueSend call carries scheduledAt and the honest scheduled successLabel', () => {
    expect(body).toContain('scheduledAt,');
    expect(body).toContain("successLabel: scheduledAt ? 'Reply scheduled!' : undefined");
  });

  it('the send passes sendAt to replyToEmail (the one schedule contract, not a second mechanism)', () => {
    expect(body).toMatch(/apiClient\.replyToEmail\(\s*replyTarget,\s*replyContent,\s*isReplyAllDefault\(defaultReplyBehavior\),\s*'chat',\s*clientMessageId,\s*scheduledAt,/);
  });

  it('the send carries the default reply behavior flag — the quick-reply bar honours Settings → Default reply behavior (fix/qm-default-reply-behavior; the pre-fix call passed undefined, i.e. always sender-only)', () => {
    expect(componentSource).toContain("import {\n  isReplyAllDefault,\n  readReplyBehavior,\n} from '../lib/reply-behavior-preference';");
    expect(componentSource).toContain('const [defaultReplyBehavior] = useState(() => readReplyBehavior());');
  });

  it('a past scheduledAt is rejected before anything is queued (PR #908 convention)', () => {
    expect(body).toContain('isPastScheduleTime(new Date(scheduledAt))');
  });

  it('a scheduled send skips the optimistic bubble — nothing delivered yet, no fake timeline row', () => {
    expect(body).toContain('if (scheduledAt) {');
    // The scheduled branch returns before the optimistic `setMessages` injection.
    const scheduledBranch = body.indexOf('if (scheduledAt) {');
    const optimisticInjection = body.indexOf('setMessages((prev) => {');
    expect(scheduledBranch).toBeGreaterThan(-1);
    expect(optimisticInjection).toBeGreaterThan(scheduledBranch);
  });

  it('the component imports the same ScheduleSendModal the composers use', () => {
    expect(componentSource).toContain(
      "import { ScheduleSendModal, isPastScheduleTime } from './ScheduleSendModal'",
    );
  });

  it('the bar renders a schedule button in chat mode only', () => {
    expect(componentSource).toContain('data-testid="quick-reply-schedule-button"');
    expect(componentSource).toContain("composeMode === 'chat' && (");
  });

  it('the modal is rendered and its onSchedule feeds handleSendReply', () => {
    expect(componentSource).toContain('<ScheduleSendModal');
    expect(componentSource).toMatch(/onSchedule=\{\(at\) => \{\s*setShowScheduleModal\(false\);\s*handleSendReply\(at\);/);
  });
});
