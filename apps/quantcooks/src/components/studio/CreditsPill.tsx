// ============================================================================
// QuantCooks Studio — Credits pill (spec §1.1 / §10.2)
//
// The pill shows the real credit ledger (quantcooks.get_credit_balance).
// CP-2 wired the backend port, so when the pill is rendered WITHOUT
// explicit props (the way StudioShell renders it) it performs that read
// itself on mount: a successful answer becomes the number, a
// CREDITS_NOT_CONFIGURED refusal keeps the honest dash, and any other
// failure shows the error state. Until the read answers, the dash is
// the resting state — never a guessed number.
//
// A hard-coded balance is the anti-pattern this component exists to
// replace: rendered with explicit props it stays purely presentational
// (the caller's number wins and no read is made), and with no props the
// number can ONLY arrive from the ledger response, via
// creditsPillLiveOutcome below.
// ============================================================================

import React, { useEffect, useState } from 'react';
import { apiClient } from '../../services/api-client';
import { CREDIT_TOOLS, type ToolInvokeOutcome } from '../../lib/studio/account';

export type CreditsPillState = 'ready' | 'loading' | 'error' | 'not-configured';

export interface CreditsPillProps {
  /** Real ledger balance. Pass only a number that came from the ledger. */
  balance?: number | null;
  /** Overrides the derived state (e.g. while a ledger read is in flight). */
  state?: CreditsPillState;
  /** Where the pill links when tapped (Account → Credits). Optional. */
  href?: string;
}

export function creditsPillState(props: CreditsPillProps): CreditsPillState {
  if (props.state) return props.state;
  return typeof props.balance === 'number' ? 'ready' : 'not-configured';
}

/**
 * Map a get_credit_balance invoke envelope onto what the pill may show.
 * The ONLY route by which a live number reaches the pill: the response's
 * `total` must be an actual number; a CREDITS_NOT_CONFIGURED refusal is
 * the dash; everything else (including a success envelope without the
 * number) is the error state — never a fabricated figure.
 */
export type CreditsPillLiveOutcome =
  | { kind: 'balance'; total: number }
  | { kind: 'not-configured' }
  | { kind: 'error' };

export function creditsPillLiveOutcome(response: ToolInvokeOutcome): CreditsPillLiveOutcome {
  if (response.success) {
    const total = response.data?.['total'];
    return typeof total === 'number' && Number.isFinite(total)
      ? { kind: 'balance', total }
      : { kind: 'error' };
  }
  return response.error?.code === 'CREDITS_NOT_CONFIGURED'
    ? { kind: 'not-configured' }
    : { kind: 'error' };
}

export const CreditsPill: React.FC<CreditsPillProps> = (props) => {
  // Explicit props = controlled (presentational, no read). No props =
  // the shell's pill: it reads the ledger itself.
  const controlled = props.state !== undefined || typeof props.balance === 'number';
  const [live, setLive] = useState<CreditsPillLiveOutcome | null>(null);

  useEffect(() => {
    if (controlled) return;
    let cancelled = false;
    apiClient
      .invokeTool(CREDIT_TOOLS.balance, { params: {} })
      .then((response) => {
        if (!cancelled) setLive(creditsPillLiveOutcome(response));
      })
      .catch(() => {
        if (!cancelled) setLive({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [controlled]);

  const effective: CreditsPillProps =
    !controlled && live?.kind === 'balance'
      ? { ...props, balance: live.total }
      : !controlled && live?.kind === 'error'
        ? { ...props, state: 'error' }
        : props;

  const state = creditsPillState(effective);
  const { href } = props;

  let body: React.ReactNode;
  if (state === 'ready') {
    body = <span data-testid="credits-balance">{effective.balance} credits</span>;
  } else if (state === 'loading') {
    body = <span data-testid="credits-loading">Loading credits…</span>;
  } else if (state === 'error') {
    body = <span data-testid="credits-error">Credits unavailable — try again</span>;
  } else {
    body = (
      <span data-testid="credits-not-configured" title="The Quant Credits ledger is not connected to QuantCooks yet">
        Credits · —
      </span>
    );
  }

  const className = 'studio-credits-pill';
  if (href) {
    return (
      <a className={className} href={href} aria-label="Your Quant Credits balance">
        {body}
      </a>
    );
  }
  return (
    <span className={className} aria-label="Your Quant Credits balance">
      {body}
    </span>
  );
};

export default CreditsPill;
