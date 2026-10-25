/**
 * Quick-completion chip accessibility pin (fix/qm-smart-compose-chip-a11y).
 *
 * The chip was a bare <div onClick> — no role, no tabIndex, no key handler —
 * so keyboard-only users could never reach the prediction as a control and
 * screen readers got no button semantics. The Tab-accept gesture in the body
 * textarea (handleBodyKeyDown) does not cover this: it only fires while the
 * textarea has focus, and a control that cannot be tabbed to is invisible
 * to keyboard and assistive-tech navigation alike.
 *
 * These tests pin the fix on source, the same way QuickCompletionsHonesty
 * pins this feature's copy: the chip block (between its comment and the
 * signature comment that follows it) must carry role="button", tabIndex 0,
 * an aria-label naming the completion, and the Enter/Space key handler —
 * and that handler must NOT hijack Tab, which on the chip must move focus
 * like any other control.
 *
 * A rendered assertion is not possible here: the chip only renders when
 * body text ends in a trigger phrase, and body is set from initialBody in a
 * useEffect that renderToStaticMarkup never runs.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'EmailComposer.tsx'), 'utf8');

// The chip JSX: from its comment to the signature comment that follows it.
const chipStart = source.indexOf('{/* Quick completions chip');
const chipEnd = source.indexOf('The account signature', chipStart);
const chip = source.slice(chipStart, chipEnd);

// The key handler: from its declaration to its closing brace.
const handlerStart = source.indexOf('const handleCompletionKeyDown');
const handlerEnd = source.indexOf('};', handlerStart);
const handler = source.slice(handlerStart, handlerEnd);

describe('quick-completion chip is keyboard and screen-reader reachable', () => {
  it('the chip block exists and is the only completion chip', () => {
    expect(chipStart, 'chip comment must exist').toBeGreaterThan(-1);
    expect(chipEnd, 'signature comment must follow the chip').toBeGreaterThan(chipStart);
    expect(chip).toContain('activeCompletion');
  });

  it('the chip exposes button semantics and is focusable', () => {
    expect(chip).toContain('role="button"');
    expect(chip).toContain('tabIndex={0}');
  });

  it('the chip names the completion for screen readers', () => {
    expect(chip).toContain('aria-label=');
    expect(chip).toContain('Apply quick completion:');
    expect(chip).toContain('activeCompletion.trim()');
  });

  it('the chip wires the keyboard handler, not just the click', () => {
    expect(chip).toContain('onClick={acceptCompletion}');
    expect(chip).toContain('onKeyDown={handleCompletionKeyDown}');
  });

  it('the chip shows a visible focus indicator', () => {
    expect(chip).toContain('focus-visible:ring-2');
  });

  it('the key handler activates on Enter and Space and accepts the completion', () => {
    expect(handlerStart, 'handler must exist').toBeGreaterThan(-1);
    expect(handler).toContain("e.key === 'Enter'");
    expect(handler).toContain("e.key === ' '");
    expect(handler).toContain('acceptCompletion()');
    expect(handler).toContain('preventDefault()');
  });

  it('the key handler does not hijack Tab on the chip', () => {
    // Tab-accept lives only in the body textarea; on the chip Tab must
    // move focus. If this handler ever mentions Tab, that invariant broke.
    expect(handler).not.toContain('Tab');
  });

  it('the chip copy does not promise a pointer-only gesture', () => {
    expect(chip).not.toContain('Tap to apply');
  });
});
