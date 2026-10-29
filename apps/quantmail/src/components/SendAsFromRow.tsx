'use client';

import { useEffect, useState } from 'react';
import { apiClient, type SendAsIdentity } from '../services/api-client';

/**
 * fix/qm-accounts-import: the composer's From picker.
 *
 * Loads the caller's VERIFIED send-as identities (Settings → Account →
 * Accounts and Import) and renders a From row above To. Renders nothing while
 * loading and nothing at all when there are no verified aliases — a From
 * picker with a single option is a control that changes nothing, and an
 * unverified address can never send (the backend 403s it), so offering one
 * would be a dead end the user taps.
 *
 * The selected value is the identity id (or null for the account's own
 * address); the composer passes it as `sendAsId` on compose and on draft
 * updates.
 */
export function useVerifiedSendAsIdentities(): SendAsIdentity[] | null {
  const [identities, setIdentities] = useState<SendAsIdentity[] | null>(null);

  useEffect(() => {
    let alive = true;
    void apiClient
      .getSendAsIdentities()
      .then((response) => {
        if (!alive) return;
        setIdentities(
          response.success && Array.isArray(response.data)
            ? response.data.filter((identity) => identity.verified)
            : [],
        );
      })
      .catch(() => {
        // A failed list must not break the composer: no aliases offered, the
        // account's own address stays the From, exactly as before this
        // feature existed.
        if (alive) setIdentities([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  return identities;
}

export function SendAsFromRow({
  value,
  onChange,
  primaryEmail,
  primaryName,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  primaryEmail: string;
  primaryName: string;
}) {
  const identities = useVerifiedSendAsIdentities();
  if (!identities || identities.length === 0) return null;

  const labelFor = (identity: SendAsIdentity) =>
    identity.displayName ? `${identity.displayName} <${identity.email}>` : identity.email;

  return (
    <div className="relative flex items-start gap-2 sm:gap-3 w-full">
      <span className="flex w-12 shrink-0 select-none items-center gap-0.5 pt-2 text-xs font-semibold text-[var(--quant-muted-foreground)] sm:w-16">
        <span>From</span>:
      </span>
      <div className="min-w-0 flex-1">
        <select
          aria-label="Send from address"
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
          className="w-full rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] px-3 py-2 text-sm text-[var(--quant-foreground)] outline-none transition-[border-color,box-shadow] focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/20"
        >
          <option value="">
            {primaryName ? `${primaryName} <${primaryEmail}>` : primaryEmail}
          </option>
          {identities.map((identity) => (
            <option key={identity.id} value={identity.id}>
              {labelFor(identity)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
