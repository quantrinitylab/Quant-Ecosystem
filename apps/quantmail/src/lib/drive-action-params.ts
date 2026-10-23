// ============================================================================
// drive-action-params.ts — pure query-param helpers for the Drive page.
// Keeps the `/drive?action=<name>` deep-link contract testable without
// mounting the whole page.
// ============================================================================

/**
 * Returns true when the `action` query param is the upload deep link
 * (e.g. `/drive?action=upload`, pushed by the super-app header's
 * "+ Upload File" quick action). Case-insensitive, trims whitespace.
 */
export function isUploadAction(action: string | null | undefined): boolean {
  return typeof action === 'string' && action.trim().toLowerCase() === 'upload';
}

/**
 * Builds the cleaned Drive URL after consuming the one-shot `action` param.
 * Preserves any other params (e.g. `tab`) so the picker doesn't reopen on
 * re-render, back-nav, or a tab-switch effect firing.
 */
export function driveUrlAfterConsumingAction(searchParamsString: string): string {
  const params = new URLSearchParams(searchParamsString ?? '');
  params.delete('action');
  if (!params.get('tab')) params.set('tab', 'home');
  const qs = params.toString();
  return qs ? `/drive?${qs}` : '/drive';
}
