// ============================================================================
// QuantMail identity / addressing configuration.
//
// Every QuantMail user gets a first-class address that IS their identity across
// the whole Quant ecosystem (like a Gmail address, but unified). The domain is
// env-configurable so it can move to `quantmail.com` / `quantrinity.in` the
// moment those are acquired — today it resolves to a domain we actually own.
// ============================================================================

/** The domain QuantMail addresses are issued under (e.g. `alex@quantmail.in`). */
export const QUANT_MAIL_DOMAIN = process.env.NEXT_PUBLIC_QUANT_MAIL_DOMAIN ?? 'quantmail.in';

/** Lowercase, dot/underscore/dash + alphanumerics; 3–30 chars; must start alnum. */
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;

/** Normalize a raw username input into the canonical handle form. */
export function normalizeUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
}

/** True when the (already-normalized) username is a valid QuantMail handle. */
export function isValidUsername(username: string): boolean {
  return USERNAME_RE.test(username);
}

/** Build the full QuantMail address for a handle. */
export function toQuantAddress(username: string): string {
  return `${normalizeUsername(username)}@${QUANT_MAIL_DOMAIN}`;
}
