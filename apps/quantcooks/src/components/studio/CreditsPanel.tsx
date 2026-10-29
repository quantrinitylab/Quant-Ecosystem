// ============================================================================
// QuantCooks Studio — Credits & Plan panel (checklist row #66, specs §10.2)
//
// The trust surface. CP-2 wired the Quant Credits ledger read into the
// backend (quantcooks.get_credit_balance now answers where a ledger is
// configured), so this panel renders what the page's real read returned:
//  - 'connected' → the caller's actual balance — total, the three
//    buckets, and any credits currently held by open reservations —
//    read live from the ledger tool, never cached or composed here.
//  - 'not_configured' → the deployment has no ledger wired; the panel
//    renders that state and the product's standing credit rules, and
//    never a number (the not-configured view has no numeric field).
//  - 'error' → the read failed for another reason; the real code and
//    message are shown, still without a number.
// The default (no connection prop) stays the not-configured state, so a
// surface that does not perform the read cannot accidentally show one.
//
// Equally deliberate absences, each with its reason on the surface:
//  - No plan comparison table: no QuantCooks plans or prices exist
//    (final pricing is a Krish/CEO policy decision, CP-1 §6.3) — a table
//    of invented tiers would be the fabrication this unit exists to avoid.
//  - No top-up flow: checkout/billing is not wired (CP-2 wired the
//    ledger, not payments); the button is disabled with its reason
//    instead of opening a checkout that cannot complete.
//  - No budget-cap form: the stored budget rule QuantAI enforces at
//    quote time lands with CP-3 — a form that saved nowhere would be a
//    lie, so the panel states the design and shows no inputs.
// ============================================================================

import React from 'react';
import {
  CREDIT_RULES,
  CREDIT_TOOLS,
  LEDGER_CONNECTION,
  ledgerBalanceView,
  type LedgerBalanceView,
  type LedgerConnection,
} from '../../lib/studio/account';

export interface CreditsPanelProps {
  /** The ledger connection state. Defaults to the not-configured state. */
  connection?: LedgerConnection;
}

function BalanceBlock({ view }: { view: LedgerBalanceView }) {
  if (view.kind === 'ready') {
    return (
      <div className="studio-credits-balance" data-testid="credits-balance-ready">
        <p className="studio-credits-balance-state" data-testid="credits-balance-value">
          {view.total} credits
        </p>
        <p>
          Daily {view.daily} · Monthly {view.monthly} · Purchased {view.purchased} — read live
          from {view.tool}.{' '}
          {view.held > 0
            ? `${view.held} credits are currently held by open reservations and settle only when their jobs complete.`
            : 'No credits are currently held by open reservations.'}
        </p>
        <button type="button" disabled data-testid="credits-topup-disabled">
          Buy credits
        </button>
        <p className="studio-account-note">
          Top-up checkout is not wired yet, so this stays disabled rather than opening a flow
          that cannot finish.
        </p>
      </div>
    );
  }

  if (view.kind === 'loading') {
    return (
      <div className="studio-credits-balance" data-testid="credits-balance-loading">
        <p className="studio-credits-balance-state">Loading your balance…</p>
        <p>Reading {view.tool} — no figure is shown until the ledger answers.</p>
      </div>
    );
  }

  if (view.kind === 'error') {
    return (
      <div className="studio-credits-balance" data-testid="credits-balance-error">
        <p className="studio-credits-balance-state">
          Balance could not be read ({view.code}): {view.message}
        </p>
        <p>
          Nothing is shown in place of the real figure — an invented number would be worse than
          an honest failure. Try again from a fresh load.
        </p>
      </div>
    );
  }

  return (
    <div className="studio-credits-balance" data-testid="credits-balance-not-configured">
      <p className="studio-credits-balance-state">
        Balance unavailable — the Quant Credits ledger is not connected to QuantCooks yet (
        {view.code}).
      </p>
      <p>
        When the ledger is wired on this deployment, your real balance appears here, read live
        from {view.tool}. Until then this panel will never show an invented number.
      </p>
      <button type="button" disabled data-testid="credits-topup-disabled">
        Buy credits
      </button>
      <p className="studio-account-note">
        Top-up checkout is not wired yet, so this stays disabled rather than opening a flow
        that cannot finish.
      </p>
    </div>
  );
}

export const CreditsPanel: React.FC<CreditsPanelProps> = ({ connection = LEDGER_CONNECTION }) => {
  const balance = ledgerBalanceView(connection);

  return (
    <section className="studio-account-panel studio-credits" data-testid="credits-panel">
      <h2>Credits &amp; Plan</h2>

      <BalanceBlock view={balance} />

      <div className="studio-credits-rules" data-testid="credits-rules">
        <h3>How Quant Credits work here — the standing rules</h3>
        <ul>
          {CREDIT_RULES.map((rule) => (
            <li key={rule.id} data-testid={`credit-rule-${rule.id}`}>
              <strong>{rule.title}.</strong> {rule.text}
            </li>
          ))}
        </ul>
      </div>

      <div className="studio-credits-plans" data-testid="credits-plans-unavailable">
        <h3>Plans</h3>
        <p>
          No QuantCooks plans are on sale yet, so there is no plan comparison table here — a table
          of tiers and prices that do not exist would be invented. When plans launch, the
          comparison (tiers × models × generations, monthly/annual) is published on this panel
          before anything is charged.
        </p>
      </div>

      <div className="studio-credits-budget" data-testid="credits-budget-unavailable">
        <h3>Monthly budget cap</h3>
        <p>
          You will be able to set a monthly cap and a warn threshold here, and QuantAI will enforce
          them at quote time through {CREDIT_TOOLS.quote}. The stored budget rule lands with the
          delegation work (CP-3), so there is deliberately no cap form yet — a form that saved
          nowhere would be a lie.
        </p>
      </div>

      <p className="studio-account-twins">
        QuantAI twins: {CREDIT_TOOLS.balance} · {CREDIT_TOOLS.history} · {CREDIT_TOOLS.quote}
      </p>
    </section>
  );
};

export default CreditsPanel;
