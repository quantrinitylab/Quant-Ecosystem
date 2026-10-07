// ============================================================================
// QuantSync - SSO Login Service
// ============================================================================
//
// QuantMail is the ecosystem's identity root. QuantSync doesn't run its own
// password login: a client presents the QuantMail-issued access token and this
// service validates it as a CROSS-APP token for QuantSync (signature + expiry +
// that the token carries a scope QuantSync is allowed to consume). On success
// the QuantMail token is the session credential (it is already accepted by
// every app's auth hook) and the user profile is projected from its claims.
//
// The cross-app validator is injected (real impl: @quant/auth SSOMiddleware) so
// the login flow is unit-testable without JWT/crypto plumbing.

import { createAppError } from '@quant/server-core';

export interface SsoTokenPayload {
  sub: string;
  email: string;
  username: string;
  role: string;
}

export interface CrossAppValidationResult {
  valid: boolean;
  payload?: SsoTokenPayload & Record<string, unknown>;
  reason?: string;
}

export interface CrossAppValidator {
  validateCrossAppToken(token: string, targetApp: string): Promise<CrossAppValidationResult>;
}

export interface SsoUser {
  id: string;
  email: string;
  username: string;
  role: string;
}

export interface SsoLoginResult {
  accessToken: string;
  user: SsoUser;
}

const TARGET_APP = 'quantsync';

export class SsoLoginService {
  constructor(private readonly validator: CrossAppValidator) {}

  async login(quantMailToken: string | undefined): Promise<SsoLoginResult> {
    const token = quantMailToken?.trim();
    if (!token) {
      throw createAppError('quantMailToken is required', 400, 'MISSING_TOKEN');
    }

    const result = await this.validator.validateCrossAppToken(token, TARGET_APP);
    if (!result.valid || !result.payload) {
      throw createAppError(result.reason ?? 'QuantMail SSO token is invalid', 401, 'SSO_INVALID');
    }

    const p = result.payload;
    if (!p.sub) {
      throw createAppError('SSO token is missing a subject', 401, 'SSO_INVALID');
    }

    // The QuantMail token is the cross-app credential — return it as the session
    // access token (every app's auth hook already accepts it).
    return {
      accessToken: token,
      user: {
        id: p.sub,
        email: p.email ?? '',
        username: p.username ?? p.email ?? p.sub,
        role: p.role ?? 'user',
      },
    };
  }
}
