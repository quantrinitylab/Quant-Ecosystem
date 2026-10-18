import { describe, it, expect } from 'vitest';

import { pointerStartsSheetDrag, SHEET_DRAG_BLOCKED_SELECTOR } from '../sheet-drag';

/**
 * P0-3 regression: the calendar sheet's Save button lives inside the header
 * element that also acts as the drag handle. If a pointerdown on the button
 * starts a sheet drag (and its setPointerCapture), the Pointer Events spec
 * retargets the click to the capturing header — the button's onClick never
 * fires and Save appears completely dead: no handler, no request, no toast.
 *
 * These tests pin the rule: gestures starting on interactive controls must
 * never begin a sheet drag, so the click always reaches the control.
 */

const interactiveTarget = (matchedSelector: string) => ({
  closest: (selectors: string) =>
    selectors === matchedSelector ? ({} as Element) : null,
});

describe('pointerStartsSheetDrag', () => {
  it('does not start a drag when the gesture begins on the Save button', () => {
    // Simulate a target inside <button>: closest('button, ...') matches.
    expect(pointerStartsSheetDrag(interactiveTarget(SHEET_DRAG_BLOCKED_SELECTOR))).toBe(false);
  });

  it('names every native form control in the blocked selector', () => {
    for (const tag of ['button', 'a', 'input', 'select', 'textarea']) {
      expect(SHEET_DRAG_BLOCKED_SELECTOR).toContain(tag);
    }
    // And each of them blocks the drag (target inside the control matches).
    expect(pointerStartsSheetDrag(interactiveTarget(SHEET_DRAG_BLOCKED_SELECTOR))).toBe(false);
  });

  it('does not start a drag from ARIA controls (switch, tab, button roles)', () => {
    for (const role of ['button', 'switch', 'tab']) {
      expect(SHEET_DRAG_BLOCKED_SELECTOR).toContain(`[role="${role}"]`);
    }
    expect(pointerStartsSheetDrag(interactiveTarget(SHEET_DRAG_BLOCKED_SELECTOR))).toBe(false);
  });

  it('starts a drag from inert chrome (handle pill, header background)', () => {
    const plainTarget = { closest: (_selectors: string) => null };
    expect(pointerStartsSheetDrag(plainTarget)).toBe(true);
  });

  it('fails open for unknown targets so the drag gesture never breaks', () => {
    expect(pointerStartsSheetDrag(null)).toBe(true);
    expect(pointerStartsSheetDrag(undefined)).toBe(true);
    // e.g. a text node or anything without Element.closest
    expect(pointerStartsSheetDrag({} as unknown as EventTarget)).toBe(true);
  });
});
