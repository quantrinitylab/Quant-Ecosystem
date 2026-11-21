// ============================================================================
// Quanty Copilot draft-overwrite P1 (qm-auto finding, 2026-10-22): the drawer
// auto-applied EVERY assistant turn into the composer and toasted success.
//
// Root cause, in two halves that only hurt together:
//   (a) `runTurn` called `onApplyAction(parseEmailActionFromText(...))` on
//       every compose-context turn, with no user tap and no check that the
//       answer was draft-shaped at all;
//   (b) `parseEmailActionFromText` ALWAYS returns a body (`cleanBody || text`
//       is truthy for any non-empty answer), and the composer did
//       `setBody(action.body)` — a wholesale replace.
//
// So asking "what is the weather?" mid-draft replaced the user's own words
// with the weather answer, and the toast claimed success even though nothing
// meaningful was applied.
//
// The fix: `runTurn` never applies (the per-message "Apply to Composer"
// button is the only apply path, requiring an explicit tap), and the
// composer's apply merges via `mergeQuantyActionBody` (set when empty,
// append when non-empty). These tests pin all three:
//   (a) the parser hazard is documented: a weather answer yields a body;
//   (b) the merge never destroys the user's words;
//   (c) source pins: the auto-apply call and the lying toast never come back.
//
// The drawer module is imported only for its two pure functions; every
// runtime import it pulls in is mocked (same harness style as
// EmailComposerAIAssist.test.tsx) so this suite never boots the composer,
// the API client, or the Next runtime.
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('react', () => ({
  useState: () => [null, () => {}],
  useRef: () => ({ current: null }),
  useEffect: () => {},
}));
vi.mock('framer-motion', () => ({ motion: {}, AnimatePresence: () => null }));
vi.mock('../Quanty', () => ({ Quanty: () => null }));
vi.mock('../../lib/quanty/avatar-choice', () => ({ openQuantyAvatarPicker: () => {} }));
vi.mock('../../lib/quanty/reactions', () => ({
  quantyReact: () => {},
  useQuantyMood: () => 'neutral',
}));
vi.mock('../InboxToast', () => ({ showToast: () => {} }));
vi.mock('../icons', () => ({ IconX: () => null }));
vi.mock('../../services/browser-auth-session', () => ({
  browserAuthSession: { authenticatedFetch: async () => { throw new Error('mocked'); } },
}));
vi.mock('../../lib/ai-intent-preference', () => ({
  readAIIntent: () => 'default',
  clientTimeoutForIntent: () => 30000,
}));
vi.mock('../../services/api-client', () => ({ apiClient: {} }));
vi.mock('../UndoSendCountdownBar', () => ({ useUndoSend: () => ({}) }));
vi.mock('../../i18n', () => ({ useI18n: () => ({ t: (s: string) => s, locale: 'en' }) }));
vi.mock('../QuantyToolTimeline', () => ({ QuantyToolTimeline: () => null }));
vi.mock('../QuantyConfirmationCard', () => ({ QuantyConfirmationCard: () => null }));
vi.mock('../ScheduleSendModal', () => ({
  ScheduleSendModal: () => null,
  isPastScheduleTime: () => false,
}));
vi.mock('../quanty-agent-cards', () => ({
  isToolConfirmationCard: () => false,
  isToolExecutionCard: () => false,
}));

import { parseEmailActionFromText, mergeQuantyActionBody } from '../QuantyCopilotDrawer';

const here = dirname(fileURLToPath(import.meta.url));
const drawerSource = readFileSync(join(here, '../QuantyCopilotDrawer.tsx'), 'utf8');

describe('parseEmailActionFromText always-truthy hazard (why auto-apply could never be safe)', () => {
  it('a non-draft answer still yields a body — so it must never be auto-applied', () => {
    const action = parseEmailActionFromText('Sunny, 28°C in Mumbai today.');
    expect(action.body).toBe('Sunny, 28°C in Mumbai today.');
    expect(action.to).toBeUndefined();
    expect(action.subject).toBeUndefined();
  });

  it('a draft-shaped answer extracts subject, greeting, body and closing', () => {
    const action = parseEmailActionFromText(
      'Subject: Q3 report\nHi Ana,\nHere is the Q3 report.\nThanks.',
    );
    expect(action.subject).toBe('Q3 report');
    expect(action.greeting).toBe('Hi Ana,');
    expect(action.body).toBe('Here is the Q3 report.');
    expect(action.closing).toBe('Thanks.');
  });
});

describe('mergeQuantyActionBody: explicit Apply never destroys the user draft', () => {
  it('sets the body verbatim when the draft is empty', () => {
    expect(mergeQuantyActionBody('', 'Here is the Q3 report.')).toBe('Here is the Q3 report.');
    expect(mergeQuantyActionBody('   ', 'Here is the Q3 report.')).toBe(
      'Here is the Q3 report.',
    );
  });

  it('appends after the user words when the draft is non-empty (the weather case)', () => {
    const merged = mergeQuantyActionBody(
      'My own words to Ana',
      'Sunny, 28°C in Mumbai today.',
    );
    expect(merged).toBe('My own words to Ana\n\nSunny, 28°C in Mumbai today.');
    expect(merged.startsWith('My own words to Ana')).toBe(true);
  });

  it('a blank action body is a no-op, never a wipe', () => {
    expect(mergeQuantyActionBody('My own words to Ana', '')).toBe('My own words to Ana');
    expect(mergeQuantyActionBody('My own words to Ana', '   ')).toBe(
      'My own words to Ana',
    );
    expect(mergeQuantyActionBody('My own words to Ana', undefined)).toBe(
      'My own words to Ana',
    );
  });
});

describe('source pins: the auto-apply and the lying toast never come back', () => {
  it('no per-turn auto-apply call remains in runTurn', () => {
    expect(drawerSource).not.toContain(
      'onApplyAction(parseEmailActionFromText(unwrapToolCallResponse(result.message)))',
    );
  });

  it('runTurn itself never touches the apply callback or any toast', () => {
    // Stronger than the exact-string pin above: ANY onApplyAction or
    // showToast inside runTurn's body is a regression, whatever it is called
    // with. Slice from runTurn's definition to the next top-level handler.
    const runTurnStart = drawerSource.indexOf('const runTurn = async');
    const runTurnEnd = drawerSource.indexOf('const handleSend = async', runTurnStart);
    expect(runTurnStart).toBeGreaterThan(-1);
    expect(runTurnEnd).toBeGreaterThan(runTurnStart);
    const runTurnBody = drawerSource.slice(runTurnStart, runTurnEnd);
    expect(runTurnBody).not.toContain('onApplyAction');
    expect(runTurnBody).not.toContain('showToast');
  });

  it('the lying success toast is gone', () => {
    expect(drawerSource).not.toContain("Quanty updated your email draft', type: 'success'");
  });

  it('the explicit Apply button is still the apply path', () => {
    // The button parses with the shared parser, then applies the parsed
    // action (payload-gated and try/catch-guarded — see the toast test).
    expect(drawerSource).toContain('parseEmailActionFromText(m.text)');
    expect(drawerSource).toContain('onApplyAction(action)');
    expect(drawerSource).toContain('Apply to Composer');
  });

  it('the Apply button is the ONLY onApplyAction call site in the drawer', () => {
    // The prop is destructured and guarded elsewhere, but invoked exactly
    // once: a second invocation anywhere in this file is a new auto-apply
    // (or duplicate-apply) path, however it is dressed up.
    const invocations = drawerSource.match(/onApplyAction\(/g) ?? [];
    expect(invocations).toHaveLength(1);
  });

  it('the Apply button toasts success only after a real apply', () => {
    // The button gates the success toast behind a non-blank payload and a
    // non-throwing apply; the no-payload and failure branches toast info /
    // error instead and never claim an update.
    expect(drawerSource).toContain('Nothing to apply from this message');
    expect(drawerSource).toContain('Could not apply this message to the composer');
  });
});
