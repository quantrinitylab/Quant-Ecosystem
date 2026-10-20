'use client';

/**
 * Settings → Security: how outgoing mail is authorised.
 *
 * This card used to be titled "Session & credentials" and carried two rows:
 *
 * 1. A "device key" row with a "Not set up" pill. That row was the only
 *    such reference in the entire codebase, and nothing on this screen — or
 *    anywhere else — generated such a key. A status the user can never act on
 *    is a fake control, so the row is gone rather than sitting here
 *    pretending.
 *
 * 2. "DKIM & SPF" with a "Configured" pill. Nothing on the page probes that
 *    status: it is a deployment fact, not a live check, and a status that
 *    cannot fail is not a status. It is stated below as plain configuration
 *    text — no badge, no colour tier.
 */

import { SettingsSection } from './SettingsPrimitives';

export function MailAuthCard() {
  return (
    <SettingsSection
      title="Outgoing mail"
      description="How mail you send is signed and authorised before it reaches the recipient."
    >
      <div className="py-2">
        <p className="text-[13px] font-medium text-[var(--quant-foreground)]">DKIM &amp; SPF</p>
        <p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">
          Outgoing mail is signed for quantmail.in through AWS SES
        </p>
      </div>
    </SettingsSection>
  );
}
