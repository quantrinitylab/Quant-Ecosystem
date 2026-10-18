import type { EmailAddress } from '../../../types';

/**
 * SIA-P2-5: the Sent row's primary line is the RECIPIENT, never the sender.
 *
 * Self-rows (a message sent to self, or any row whose only visible name is the
 * sender's own handle) used to render just the handle — e.g. "kundan" — with no
 * signal that the name on the line is the recipient. Prefixing the whole line
 * with "To: " makes the direction of the delivery trail unambiguous.
 */
export function formatSentRecipientLine(to?: EmailAddress[] | null): string {
  const names = (to ?? [])
    .map((t) => t?.name || t?.email)
    .filter((v): v is string => !!v);
  return `To: ${names.length > 0 ? names.join(', ') : 'Unknown'}`;
}
