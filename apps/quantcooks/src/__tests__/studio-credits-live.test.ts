// ============================================================================
// QuantCooks CP-2 — the live credits surfaces. Pins the switch Unit 10
// left ready: the account lib's envelope mappers (the ONLY route from a
// tool response to a number), the Credits/Usage panels rendering real
// ledger state when the port answers and the honest states when it
// refuses or fails, and the shell pill's live-outcome mapping. The
// not-configured defaults stay pinned in studio-account.test.ts and
// studio-jobstrip-credits.test.ts — this file pins the other side.
// ============================================================================

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import {
  connectionFromBalanceInvoke,
  historyFromHistoryInvoke,
  ledgerBalanceView,
  type LedgerConnection,
} from '../lib/studio/account';
import { CreditsPanel } from '../components/studio/CreditsPanel';
import { UsagePanel } from '../components/studio/UsagePanel';
import { CreditsPill, creditsPillLiveOutcome } from '../components/studio/CreditsPill';

const balanceData = { daily: 10, monthly: 50, purchased: 90, total: 150, held: 4 };

describe('account lib — balance envelope mapping (CP-2)', () => {
  it('a successful read becomes the connected connection, numbers verbatim', () => {
    const connection = connectionFromBalanceInvoke({ success: true, data: balanceData });
    expect(connection).toEqual({ status: 'connected', balance: balanceData });
    const view = ledgerBalanceView(connection);
    expect(view.kind).toBe('ready');
    expect(view).toMatchObject(balanceData);
  });

  it('a CREDITS_NOT_CONFIGURED refusal becomes the not-configured connection — never a number', () => {
    const connection = connectionFromBalanceInvoke({
      success: false,
      error: { code: 'CREDITS_NOT_CONFIGURED', message: 'not wired' },
    });
    expect(connection.status).toBe('not_configured');
    const view = ledgerBalanceView(connection);
    expect(Object.keys(view).sort()).toEqual(['code', 'kind', 'tool']);
    expect(Object.values(view).some((v) => typeof v === 'number')).toBe(false);
  });

  it('any other failure becomes the error connection with its real code and message', () => {
    const connection: LedgerConnection = connectionFromBalanceInvoke({
      success: false,
      error: { code: 'INVALID_RESPONSE', message: 'empty body' },
    });
    expect(connection).toEqual({ status: 'error', code: 'INVALID_RESPONSE', message: 'empty body' });
  });

  it('a success envelope missing the ledger numbers is an error, not a zero balance', () => {
    const connection = connectionFromBalanceInvoke({ success: true, data: { total: 0 } });
    expect(connection.status).toBe('error');
  });
});

describe('account lib — history envelope mapping (CP-2)', () => {
  it('maps entries verbatim (string and Date createdAt both land as ISO strings)', () => {
    const result = historyFromHistoryInvoke({
      success: true,
      data: {
        total: 2,
        entries: [
          {
            id: 'e2',
            entryType: 'debit',
            bucket: 'PURCHASED',
            amount: -1,
            reason: 'quantcooks tool invoke',
            sourceRef: 'res-1',
            createdAt: '2026-10-29T10:00:00.000Z',
          },
          {
            id: 'e1',
            entryType: 'purchase',
            bucket: 'PURCHASED',
            amount: 100,
            reason: null,
            sourceRef: null,
            createdAt: new Date('2026-10-29T09:00:00.000Z'),
          },
        ],
      },
    });
    expect(result.state).toBe('ready');
    if (result.state !== 'ready') throw new Error('unreachable');
    expect(result.total).toBe(2);
    expect(result.entries[0]).toMatchObject({ id: 'e2', amount: -1, entryType: 'debit' });
    expect(result.entries[1]?.createdAt).toBe('2026-10-29T09:00:00.000Z');
  });

  it('refusal → not_configured; other failure → error with the real message', () => {
    expect(
      historyFromHistoryInvoke({
        success: false,
        error: { code: 'CREDITS_NOT_CONFIGURED', message: 'x' },
      }).state,
    ).toBe('not_configured');
    expect(
      historyFromHistoryInvoke({ success: false, error: { code: 'BOOM', message: 'kaput' } }),
    ).toEqual({ state: 'error', message: 'kaput' });
  });
});

describe('CreditsPanel — live states (CP-2)', () => {
  it('connected: renders the real total, buckets and held amount', () => {
    const html = renderToStaticMarkup(
      React.createElement(CreditsPanel, {
        connection: { status: 'connected', balance: balanceData } satisfies LedgerConnection,
      }),
    );
    expect(html).toContain('data-testid="credits-balance-value"');
    expect(html).toContain('150 credits');
    expect(html).toContain('Daily 10');
    expect(html).toContain('Monthly 50');
    expect(html).toContain('Purchased 90');
    expect(html).toContain('4 credits are currently held');
    expect(html).not.toContain('credits-balance-not-configured');
    // The standing rules and twins survive the live state.
    expect(html).toContain('data-testid="credit-rule-no-expiry"');
    expect(html).toContain('quantcooks.list_credit_history');
  });

  it('connected with nothing held says so plainly', () => {
    const html = renderToStaticMarkup(
      React.createElement(CreditsPanel, {
        connection: {
          status: 'connected',
          balance: { ...balanceData, held: 0 },
        } satisfies LedgerConnection,
      }),
    );
    expect(html).toContain('No credits are currently held');
  });

  it('loading: no number while the read is in flight', () => {
    const html = renderToStaticMarkup(
      React.createElement(CreditsPanel, { connection: { status: 'loading' } }),
    );
    expect(html).toContain('data-testid="credits-balance-loading"');
    expect(html).not.toMatch(/>\s*\d[\d,]*\s+credits\s*</i);
  });

  it('error: the real code and message, still no number', () => {
    const html = renderToStaticMarkup(
      React.createElement(CreditsPanel, {
        connection: { status: 'error', code: 'INVALID_RESPONSE', message: 'empty body' },
      }),
    );
    expect(html).toContain('data-testid="credits-balance-error"');
    expect(html).toContain('INVALID_RESPONSE');
    expect(html).toContain('empty body');
    expect(html).not.toMatch(/>\s*\d[\d,]*\s+credits\s*</i);
  });
});

describe('UsagePanel — ledger history block (CP-2)', () => {
  const entries = [
    {
      id: 'e2',
      entryType: 'debit',
      bucket: 'PURCHASED',
      amount: -10,
      reason: 'quantcooks tool invoke',
      sourceRef: 'res-1',
      createdAt: '2026-10-29T10:00:00.000Z',
    },
    {
      id: 'e1',
      entryType: 'purchase',
      bucket: 'PURCHASED',
      amount: 100,
      reason: null,
      sourceRef: null,
      createdAt: '2026-10-29T09:00:00.000Z',
    },
  ];

  it('ready: renders the ledger rows with signed amounts verbatim', () => {
    const html = renderToStaticMarkup(
      React.createElement(UsagePanel, {
        activityState: 'ready',
        rows: [],
        ledgerState: 'ready',
        ledgerEntries: entries,
      }),
    );
    expect(html).toContain('data-testid="usage-ledger-ready"');
    expect(html).toContain('data-testid="ledger-entry"');
    expect(html).toContain('-10');
    expect(html).toContain('+100');
    expect(html).toContain('quantcooks tool invoke');
    expect(html).not.toContain('usage-ledger-not-configured');
  });

  it('ready but empty: an honest empty state, not a fabricated row', () => {
    const html = renderToStaticMarkup(
      React.createElement(UsagePanel, {
        activityState: 'ready',
        rows: [],
        ledgerState: 'ready',
        ledgerEntries: [],
      }),
    );
    expect(html).toContain('data-testid="usage-ledger-empty"');
    expect(html).not.toContain('ledger-entry');
  });

  it('error: the real message, no rows', () => {
    const html = renderToStaticMarkup(
      React.createElement(UsagePanel, {
        activityState: 'ready',
        rows: [],
        ledgerState: 'error',
        ledgerError: 'Backend unreachable',
      }),
    );
    expect(html).toContain('data-testid="usage-ledger-error"');
    expect(html).toContain('Backend unreachable');
    expect(html).not.toContain('ledger-entry');
  });
});

describe('CreditsPill — live outcome mapping (CP-2)', () => {
  it('a successful read yields the total — the only route to a live number', () => {
    expect(creditsPillLiveOutcome({ success: true, data: { total: 137 } })).toEqual({
      kind: 'balance',
      total: 137,
    });
  });

  it('a CREDITS_NOT_CONFIGURED refusal keeps the dash state', () => {
    expect(
      creditsPillLiveOutcome({
        success: false,
        error: { code: 'CREDITS_NOT_CONFIGURED', message: 'not wired' },
      }),
    ).toEqual({ kind: 'not-configured' });
  });

  it('other failures and malformed successes are the error state — never a number', () => {
    expect(
      creditsPillLiveOutcome({ success: false, error: { code: 'BOOM', message: 'x' } }),
    ).toEqual({ kind: 'error' });
    expect(creditsPillLiveOutcome({ success: true, data: {} })).toEqual({ kind: 'error' });
    expect(creditsPillLiveOutcome({ success: true, data: { total: '137' } })).toEqual({
      kind: 'error',
    });
  });

  it('the uncontrolled pill still renders the dash before any read answers (SSR-safe)', () => {
    const html = renderToStaticMarkup(React.createElement(CreditsPill, {}));
    expect(html).toContain('data-testid="credits-not-configured"');
    expect(html).toContain('Credits · —');
  });
});
