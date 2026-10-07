/**
 * QuantMail Shared Domain Constants & Helpers
 * Wave 16 Track 4 (Tasks M13 & M14)
 */

export const QUANT_INTERNAL_DOMAINS = [
  'quantmail.in',
  'quantrinity.in',
  'quantchat.online',
] as const;

export type QuantInternalDomain = (typeof QUANT_INTERNAL_DOMAINS)[number];

/**
 * Check whether a given email address or domain is an internal Quant ecosystem domain.
 * Accepts either an email address (e.g. 'alice@quantmail.in') or domain string (e.g. 'quantmail.in').
 */
export function isInternalDomain(emailOrDomain: string): boolean {
  if (!emailOrDomain || typeof emailOrDomain !== 'string') {
    return false;
  }
  const trimmed = emailOrDomain.trim().toLowerCase();
  const domain = trimmed.includes('@') ? (trimmed.split('@').pop() ?? '') : trimmed;
  return (QUANT_INTERNAL_DOMAINS as readonly string[]).includes(domain);
}

/**
 * Get the configured sender domain, falling back to 'quantmail.in'.
 */
export function getSenderDomain(): string {
  return process.env['MAIL_SENDER_DOMAIN'] ?? 'quantmail.in';
}
