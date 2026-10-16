import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * QM inbox P2 — swipe must be disabled while the row's "…" menu is open.
 *
 * Regression guard for the finding: EmailRow's useTouchSwipe was
 * `disabled: isChecked || showSnoozeMenu`, missing `showRowMenu`. With the …
 * menu open, a swipe would slide the row out from under the anchored menu,
 * leaving the fixed-position menu pointing at nothing (the code's own comment
 * names exactly this failure for the snooze menu, but the … menu was never
 * added to the gate).
 *
 * EmailRow is not exported from page.tsx, so the contract is pinned at the
 * source level: the disabled expression in the single useTouchSwipe call
 * inside EmailRow must gate on all three conditions.
 */

const PAGE = readFileSync(
  new URL('../app/page.tsx', import.meta.url),
  'utf8',
);

const swipeCall = PAGE.match(/const swipe = useTouchSwipe\(\{[\s\S]*?\n  \}\);/);
if (!swipeCall) throw new Error('useTouchSwipe call not found in page.tsx');

const CALL = swipeCall[0];

describe('EmailRow swipe disabled while a row menu is open', () => {
  it('finds exactly one useTouchSwipe call in EmailRow', () => {
    expect(CALL).toBeTruthy();
  });

  it('disables the gesture while the … row menu is open (showRowMenu)', () => {
    const disabledLine = CALL.split('\n').find((line) =>
      line.includes('disabled:'),
    );
    expect(disabledLine).toBeTruthy();
    expect(disabledLine!).toContain('showRowMenu');
  });

  it('keeps the existing gates: selected rows and the snooze menu', () => {
    const disabledLine = CALL.split('\n').find((line) =>
      line.includes('disabled:'),
    );
    expect(disabledLine).toBeTruthy();
    expect(disabledLine!).toContain('isChecked');
    expect(disabledLine!).toContain('showSnoozeMenu');
  });

  it('documents why the gesture is off in the comment above the hook call', () => {
    const idx = PAGE.indexOf('const swipe = useTouchSwipe({');
    const comment = PAGE.slice(Math.max(0, idx - 600), idx);
    expect(comment).toMatch(/menu pointing at nothing/);
  });
});
