/**
 * Composer send-readiness validation — the QM-UIUX-024 single source of truth.
 *
 * Moved here (from EmailComposer.tsx) so BOTH composers — the full
 * `EmailComposer` and the docked `DockedComposer` — derive their send
 * behaviour from exactly one implementation: `getSendBlockReason` drives
 * hard blocks (Send button disabled + error toast), `needsEmptyBodyConfirm`
 * drives the Gmail-style empty-body confirm, and `getSendBlockReaction`
 * names the missing field for Quanty. Duplicating the field-order logic in
 * two files is what QM-UIUX-024 was created to prevent.
 *
 * `EmailComposer.tsx` re-exports these names so existing importers and tests
 * keep working unchanged.
 */
import { getInvalidRecipientReason } from '../lib/email-validation';

/**
 * Send-readiness validation for the composer (QM-UIUX-024).
 *
 * SINGLE SOURCE OF TRUTH: both the Send button's `disabled` attribute and
 * `handleSend`'s error toasts derive from this, so the button can never look
 * tappable while tapping it would just toast an error.
 *
 * Returns the exact error message shown to the user, or `null` when the
 * composer is send-ready. Validation is intentionally strict — To and
 * subject are required hard blocks, and every recipient address must be
 * well-formed (a malformed chip blocks the send with a named reason instead
 * of failing on a server round-trip). Weakening validation is not allowed;
 * if a field ever becomes optional, that decision lives here, in one place,
 * and the disabled state follows it automatically.
 *
 * An EMPTY BODY is deliberately NOT a block: it is a confirm, not an error.
 * `needsEmptyBodyConfirm` (below) covers exactly that case — recipients and
 * subject valid, body empty — so a send-anyway path exists (Gmail-style
 * "Send this message without text in the body?") and attached-only emails
 * can be sent. Before this change an empty body hard-blocked with no
 * override anywhere, which made sending just a file impossible.
 *
 * `recipients` carries the To/Cc/Bcc chips; the malformed-address block sits
 * right after the empty-To block and before subject, in the order a user
 * fixes the form top-down. Callers must pass the same recipient list `to`
 * was derived from, so the string check and the address check agree.
 */
export function getSendBlockReason(
  to: string,
  subject: string,
  body: string,
  recipients: Array<{ email: string }> = [],
): string | null {
  if (!to.trim()) return 'Please specify at least one recipient (To:)';
  const invalidReason = getInvalidRecipientReason(recipients);
  if (invalidReason) return invalidReason;
  if (!subject.trim()) return 'Please enter an email subject';
  return null;
}

/**
 * Whether sending needs the Gmail-style empty-body confirm.
 *
 * True exactly when nothing hard-blocks the send (`getSendBlockReason`
 * returns `null`) but the body is empty: recipients valid, subject present,
 * body missing. Callers show a confirm ("Send this message without text in
 * the body?") with an explicit send-anyway override, BEFORE the undo-send
 * countdown is queued — the 10s undo window must never be promised for a
 * send the user never confirmed.
 */
export function needsEmptyBodyConfirm(
  to: string,
  subject: string,
  body: string,
  recipients: Array<{ email: string }> = [],
): boolean {
  return getSendBlockReason(to, subject, body, recipients) === null && !body.trim();
}

/**
 * Which Quanty reaction a blocked (or unconfirmed) send announces (QM-UIUX-025).
 *
 * Mirrors `getSendBlockReason` field-for-field and in the same order, so the
 * mascot and the error toast can never disagree about what is missing.
 * Before this, every block — missing subject and missing body included —
 * fired `mail:noRecipients`, a copy-paste bug that made Quanty react "no
 * recipients" to problems that had nothing to do with recipients.
 *
 * One deliberate asymmetry: a missing body returns `mail:noBody` while
 * `getSendBlockReason` returns `null`, because an empty body is a confirm,
 * not a block. The reaction still names the field so the confirm-cancel
 * path can announce the unfinished draft the same way a block would. A
 * malformed recipient address maps to `mail:noRecipients` — it is a
 * recipient problem, in the same position as in `getSendBlockReason`.
 */
export function getSendBlockReaction(
  to: string,
  subject: string,
  body: string,
  recipients: Array<{ email: string }> = [],
): 'mail:noRecipients' | 'mail:noSubject' | 'mail:noBody' | null {
  if (!to.trim()) return 'mail:noRecipients';
  if (getInvalidRecipientReason(recipients)) return 'mail:noRecipients';
  if (!subject.trim()) return 'mail:noSubject';
  if (!body.trim()) return 'mail:noBody';
  return null;
}
