/**
 * Drive URL "action" param helpers.
 *
 * The header's Executive Quick Actions tile navigates to `/drive?action=upload`
 * (see QuantMailSuperAppHeader.tsx). drive/page.tsx historically only read the
 * `tab` param, so that action was silently ignored. These pure helpers keep the
 * detection + consumption logic unit-testable under vitest (node environment,
 * no DOM — effects never run there).
 */

/** The only drive URL action currently honoured. */
export const DRIVE_ACTION_UPLOAD = 'upload';

/**
 * True when the URL carries `action=upload` (case-insensitive).
 * Accepts anything with a `.get()` — URLSearchParams and Next's
 * ReadonlyURLSearchParams both qualify.
 */
export function isDriveUploadAction(
  searchParams: { get(name: string): string | null } | null | undefined,
): boolean {
  if (!searchParams) return false;
  return (searchParams.get('action') ?? '').toLowerCase() === DRIVE_ACTION_UPLOAD;
}

/**
 * Rebuilds the drive URL with the consumed `action` param removed, so the
 * action fires exactly once, while every other param (e.g. `tab`) survives.
 */
export function driveUrlWithoutAction(
  searchParams: { toString(): string } | null | undefined,
  basePath = '/drive',
): string {
  const next = new URLSearchParams(searchParams?.toString() ?? '');
  next.delete('action');
  const qs = next.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
