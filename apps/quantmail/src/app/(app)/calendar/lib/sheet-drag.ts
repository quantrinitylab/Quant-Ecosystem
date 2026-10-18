/**
 * Bottom-sheet drag gating for the calendar entry sheet.
 *
 * The sheet header doubles as the drag handle: a pointerdown there captures
 * the pointer so the sheet can be dragged down to dismiss. That capture is
 * load-bearing to get right — per the Pointer Events spec a captured pointer
 * retargets `click` to the capturing element, so if a drag (and its
 * setPointerCapture) starts from a pointerdown on the Save button, the
 * click never reaches the button: Save appears completely dead (no handler
 * runs, no request fires, no toast shows). That was P0-3
 * "calendar save silent fail".
 *
 * The rule: a gesture that begins on an interactive control is never a
 * sheet drag. Drags may only start from inert chrome (the handle pill, the
 * header background).
 */

/**
 * Selectors for controls whose pointer gestures must never be hijacked by
 * the sheet drag. Kept as a single constant so the sheet and its tests
 * agree on exactly what counts as interactive.
 */
export const SHEET_DRAG_BLOCKED_SELECTOR =
  'button, a, input, select, textarea, [role="button"], [role="switch"], [role="tab"], [contenteditable="true"]';

type ClosableTarget = {
  closest(selectors: string): Element | null;
};

/**
 * Whether a pointerdown on `target` may begin a bottom-sheet drag.
 *
 * Returns false when the gesture started inside an interactive control
 * (Save/Close buttons, sub-tabs, switches, inputs) so the browser delivers
 * the eventual click to that control instead of retargeting it to the
 * capturing drag container. Fail-open (true) for anything that cannot be
 * classified — an unknown target must not break the drag gesture.
 */
export function pointerStartsSheetDrag(target: EventTarget | null | undefined): boolean {
  const closest = (target as ClosableTarget | null | undefined)?.closest;
  if (typeof closest !== 'function') return true;
  return closest.call(target, SHEET_DRAG_BLOCKED_SELECTOR) === null;
}
