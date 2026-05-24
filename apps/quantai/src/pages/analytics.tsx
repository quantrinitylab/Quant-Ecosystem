// ============================================================================
// QuantAI - Analytics Page
// ============================================================================

import type { AnalyticsData } from '../types';

interface AnalyticsPageProps { data: AnalyticsData; }

export function AnalyticsPage({ data }: AnalyticsPageProps) {
  return { type: 'div', className: 'analytics-page', children: [
    { type: 'h1', text: 'AI Analytics' },
    { type: 'div', className: 'metrics-grid', children: [
      { type: 'div', className: 'metric', children: [{ type: 'h3', text: 'Total Requests' }, { type: 'span', text: data.totalRequests.toLocaleString() }] },
      { type: 'div', className: 'metric', children: [{ type: 'h3', text: 'Total Tokens' }, { type: 'span', text: `${(data.totalTokens / 1000000).toFixed(1)}M` }] },
      { type: 'div', className: 'metric', children: [{ type: 'h3', text: 'Total Cost' }, { type: 'span', text: `$${data.totalCost.toFixed(2)}` }] },
      { type: 'div', className: 'metric', children: [{ type: 'h3', text: 'Avg Latency' }, { type: 'span', text: `${data.averageLatency}ms` }] },
      { type: 'div', className: 'metric', children: [{ type: 'h3', text: 'Error Rate' }, { type: 'span', text: `${(data.errorRate * 100).toFixed(2)}%` }] },
    ]},
    { type: 'div', className: 'top-models', children: [{ type: 'h2', text: 'Top Models' }, ...data.topModels.map(m => ({ type: 'div', children: [{ type: 'span', text: m.model }, { type: 'span', text: m.requests.toLocaleString() }] }))] },
  ]};
}

export default AnalyticsPage;
