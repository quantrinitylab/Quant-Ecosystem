/**
 * EmailSignaturePicker — the per-message signature switch (fix/qm-multiple-signatures).
 *
 * Gmail's General settings support multiple signatures with a per-address
 * default plus an "Insert signature" picker in compose. QuantMail had the
 * backend for that (a signature list with an `isDefault` flag) but the
 * composer only ever loaded the default's HTML, so a formal and a casual
 * signature could not be picked per message.
 *
 * This is a deliberately dumb presentational control: the composer owns the
 * list, the selection, and what gets appended on Send; this renders the
 * `<select>` and reports the chosen id. It renders nothing about a signature
 * it was not given — when the account has one signature the composer does
 * not mount it at all, so a single-signature account sees no new chrome.
 *
 * Styling follows the composer signature card: full-border frame (never a
 * divider line), pure-black surfaces via the theme variables, Mail-orange
 * focus ring, and a 44px touch floor so the control is thumb-usable.
 */
import type { EmailSignatureOption } from '../lib/email-signature-preference';

export interface EmailSignaturePickerProps {
  signatures: EmailSignatureOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function EmailSignaturePicker({
  signatures,
  selectedId,
  onSelect,
}: EmailSignaturePickerProps) {
  // No visible label text here: the composer card already carries the
  // "Signature" heading beside this control, and the select itself carries
  // aria-label="Signature" for the accessible name.
  return (
    <label className="inline-flex min-h-touch items-center gap-2 text-xs text-[var(--quant-muted-foreground)]">
      <select
        id="composer-signature-picker"
        aria-label="Signature"
        value={selectedId ?? ''}
        onChange={(event) => onSelect(event.target.value)}
        className="min-h-touch min-w-0 max-w-[220px] truncate rounded-lg border border-[var(--quant-border)] bg-[var(--quant-background)] px-2 text-xs font-medium text-[var(--quant-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
      >
        {signatures.map((signature) => (
          <option key={signature.id} value={signature.id}>
            {signature.name}
            {signature.isDefault ? ' (Default)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
