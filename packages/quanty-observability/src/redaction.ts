/**
 * Quanty redaction utility.
 *
 * Strips secrets and PII from payloads before they are logged, exported, or
 * shown in the visible mode UI. Guarantee: any value stored under a
 * sensitive key name is replaced with REDACTED and never appears in the
 * output — keys are never logged.
 *
 * Key-based redaction is the primary mechanism. Value-level rules cover the
 * common cases where a secret travels without a telling key name:
 * credential-scheme strings ("Bearer ..."), email addresses (local part
 * masked, domain kept for debuggability), and URLs carrying sensitive query
 * parameters or embedded passwords.
 *
 * The input is never mutated; a redacted deep copy is returned. Circular
 * references are replaced with CIRCULAR instead of throwing.
 */

export const REDACTED = '[REDACTED]';
export const CIRCULAR = '[Circular]';

/** Substrings matched (case-insensitively) against object key names. */
const SENSITIVE_KEY_SUBSTRINGS = [
  'password',
  'passwd',
  'secret',
  'token',
  'api_key',
  'apikey',
  'access_key',
  'accesskey',
  'private_key',
  'privatekey',
  'client_secret',
  'authorization',
  'bearer',
  'credential',
  'otp',
  'totp',
  'ssn',
  'cvv',
  'cvc',
  'card_number',
  'cardnumber',
  'session_token',
  'refresh_token',
  'id_token',
];

/** Key names redacted only on exact (case-insensitive) match. */
const SENSITIVE_KEY_EXACT = new Set(['pwd', 'pin']);

const CREDENTIAL_SCHEME_RE = /^(bearer|basic|token)\s+\S+$/i;

export interface RedactionOptions {
  /** Additional sensitive key matchers: substring (string) or pattern. */
  extraSensitiveKeys?: (string | RegExp)[];
  /** Mask the local part of email addresses. Defaults to true. */
  maskEmail?: boolean;
}

export class Redactor {
  private readonly extra: (string | RegExp)[];
  readonly maskEmail: boolean;

  constructor(options: RedactionOptions = {}) {
    this.extra = options.extraSensitiveKeys ?? [];
    this.maskEmail = options.maskEmail ?? true;
  }

  isSensitiveKey(key: string): boolean {
    const lower = key.toLowerCase();
    if (SENSITIVE_KEY_EXACT.has(lower)) return true;
    if (SENSITIVE_KEY_SUBSTRINGS.some((s) => lower.includes(s))) return true;
    return this.extra.some((rule) =>
      typeof rule === 'string' ? lower.includes(rule.toLowerCase()) : rule.test(key),
    );
  }

  /** Deep-copy `value` with every secret replaced. Never mutates the input. */
  redact<T>(value: T): T {
    return redactValue(value, this, []) as T;
  }
}

function redactValue(value: unknown, redactor: Redactor, stack: object[]): unknown {
  if (typeof value === 'string') return redactString(value, redactor);
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (stack.includes(value)) return CIRCULAR;
  stack.push(value);
  let out: unknown;
  if (Array.isArray(value)) {
    out = value.map((item) => redactValue(item, redactor, stack));
  } else {
    const record: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      record[key] = redactor.isSensitiveKey(key) ? REDACTED : redactValue(nested, redactor, stack);
    }
    out = record;
  }
  stack.pop();
  return out;
}

/**
 * Linear-scan equivalent of the email shape previously matched by
 * /^[^\s@]+@[^\s@]+\.[^\s@]+$/. That regex backtracks polynomially on
 * inputs whose domain contains many '.' characters (CodeQL
 * js/polynomial-redos), so the check is done by hand instead: no whitespace
 * anywhere, exactly one '@' with a non-empty local part, and a '.' inside
 * the domain with at least one character on both sides of it.
 */
function isEmailAddress(value: string): boolean {
  let atIndex = -1;
  for (let i = 0; i < value.length; i++) {
    const ch = value.charAt(i);
    if (/\s/.test(ch)) return false;
    if (ch === '@') {
      if (atIndex !== -1) return false;
      atIndex = i;
    }
  }
  if (atIndex <= 0) return false;
  // The domain dot must be neither the domain's first nor its last character.
  for (let i = atIndex + 2; i < value.length - 1; i++) {
    if (value.charAt(i) === '.') return true;
  }
  return false;
}

function redactString(value: string, redactor: Redactor): string {
  if (CREDENTIAL_SCHEME_RE.test(value)) return REDACTED;
  if (redactor.maskEmail && isEmailAddress(value)) {
    return `***${value.slice(value.indexOf('@'))}`;
  }
  if (value.includes('://')) {
    const redacted = redactUrl(value, redactor);
    if (redacted !== undefined) return redacted;
  }
  return value;
}

function redactUrl(value: string, redactor: Redactor): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  let changed = false;
  if (url.password) {
    url.password = REDACTED;
    changed = true;
  }
  for (const key of [...url.searchParams.keys()]) {
    if (redactor.isSensitiveKey(key)) {
      url.searchParams.set(key, REDACTED);
      changed = true;
    }
  }
  return changed ? url.toString() : value;
}

/** Convenience: redact with default options. */
export function redactSecrets<T>(value: T, options?: RedactionOptions): T {
  return new Redactor(options).redact(value);
}

/**
 * Redact then JSON-serialize for log lines. The returned string never
 * contains a raw secret that was stored under a sensitive key.
 */
export function toLoggableJson(value: unknown, options?: RedactionOptions): string {
  const json = JSON.stringify(redactSecrets(value, options));
  return json === undefined ? 'undefined' : json;
}
