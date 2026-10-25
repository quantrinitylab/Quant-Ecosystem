// ============================================================================
// Compose undo of a scheduled send (P2 finding, 2026-10-11).
//
// Before this fix, EmailComposer had NO `scheduledAt` state variable at all:
// `handleSend`'s schedule lived only in its argument and in the send
// snapshot, so `queueSend`'s onUndo restored to/cc/bcc/subject/body/
// attachments but not the schedule, and the reopened composer showed no
// schedule indicator — a re-send delivered immediately instead of at the
// chosen time (9am-scheduled send → undo → re-send went out immediately).
//
// Layers, following this repo's established test conventions:
//  1. Pure-function: `resolveUndoScheduledAt` (restore only future times)
//     and `formatScheduledSendTime` (never render a garbage time).
//  2. Behavioural: the REAL UndoSendManager driven exactly as the fixed
//     handler drives it for a scheduled send (scheduledAt + successLabel
//     ride the queue, so the recall bar says "Scheduling…" and undo fires
//     the restore callback).
//  3. Wiring pins: readFileSync source assertions on the real components —
//     these fail on the pre-fix code, which had no `scheduledAt` state, no
//     onUndo schedule restore, no schedule chip, and no `initialScheduledAt`
//     path through the /compose page's undo-draft restore.
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  resolveUndoScheduledAt,
  formatScheduledSendTime,
} from '../components/composeSchedule';
import { UndoSendManager } from '../components/UndoSendCountdownBar';

const emailComposerSource = readFileSync(
  fileURLToPath(new URL('../components/EmailComposer.tsx', import.meta.url)),
  'utf8',
);
const composePageSource = readFileSync(
  fileURLToPath(new URL('../app/compose/page.tsx', import.meta.url)),
  'utf8',
);

/** The `queueSend({...})` call in EmailComposer's handleSend. */
function queueSendCall(source: string): string {
  const start = source.indexOf('queueSend({');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('onSendNow:', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

/** The onUndo callback inside that queueSend call. */
function onUndoBody(source: string): string {
  const call = queueSendCall(source);
  const start = call.indexOf('onUndo: async () => {');
  expect(start).toBeGreaterThan(-1);
  const end = call.indexOf("quantyReact('mail:undone')", start);
  expect(end).toBeGreaterThan(start);
  return call.slice(start, end);
}

const NOW = new Date('2026-10-27T08:00:00.000Z');
const FUTURE = '2026-10-27T09:00:00.000Z';
const PAST = '2026-10-27T07:00:00.000Z';

describe('resolveUndoScheduledAt — only a future schedule is restorable', () => {
  it('preserves a future schedule byte-identically', () => {
    expect(resolveUndoScheduledAt(FUTURE, NOW)).toBe(FUTURE);
  });

  it('drops a past schedule (the re-send must not silently go out now)', () => {
    expect(resolveUndoScheduledAt(PAST, NOW)).toBeUndefined();
  });

  it('drops a schedule exactly at now — "not in the future" counts as past', () => {
    expect(resolveUndoScheduledAt('2026-10-27T08:00:00.000Z', NOW)).toBeUndefined();
  });

  it('drops unparseable and missing schedules', () => {
    expect(resolveUndoScheduledAt('not-a-time', NOW)).toBeUndefined();
    expect(resolveUndoScheduledAt(undefined, NOW)).toBeUndefined();
    expect(resolveUndoScheduledAt('', NOW)).toBeUndefined();
  });
});

describe('formatScheduledSendTime — the chip label', () => {
  it('renders a future time as a non-empty label with a clock time', () => {
    const label = formatScheduledSendTime(FUTURE);
    expect(label.length).toBeGreaterThan(0);
    expect(label).toContain(':');
  });

  it('renders nothing for an unparseable value — never a garbage time', () => {
    expect(formatScheduledSendTime('not-a-time')).toBe('');
  });
});

describe('scheduled send through the real UndoSendManager', () => {
  it('carries scheduledAt + successLabel, and undo fires the restore callback', () => {
    const manager = new UndoSendManager();
    const restore = vi.fn();
    const sendNow = vi.fn(async () => {});

    // Exactly the call the fixed handleSend makes for a scheduled send.
    manager.queueSend({
      to: 'asha@quantmail.in',
      subject: 'Kal 9 baje',
      body: 'Pakka, kal milte hain',
      scheduledAt: FUTURE,
      successLabel: 'Email scheduled!',
      onUndo: restore,
      onSendNow: sendNow,
    });

    // The recall bar reads pendingItem.scheduledAt for its "Scheduling…"
    // copy — without this field it would claim "Sending…" for a schedule.
    expect(manager.getState().pendingItem?.scheduledAt).toBe(FUTURE);
    expect(manager.getState().pendingItem?.successLabel).toBe('Email scheduled!');

    manager.undoSend();
    expect(restore).toHaveBeenCalledTimes(1);
    expect(sendNow).not.toHaveBeenCalled();
    manager.destroy();
  });
});

describe('EmailComposer wiring — the fix, pinned against the pre-fix code', () => {
  it('has a scheduledAt state variable (pre-fix: none existed)', () => {
    expect(emailComposerSource).toContain(
      'const [scheduledAt, setScheduledAt] = useState<string | undefined>',
    );
  });

  it('a plain Send keeps a restored schedule (param falls back to state)', () => {
    expect(emailComposerSource).toContain('requestedScheduledAt ?? scheduledAt');
    expect(emailComposerSource).toContain('scheduledAt: effectiveScheduledAt,');
  });

  it('onUndo restores the schedule from the send snapshot', () => {
    const body = onUndoBody(emailComposerSource);
    expect(body).toContain(
      'const restoredSchedule = resolveUndoScheduledAt(draftSnapshot.scheduledAt);',
    );
    expect(body).toContain('setScheduledAt(restoredSchedule);');
  });

  it('onUndo discloses a dropped schedule instead of silently sending now', () => {
    expect(onUndoBody(emailComposerSource)).toContain('schedule was dropped');
  });

  it('the recall bar is told the send is scheduled (honest "Scheduling…" copy)', () => {
    const call = queueSendCall(emailComposerSource);
    expect(call).toContain('scheduledAt: draftSnapshot.scheduledAt,');
    expect(call).toContain("successLabel: draftSnapshot.scheduledAt ? 'Email scheduled!' : undefined");
  });

  it('the reopened composer shows the schedule with a way to clear it', () => {
    expect(emailComposerSource).toContain(
      'Scheduled to send {formatScheduledSendTime(scheduledAt)}',
    );
    expect(emailComposerSource).toContain('aria-label="Clear scheduled send"');
    expect(emailComposerSource).toContain('onClick={() => setScheduledAt(undefined)}');
  });

  it('accepts a restored schedule as an initial prop (the /compose path)', () => {
    expect(emailComposerSource).toContain('initialScheduledAt?: string;');
    expect(emailComposerSource).toContain('initialScheduledAt,');
    expect(emailComposerSource).toContain(
      'setScheduledAt(resolveUndoScheduledAt(initialScheduledAt))',
    );
  });
});

describe('/compose page wiring — the sessionStorage undo path', () => {
  it('restores scheduledAt from the undo draft instead of dropping it', () => {
    expect(composePageSource).toContain('scheduledAt?: string;');
    expect(composePageSource).toContain(
      "typeof parsed.scheduledAt === 'string' ? parsed.scheduledAt : undefined",
    );
    expect(composePageSource).toContain('initialScheduledAt={draftData?.scheduledAt}');
  });
});
