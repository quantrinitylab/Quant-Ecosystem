import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UsageAnalyticsChart } from '../components/UsageAnalyticsChart';
import type { DailyUsagePoint } from '../hooks/useUsageAnalytics';

const series: DailyUsagePoint[] = [
  { date: '2026-06-18', tokens: 100, cost: 0.1, sessions: 1 },
  { date: '2026-06-19', tokens: 0, cost: 0, sessions: 0 },
  { date: '2026-06-20', tokens: 300, cost: 0.45, sessions: 2 },
];

const totals = { tokens: 400, cost: 0.55, sessions: 3 };

describe('UsageAnalyticsChart', () => {
  it('renders summary totals', () => {
    const html = renderToStaticMarkup(
      React.createElement(UsageAnalyticsChart, { series, totals, metric: 'tokens' }),
    );
    expect(html).toContain('400'); // tokens total
    expect(html).toContain('$0.55'); // cost total
    expect(html).toContain('Conversations');
  });

  it('renders one bar per day with the metric value', () => {
    const html = renderToStaticMarkup(
      React.createElement(UsageAnalyticsChart, { series, totals, metric: 'tokens' }),
    );
    const bars = html.match(/data-testid="usage-bar"/g) ?? [];
    expect(bars).toHaveLength(3);
    // The tallest bar (300 tokens) should be full height.
    expect(html).toContain('height:100%');
  });

  it('shows an empty-state message when there is no data', () => {
    const html = renderToStaticMarkup(
      React.createElement(UsageAnalyticsChart, {
        series: [],
        totals: { tokens: 0, cost: 0, sessions: 0 },
      }),
    );
    expect(html).toContain('No usage in this window yet.');
  });

  it('reflects the selected metric in the aria label', () => {
    const html = renderToStaticMarkup(
      React.createElement(UsageAnalyticsChart, { series, totals, metric: 'cost' }),
    );
    expect(html).toContain('Cost (USD) per day');
  });
});
