/**
 * "Revoke other sessions" availability — Security → Active Sessions (QM-SCREEN-016).
 *
 * The backend fails closed with 409 CURRENT_SESSION_UNKNOWN when the refresh
 * cookie cannot identify the current rotation family (e.g. the cookie was
 * cleared while a short-lived access token still works). Offering the revoke
 * in that state would count this device among "N other sessions" and can only
 * fail — so the UI disables the button and says so honestly instead of
 * showing a count it cannot act on.
 */

export interface RevocableSession {
  id: string;
  isCurrent: boolean;
}

export interface RevokeAvailability {
  /** True when the Revoke button may be offered. */
  enabled: boolean;
  /**
   * Sessions other than the current one. Reported as 0 when the current
   * device is unknown: every row looks "other" then, but the backend would
   * refuse the revoke, so no honest count exists.
   */
  othersCount: number;
  /** True when the list is non-empty but no row is marked current. */
  currentUnknown: boolean;
}

export const describeRevokeAvailability = (
  sessions: readonly RevocableSession[] | null,
): RevokeAvailability => {
  const list = sessions ?? [];
  const currentUnknown = list.length > 0 && !list.some((s) => s.isCurrent);
  const othersCount = currentUnknown ? 0 : list.filter((s) => !s.isCurrent).length;
  return { enabled: othersCount > 0, othersCount, currentUnknown };
};
