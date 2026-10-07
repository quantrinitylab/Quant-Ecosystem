// ============================================================================
// Shared UI - Roving focus arithmetic
// ============================================================================

/**
 * Which arrow keys move the cursor.
 *
 * `horizontal` is a tablist or a chip strip: Left/Right. `vertical` is a menu or
 * a listbox: Up/Down. `both` is a grid-ish surface where either pair reads
 * naturally — a speed dial, a colour swatch row that wraps.
 *
 * The distinction is not decoration. `ArrowDown` on a focused control scrolls
 * the page, and taking that away from someone reading a long list is a worse
 * trade than one extra key press — so a horizontal strip must NOT claim the
 * vertical arrows. A menu, on the other hand, is a modal-ish surface the user
 * has deliberately entered, and there Up/Down is the only shape they will try.
 */
export type RovingOrientation = 'horizontal' | 'vertical' | 'both';

/**
 * The next index for an arrow/Home/End press over `length` items, or `null` when
 * the key is none of those and the event should be left alone.
 *
 * WHY THIS IS SHARED. A composite role — `tablist`, `menu`, `radiogroup`,
 * `listbox` — is a promise about the keyboard, not a label. Declaring one and
 * leaving the members reachable only by Tab is a lie to a screen reader and a
 * slower path for everyone else, and this package shipped four of them
 * (`SettingsPanel`'s tabs, `NotificationPanel`'s tabs, `UserMenu`, `QuickActions`)
 * plus one more in QuantMail's inbox. Each fix needs the same eight lines of
 * index arithmetic, and writing them five times is how the five drift apart.
 *
 * Wrapping is deliberate: a ring is faster than a strip with two dead ends, and
 * it is what the ARIA authoring practices describe for all four roles above.
 *
 * The caller keeps everything that is genuinely its own — moving focus, whether
 * selection follows focus (tabs: yes; menus: no), and what Escape does. This
 * only answers "which index next".
 */
export function nextRovingIndex(
  key: string,
  index: number,
  length: number,
  orientation: RovingOrientation = 'horizontal',
): number | null {
  if (length <= 0) return null;
  const last = length - 1;

  const forward = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
  const backward = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';

  if (key === forward) return index >= last ? 0 : index + 1;
  if (key === backward) return index <= 0 ? last : index - 1;
  if (orientation === 'both') {
    if (key === 'ArrowDown') return index >= last ? 0 : index + 1;
    if (key === 'ArrowUp') return index <= 0 ? last : index - 1;
  }
  if (key === 'Home') return 0;
  if (key === 'End') return last;
  return null;
}

/**
 * `tabIndex` for item `index` in a roving group whose cursor is at `active`.
 *
 * Exactly one member of a composite widget is in the tab sequence; the arrows
 * move between the rest. The failure mode this replaces is subtler than "no
 * keyboard support": `QuickActions` gave *every* item `tabIndex={-1}` and never
 * called `.focus()`, so the group could not be entered from the keyboard at all
 * while still advertising a menu.
 *
 * `active` may be `-1` (nothing selected yet, e.g. a menu just opened), in which
 * case the first item takes the tab stop so the group is still reachable.
 */
export function rovingTabIndex(index: number, active: number): 0 | -1 {
  if (active < 0) return index === 0 ? 0 : -1;
  return index === active ? 0 : -1;
}
