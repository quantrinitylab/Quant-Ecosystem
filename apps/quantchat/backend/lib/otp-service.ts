// ============================================================================
// QuantChat - OTP Service
// ============================================================================
//
// Phone-number OTP lifecycle for QuantChat sign-in. QuantMail is the ecosystem
// identity root (SSO), but QuantChat additionally requires a verified phone
// number, so this service owns the phone-verification step.
//
// Security properties:
//  - codes are generated with a CSPRNG (node:crypto randomInt), never Math.random
//  - per-number rate limiting + cooldown to resist SMS-bombing / brute force
//  - codes expire and have a hard attempt cap (lockout) to resist guessing
//  - constant-length numeric codes; verification deletes the code on success
//
// Pure + dependency-injected (clock + SMS sender) so it is fully unit-testable
// with no real time or network. State is in-memory; inject a shared/persistent
// store (e.g. Redis) for multi-instance production (documented follow-up).

import { randomInt } from 'node:crypto';

export interface SmsSender {
  /** Deliver an SMS. Real adapters (Twilio/MSG91) implement this. */
  send(phoneNumber: string, message: string): Promise<{ success: boolean; error?: string }>;
}

export interface OtpServiceConfig {
  codeLength: number;
  codeTtlMs: number;
  cooldownMs: number;
  maxSendsPerHour: number;
  maxVerifyAttempts: number;
}

export const DEFAULT_OTP_CONFIG: OtpServiceConfig = {
  codeLength: 6,
  codeTtlMs: 5 * 60 * 1000,
  cooldownMs: 60 * 1000,
  maxSendsPerHour: 5,
  maxVerifyAttempts: 5,
};

export interface RequestResult {
  ok: boolean;
  expiresInSec?: number;
  retryAfterSec?: number;
  error?: string;
}

export interface VerifyResult {
  ok: boolean;
  error?: string;
}

interface PendingCode {
  code: string;
  expiresAt: number;
  attempts: number;
}

interface RateWindow {
  count: number;
  resetAt: number;
}

const E164 = /^\+[1-9]\d{6,14}$/;

export class OtpService {
  private readonly config: OtpServiceConfig;
  private readonly pending = new Map<string, PendingCode>();
  private readonly rate = new Map<string, RateWindow>();
  private readonly cooldownUntil = new Map<string, number>();

  constructor(
    private readonly sms: SmsSender,
    config: Partial<OtpServiceConfig> = {},
    private readonly now: () => number = Date.now,
  ) {
    this.config = { ...DEFAULT_OTP_CONFIG, ...config };
  }

  /** Normalise to E.164 (strip spaces, dashes, parentheses). */
  static normalize(phoneNumber: string): string {
    return phoneNumber.replace(/[\s\-()]/g, '');
  }

  async requestCode(phoneNumber: string, locale = 'en'): Promise<RequestResult> {
    const phone = OtpService.normalize(phoneNumber);
    if (!E164.test(phone)) {
      return { ok: false, error: 'Invalid phone number format' };
    }

    const now = this.now();

    const cooldown = this.cooldownUntil.get(phone);
    if (cooldown && cooldown > now) {
      return {
        ok: false,
        error: 'Please wait before requesting another code',
        retryAfterSec: Math.ceil((cooldown - now) / 1000),
      };
    }

    const window = this.rate.get(phone);
    if (window) {
      if (window.resetAt <= now) {
        this.rate.delete(phone);
      } else if (window.count >= this.config.maxSendsPerHour) {
        return {
          ok: false,
          error: 'Too many code requests. Try again later.',
          retryAfterSec: Math.ceil((window.resetAt - now) / 1000),
        };
      }
    }

    const code = this.generateCode();
    const message = this.formatMessage(code, locale);
    const sent = await this.sms.send(phone, message);
    if (!sent.success) {
      return { ok: false, error: sent.error ?? 'Failed to send SMS' };
    }

    this.pending.set(phone, {
      code,
      expiresAt: now + this.config.codeTtlMs,
      attempts: 0,
    });
    this.cooldownUntil.set(phone, now + this.config.cooldownMs);

    const win = this.rate.get(phone) ?? { count: 0, resetAt: now + 3_600_000 };
    win.count += 1;
    this.rate.set(phone, win);

    return { ok: true, expiresInSec: Math.floor(this.config.codeTtlMs / 1000) };
  }

  verifyCode(phoneNumber: string, code: string): VerifyResult {
    const phone = OtpService.normalize(phoneNumber);
    const pending = this.pending.get(phone);
    if (!pending) {
      return { ok: false, error: 'No pending verification' };
    }

    if (pending.expiresAt < this.now()) {
      this.pending.delete(phone);
      return { ok: false, error: 'Code expired' };
    }

    pending.attempts += 1;
    if (pending.attempts > this.config.maxVerifyAttempts) {
      this.pending.delete(phone);
      return { ok: false, error: 'Too many attempts' };
    }

    if (pending.code !== code) {
      return { ok: false, error: 'Invalid code' };
    }

    this.pending.delete(phone);
    // Once verified, clear cooldown so the user can proceed immediately.
    this.cooldownUntil.delete(phone);
    return { ok: true };
  }

  private generateCode(): string {
    let code = '';
    for (let i = 0; i < this.config.codeLength; i++) {
      code += randomInt(0, 10).toString();
    }
    return code;
  }

  private formatMessage(code: string, locale: string): string {
    if (locale === 'hi') {
      return `QuantChat: आपका सत्यापन कोड ${code} है। यह ${Math.floor(
        this.config.codeTtlMs / 60000,
      )} मिनट में समाप्त होगा।`;
    }
    return `QuantChat: your verification code is ${code}. It expires in ${Math.floor(
      this.config.codeTtlMs / 60000,
    )} minutes.`;
  }
}

/**
 * Dev/default SMS sender: logs the message instead of delivering. Real Twilio /
 * MSG91 adapters implement {@link SmsSender} and are selected by env config.
 * Returns success so the verification flow works end-to-end in development.
 */
export class LoggingSmsSender implements SmsSender {
  constructor(private readonly log: (msg: string) => void = () => {}) {}
  async send(phoneNumber: string, message: string): Promise<{ success: boolean }> {
    this.log(`[OTP][dev-sms] to=${phoneNumber} :: ${message}`);
    return { success: true };
  }
}
