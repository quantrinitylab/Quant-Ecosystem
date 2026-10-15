/**
 * Email-address format validation for the compose path.
 *
 * SINGLE SOURCE OF TRUTH for "does this string look like a deliverable email
 * address" anywhere a user types recipients: RecipientChipInput (inline chip
 * flags), EmailComposer's send-button contract (getSendBlockReason /
 * getSendBlockReaction) and DockedComposer's handleSend guard all import from
 * here, so the inline flags, the Send button's disabled state and the send
 * guards can never disagree.
 *
 * The shape intentionally matches the regex ContactGroupModal already used
 * for contact emails — local@domain.tld, no RFC-5322 rabbit hole.
 *
 * Bare handles ("kundan") are INVALID here on purpose: the composer must
 * show the user exactly what will be addressed. Gmail parity: a malformed
 * recipient gets a red inline flag and a named block reason, never a silent
 * chip that fails on a server round-trip.
 */

const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when `email` has the shape local@domain.tld (surrounding whitespace ignored). */
export function isValidEmail(email: string): boolean {
  return EMAIL_FORMAT_RE.test((email || '').trim());
}

export interface Emailable {
  email: string;
}

/**
 * Named block reason for the FIRST malformed recipient in the list, or null
 * when every address is valid. Empty entries are skipped — "no recipient at
 * all" is the empty-To block's job, not this one's.
 */
export function getInvalidRecipientReason(recipients: Emailable[]): string | null {
  for (const r of recipients) {
    const email = (r?.email || '').trim();
    if (!email) continue;
    if (!isValidEmail(email)) {
      return `"${email}" is not a valid email address`;
    }
  }
  return null;
}

/**
 * Exclude malformed addresses from a recipient list BEFORE it leaves the
 * client. The backend's compose/updateDraft schemas validate recipients with
 * `z.string().email()`, so a malformed address in a payload is a guaranteed
 * 400 — shipping it only poisons the draft autosave (the save starts failing
 * while the real problem is the red chip the user hasn't fixed yet). The
 * committed chip itself is KEPT and flagged inline (RecipientChipInput) with
 * the send hard-blocked (getSendBlockReason), so excluding it from the wire
 * payload loses no information: it was never deliverable.
 *
 * Apply at every payload-build site (compose autosave, send, host onSaveDraft
 * adapters) — never at chip-commit time, so the user still sees exactly what
 * they typed and can fix it.
 */
export function filterValidRecipients<T extends Emailable>(recipients: T[]): T[] {
  return recipients.filter((r) => isValidEmail(r?.email || ''));
}
