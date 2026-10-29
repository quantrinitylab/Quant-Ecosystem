// ============================================================================
// QuantCooks Studio — Usage panel (checklist row #67, specs §10.3)
//
// Two different things live on this panel and are never blurred:
//  1. JOB ACTIVITY — real records. P0-4 export jobs and C-2 EffectCraft
//     renders are the caller's own backend job rows; the table renders
//     them with the credit figure each record carries (exports: none —
//     not charged; craft renders: the recorded creditCost with its
//     metering note). This is the honest "recent activity" that exists
//     today, and the panel says exactly what it is.
//  2. THE CREDIT LEDGER — quantcooks.list_credit_history, wired by CP-2:
//     real entries where the deployment has a ledger, and the
//     CREDITS_NOT_CONFIGURED state where it does not. It gets its own
//     block, in its own words, so nobody mistakes job activity for a
//     ledger. Amounts are the ledger's signed figures, verbatim.
// Plus the panel's two standing controls in their honest states: the
// auto-publish switch (off; publishing is always explicit, specs §0.4 —
// and disabled, because no preference store exists for it yet) and
// connected-surface status (nothing can be connected until the CP-5
// Connect QuantAI surface exists, so there are no connection rows and
// nothing to revoke — stated, not faked).
// ============================================================================

import React from 'react';
import {
  CREDIT_TOOLS,
  activitySummary,
  type ActivityRow,
  type LedgerEntryView,
} from '../../lib/studio/account';

export type UsageActivityState = 'loading' | 'error' | 'ready';

export type UsageLedgerState = 'not_configured' | 'loading' | 'error' | 'ready';

export interface UsagePanelProps {
  activityState: UsageActivityState;
  /** The real error message when activityState is 'error'. */
  activityError?: string | null;
  /** Real job rows (account.ts mergeActivity output) when ready. */
  rows?: ActivityRow[];
  /** Ledger history state. Defaults to 'not_configured' (no read made). */
  ledgerState?: UsageLedgerState;
  /** Real ledger entries (account.ts historyFromHistoryInvoke) when ready. */
  ledgerEntries?: LedgerEntryView[];
  /** The real error message when ledgerState is 'error'. */
  ledgerError?: string | null;
}

function LedgerBlock({
  state,
  entries,
  error,
}: {
  state: UsageLedgerState;
  entries: LedgerEntryView[];
  error?: string | null;
}) {
  if (state === 'loading') {
    return (
      <div className="studio-usage-ledger" data-testid="usage-ledger-loading">
        <h3>Credit ledger history</h3>
        <p>Loading your ledger history from {CREDIT_TOOLS.history}…</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="studio-usage-ledger" data-testid="usage-ledger-error">
        <h3>Credit ledger history</h3>
        <p>
          Ledger history could not be loaded{error ? `: ${error}` : ''}. Nothing here is cached
          or invented — try again from a fresh load.
        </p>
      </div>
    );
  }

  if (state === 'ready') {
    return (
      <div className="studio-usage-ledger" data-testid="usage-ledger-ready">
        <h3>Credit ledger history</h3>
        {entries.length === 0 ? (
          <p data-testid="usage-ledger-empty">
            No ledger entries yet. Grants, holds, settlements and released holds on your account
            will appear here as {CREDIT_TOOLS.history} records them.
          </p>
        ) : (
          <table className="studio-usage-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Entry</th>
                <th>Bucket</th>
                <th>Credits</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} data-testid="ledger-entry">
                  <td>{entry.createdAt}</td>
                  <td>{entry.entryType}</td>
                  <td>{entry.bucket}</td>
                  <td>{entry.amount > 0 ? `+${entry.amount}` : entry.amount}</td>
                  <td>{entry.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  return (
    <div className="studio-usage-ledger" data-testid="usage-ledger-not-configured">
      <h3>Credit ledger history</h3>
      <p>
        {CREDIT_TOOLS.history} returns CREDITS_NOT_CONFIGURED on this deployment, so there is no
        ledger table yet — no held, settled or refunded entries can be listed because no ledger
        is recording them here. When the ledger is wired on this deployment, this is where
        per-action history (date, tool, model, credits, and the asset each job produced)
        appears, with failed jobs showing as refunded from the record itself.
      </p>
    </div>
  );
}

function ChargeCell({ row }: { row: ActivityRow }) {
  if (row.charge.kind === 'not_charged') {
    return <span data-testid="usage-charge-not-charged">Not charged</span>;
  }
  return (
    <span>
      <span data-testid="usage-charge-recorded">{row.charge.credits} credits recorded</span>
      <span className="studio-account-note"> {row.charge.note}</span>
    </span>
  );
}

export const UsagePanel: React.FC<UsagePanelProps> = ({
  activityState,
  activityError,
  rows = [],
  ledgerState = 'not_configured',
  ledgerEntries = [],
  ledgerError,
}) => {
  const summary = activitySummary(rows);

  return (
    <section className="studio-account-panel studio-usage" data-testid="usage-panel">
      <h2>Usage</h2>

      <div className="studio-usage-activity" data-testid="usage-activity">
        <h3>Job activity</h3>
        <p className="studio-account-note">
          Your real job records — exports and EffectCraft renders — with the credit figure each
          record carries. This is job activity, not the credit ledger (that is the next block).
          Export jobs join this same table when the exports list read is wired to the client; the
          per-project list exists on the backend today.
        </p>

        {activityState === 'loading' && <p data-testid="usage-loading">Loading your job activity…</p>}

        {activityState === 'error' && (
          <p data-testid="usage-error">
            Job activity could not be loaded{activityError ? `: ${activityError}` : ''}. Nothing
            here is cached or invented — try again from a fresh load.
          </p>
        )}

        {activityState === 'ready' && rows.length === 0 && (
          <p data-testid="usage-empty">
            No job activity yet. Exports you run and EffectCraft renders you start will appear here
            with their real status and recorded cost.
          </p>
        )}

        {activityState === 'ready' && rows.length > 0 && (
          <>
            <p data-testid="usage-summary">
              {summary.total} job{summary.total === 1 ? '' : 's'} · {summary.completed} completed ·{' '}
              {summary.failed} failed · {summary.inProgress} in progress
            </p>
            <table className="studio-usage-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Action</th>
                  <th>Status</th>
                  <th>Credits</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.kind}-${row.id}`} data-testid="usage-row">
                    <td>{row.createdAt}</td>
                    <td>{row.action}</td>
                    <td>
                      {row.status}
                      {row.status === 'FAILED' && row.error ? (
                        <span className="studio-account-error"> — {row.error}</span>
                      ) : null}
                    </td>
                    <td>
                      <ChargeCell row={row} />
                    </td>
                    <td>
                      {row.outputUrl ? (
                        <a href={row.outputUrl}>Open result</a>
                      ) : row.outputAssetId ? (
                        <a href="/assets">View in Assets</a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <LedgerBlock state={ledgerState} entries={ledgerEntries} error={ledgerError} />

      <div className="studio-usage-autopublish" data-testid="usage-autopublish">
        <h3>Auto-publish</h3>
        <button
          type="button"
          role="switch"
          aria-checked="false"
          disabled
          data-testid="usage-autopublish-disabled"
        >
          Auto-publish: Off
        </button>
        <p className="studio-account-note">
          Off, and it stays a deliberate choice: publishing is always an explicit tap, never a side
          effect. The preference store behind this switch does not exist yet, so the switch is
          disabled rather than decorative.
        </p>
      </div>

      <div className="studio-usage-connections" data-testid="usage-connections-none">
        <h3>Connected surfaces</h3>
        <p>
          No connected surfaces. MCP and CLI connections arrive with the Connect QuantAI surface
          (CP-5); when they exist, they will be listed here and revocable here. Nothing is
          connected to this account today.
        </p>
      </div>
    </section>
  );
};

export default UsagePanel;
