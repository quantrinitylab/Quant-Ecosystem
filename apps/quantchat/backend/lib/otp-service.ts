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

import { createHash, createHmac, randomInt } from 'node:crypto';

export interface SmsSender {
  /** Deliver an SMS. Real adapters (AWS SNS / Twilio / MSG91) implement this. */
  send(phoneNumber: string, message: string): Promise<{ success: boolean; error?: string }>;
}

export interface AwsSnsConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  senderId?: string;
}

export interface OtpServiceConfig {
  codeLength: number;
  codeTtlMs: number;
  cooldownMs: number;
  maxSendsPerHour: number;
  maxVerifyAttempts: number;
  maxDailySends?: number;
  countryAllowlist?: string[];
}

export const DEFAULT_ALLOWED_COUNTRIES = ['+91', '+1', '+44', '+971', '+65', '+61', '+49', '+33'];

export const DEFAULT_OTP_CONFIG: OtpServiceConfig = {
  codeLength: 6,
  codeTtlMs: 5 * 60 * 1000,
  cooldownMs: 60 * 1000,
  maxSendsPerHour: 5,
  maxVerifyAttempts: 5,
  maxDailySends: 500,
  countryAllowlist: DEFAULT_ALLOWED_COUNTRIES,
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

// Known virtual/toll-free/dummy prefixes disallowed from SMS verification
const DISALLOWED_PREFIXES = [
  '+1800',
  '+1888',
  '+1877',
  '+1866',
  '+1855',
  '+1844',
  '+1900',
  '+910000000000',
];

export class OtpService {
  private readonly config: OtpServiceConfig;
  private readonly pending = new Map<string, PendingCode>();
  private readonly rate = new Map<string, RateWindow>();
  private readonly cooldownUntil = new Map<string, number>();
  private dailySendsCount = 0;
  private dailyWindowResetAt = 0;

  constructor(
    private readonly sms: SmsSender = new AwsSnsSmsSender(),
    config: Partial<OtpServiceConfig> = {},
    private readonly now: () => number = Date.now,
  ) {
    this.config = { ...DEFAULT_OTP_CONFIG, ...config };
    this.dailyWindowResetAt = this.now() + 86_400_000;
  }

  /** Normalise to E.164 (strip spaces, dashes, parentheses). */
  static normalize(phoneNumber: string): string {
    return phoneNumber.replace(/[\s\-()]/g, '');
  }

  /** Check if number belongs to an allowed country code prefix. */
  private isCountryAllowed(phone: string): boolean {
    const list = this.config.countryAllowlist ?? DEFAULT_ALLOWED_COUNTRIES;
    if (list.length === 0) return true;
    return list.some((prefix) => phone.startsWith(prefix));
  }

  async requestCode(phoneNumber: string, locale = 'en'): Promise<RequestResult> {
    const phone = OtpService.normalize(phoneNumber);
    if (!E164.test(phone)) {
      return { ok: false, error: 'Invalid phone number format' };
    }

    if (DISALLOWED_PREFIXES.some((prefix) => phone.startsWith(prefix))) {
      return { ok: false, error: 'Toll-free or virtual numbers not permitted' };
    }

    if (!this.isCountryAllowed(phone)) {
      return { ok: false, error: 'Destination country not supported for SMS verification' };
    }

    const now = this.now();

    // Daily system-wide spend guard (CH-3)
    if (now >= this.dailyWindowResetAt) {
      this.dailySendsCount = 0;
      this.dailyWindowResetAt = now + 86_400_000;
    }
    const maxDaily = this.config.maxDailySends ?? 500;
    if (this.dailySendsCount >= maxDaily) {
      return {
        ok: false,
        error: 'Daily SMS limit reached. Please try again tomorrow or sign in with Quant SSO.',
      };
    }

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

    this.dailySendsCount += 1;
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
 * Dev/default SMS sender: logs masked message instead of delivering.
 * Enforces zero-leak logging (OTP-1): all numeric OTP tokens are masked as [REDACTED]
 * regardless of codeLength (4, 6, 8, etc.).
 */
export class LoggingSmsSender implements SmsSender {
  constructor(private readonly log: (msg: string) => void = () => {}) {}
  async send(phoneNumber: string, message: string): Promise<{ success: boolean }> {
    // Redact all digit sequences so OTP never leaks to server logs for any code length
    const masked = message.replace(/\b\d+\b/g, '[REDACTED]');
    this.log(`[OTP][dev-sms] to=${phoneNumber} :: ${masked}`);
    return { success: true };
  }
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export function readAwsSnsConfig(override?: Partial<AwsSnsConfig>): AwsSnsConfig | null {
  const region = override?.region ?? env('AWS_REGION') ?? env('SNS_REGION');
  const accessKeyId = override?.accessKeyId ?? env('AWS_ACCESS_KEY_ID') ?? env('SNS_ACCESS_KEY_ID');
  const secretAccessKey =
    override?.secretAccessKey ?? env('AWS_SECRET_ACCESS_KEY') ?? env('SNS_SECRET_ACCESS_KEY');
  if (!region || !accessKeyId || !secretAccessKey) return null;
  const senderId = override?.senderId ?? env('SNS_SENDER_ID') ?? env('AWS_SNS_SENDER_ID');
  return { region, accessKeyId, secretAccessKey, ...(senderId ? { senderId } : {}) };
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Authentic AWS SNS SMS sender implementing {@link SmsSender}.
 *
 * Checks for AWS credentials (AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY).
 * Uses AWS SNS Publish REST API (SigV4) to send transactional SMS (AWS.SNS.SMS.SMSType: Transactional).
 * Falls back safely to LoggingSmsSender in test or development environments when AWS keys are absent.
 */
export class AwsSnsSmsSender implements SmsSender {
  private readonly fallback: LoggingSmsSender;

  constructor(
    private readonly configOverride?: Partial<AwsSnsConfig>,
    fallbackLogger?: (msg: string) => void,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.fallback = new LoggingSmsSender(fallbackLogger);
  }

  get isConfigured(): boolean {
    return readAwsSnsConfig(this.configOverride) !== null;
  }

  async send(phoneNumber: string, message: string): Promise<{ success: boolean; error?: string }> {
    const config = readAwsSnsConfig(this.configOverride);
    if (!config) {
      // Fail closed in production: missing credentials must reject rather than silently succeed
      if (process.env.NODE_ENV === 'production') {
        return {
          success: false,
          error: 'SMS_GATEWAY_NOT_CONFIGURED: AWS SNS credentials are required in production',
        };
      }
      return this.fallback.send(phoneNumber, message);
    }

    try {
      const host = `sns.${config.region}.amazonaws.com`;
      const params = new URLSearchParams({
        Action: 'Publish',
        Version: '2010-03-31',
        PhoneNumber: phoneNumber,
        Message: message,
        'MessageAttributes.entry.1.Name': 'AWS.SNS.SMS.SMSType',
        'MessageAttributes.entry.1.Value.DataType': 'String',
        'MessageAttributes.entry.1.Value.StringValue': 'Transactional',
      });
      if (config.senderId) {
        params.set('MessageAttributes.entry.2.Name', 'AWS.SNS.SMS.SenderID');
        params.set('MessageAttributes.entry.2.Value.DataType', 'String');
        params.set('MessageAttributes.entry.2.Value.StringValue', config.senderId);
      }

      const body = params.toString();
      const payloadHash = sha256Hex(body);
      const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
      const dateStamp = amzDate.slice(0, 8);

      const headers: Record<string, string> = {
        'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
        host,
        'x-amz-date': amzDate,
      };
      const signedHeaderNames = Object.keys(headers).sort();
      const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${headers[h]}\n`).join('');
      const signedHeaders = signedHeaderNames.join(';');
      const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, payloadHash].join(
        '\n',
      );

      const scope = `${dateStamp}/${config.region}/sns/aws4_request`;
      const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join(
        '\n',
      );
      const signingKey = hmac(
        hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, dateStamp), config.region), 'sns'),
        'aws4_request',
      );
      const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

      const response = await this.fetchFn(`https://${host}/`, {
        method: 'POST',
        headers: {
          ...headers,
          Authorization:
            `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, ` +
            `SignedHeaders=${signedHeaders}, Signature=${signature}`,
        },
        body,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return {
          success: false,
          error: `SNS Publish failed (${response.status}): ${text.slice(0, 400)}`,
        };
      }

      return { success: true };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  }
}
