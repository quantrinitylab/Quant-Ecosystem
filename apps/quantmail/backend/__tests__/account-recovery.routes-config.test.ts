// ============================================================================
// Recovery-email proxy allow-list pin (fix/qm-recovery-channel-authz).
//
// The RecoveryEmailSettings component calls GET/PUT /api/auth/account/
// recovery-email and POST /api/auth/account/recovery-email/verify through the
// Next.js catch-all proxy, which only forwards methods listed in
// ALLOWED_BACKEND_ROUTES. The #1254 GET/PUT shipped WITHOUT these rows and
// were unreachable through the default `/api` base URL — the proxy answered
// 404 API_ROUTE_NOT_FOUND before the backend ever saw the request (the same
// split-brain class the email-templates and follow-up-reminders fixes hit).
// These tests pin the rows so the verified lifecycle stays reachable.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { ALLOWED_BACKEND_ROUTES } from '../lib/routes-config';

function methodsFor(path: string): string[] | undefined {
  return ALLOWED_BACKEND_ROUTES.find(({ pattern }) => pattern.test(path))?.methods.slice();
}

describe('recovery-email proxy allow-list', () => {
  it('lists GET and PUT for /auth/account/recovery-email', () => {
    expect(methodsFor('auth/account/recovery-email')).toEqual(['GET', 'PUT']);
  });

  it('lists POST (and only POST) for /auth/account/recovery-email/verify', () => {
    expect(methodsFor('auth/account/recovery-email/verify')).toEqual(['POST']);
  });

  it('does not route stray sub-paths (e.g. /auth/account/recovery-email/verify/extra) anywhere', () => {
    expect(methodsFor('auth/account/recovery-email/verify/extra')).toBeUndefined();
  });

  it('does not advertise POST on the base path', () => {
    expect(methodsFor('auth/account/recovery-email')).not.toContain('POST');
  });
});
