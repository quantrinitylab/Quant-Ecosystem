// ============================================================================
// QuantAI auth gate (P0, 2026-10-10, user-locked)
// "quantai to login ke bina chalna hi nahi chahiye" — the QuantAI root page
// requires a Quant account. Guests are redirected to /login instead of
// seeing the chat UI.
// ============================================================================

/** Where guests are sent from the QuantAI root page (keeps login returning to /). */
export const LOGIN_REDIRECT_URL = '/login?returnTo=%2F';

/**
 * True when the root page must redirect the visitor to /login.
 * Only evaluated after the auth check has completed so a signed-in user
 * is never bounced while their session is still being read.
 */
export function mustRedirectToLogin(
  hasCheckedAuth: boolean,
  isAuthenticated: boolean,
): boolean {
  return hasCheckedAuth && !isAuthenticated;
}
