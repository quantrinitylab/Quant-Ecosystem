// ============================================================================
// Production secret validation — fail closed on known-published values.
// ============================================================================
//
// Every app backend builds its config with
//
//   jwtSecret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production'
//
// which is convenient for local development and fatal if it ever reaches
// production: the fallback is committed to a public repository, so every token
// in the ecosystem (all apps share the `quant-ecosystem` audience) becomes
// forgeable. Nothing looks broken when it happens — pods stay green, login
// works, health returns 200.
//
// `createApp` used to guard this with a length check alone. That is a proxy for
// the real property: `dev-secret-change-in-production` happens to be 31
// characters, so it failed by one character. Any future placeholder of 32+
// characters would have booted in production. This module checks the value, not
// just its length.

/** The development-only JWT secret that must never reach production. */
export const INSECURE_DEV_JWT_SECRET = 'dev-secret-change-in-production';

/** Minimum accepted secret length in production. */
export const MIN_PRODUCTION_SECRET_LENGTH = 32;

/**
 * Values rejected in production regardless of length. Compared case-insensitively
 * after trimming. Keep placeholders that appear in `.env.example` files here.
 */
const REJECTED_SECRET_VALUES = new Set(
  [
    INSECURE_DEV_JWT_SECRET,
    'dev-secret',
    'development',
    'change-me',
    'changeme',
    'secret',
    'jwt-secret',
    'test-secret',
    'local-secret',
    'your-secret-here',
    'replace-me',
  ].map((value) => value.toLowerCase()),
);

/**
 * Substrings that mark a value as a placeholder even when it is long enough,
 * e.g. `dev-secret-change-in-production-v2` or `changeme-please-32-characters!!`.
 */
const REJECTED_SECRET_PATTERNS = [
  'change-in-production',
  'change_in_production',
  'changeme',
  'change-me',
  'dev-secret',
  'placeholder',
  'example',
  'your-secret',
];

/** Thrown at boot when production configuration is insecure. */
export class InsecureSecretError extends Error {
  public readonly secretName: string;

  constructor(message: string, secretName: string) {
    super(`[FATAL] ${message}`);
    this.name = 'InsecureSecretError';
    this.secretName = secretName;
  }
}

export interface AssertSecretOptions {
  /** Environment variable name, used verbatim in the error message. */
  name: string;
  /** Where the real value comes from, appended to the error message. */
  provisionedBy?: string;
}

/**
 * Throws when `value` is unusable as a production secret: missing, blank, too
 * short, a known placeholder, or containing a placeholder marker.
 *
 * Call this only for production environments; development and test keep the
 * convenient fallbacks.
 */
export function assertProductionSecret(
  value: string | undefined,
  { name, provisionedBy }: AssertSecretOptions,
): string {
  const trimmed = value?.trim() ?? '';
  const source = provisionedBy ? ` It is provisioned by ${provisionedBy}.` : '';
  const fail = (reason: string): never => {
    throw new InsecureSecretError(
      `${reason} Production requires a real ${name}; committed placeholders are public, ` +
        `so accepting one would make every token in the ecosystem forgeable.${source}`,
      name,
    );
  };

  if (trimmed === '') {
    return fail(`${name} is not set.`);
  }

  const normalized = trimmed.toLowerCase();

  if (REJECTED_SECRET_VALUES.has(normalized)) {
    return fail(`${name} is still a published development placeholder.`);
  }

  const marker = REJECTED_SECRET_PATTERNS.find((pattern) => normalized.includes(pattern));
  if (marker) {
    return fail(`${name} looks like a placeholder (contains "${marker}").`);
  }

  if (trimmed.length < MIN_PRODUCTION_SECRET_LENGTH) {
    return fail(
      `${name} is ${trimmed.length} characters; at least ${MIN_PRODUCTION_SECRET_LENGTH} are required.`,
    );
  }

  return trimmed;
}
