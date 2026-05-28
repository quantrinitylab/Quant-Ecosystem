import type { DataQuery, QueryResult } from '../types.js';
const METRICS = ['emails', 'meetings', 'tasks', 'messages', 'files', 'contacts'];
const PERIODS = ['today', 'week', 'month', 'quarter', 'year'];
export class NLQueryEngine {
  parse(nl: string): DataQuery {
    const l = nl.toLowerCase();
    const metric = METRICS.find((m) => l.includes(m)) ?? null;
    const period = PERIODS.find((p) => l.includes(p)) ?? null;
    // prettier-ignore
    return { id: crypto.randomUUID(), naturalLanguage: nl, parsed: metric && period ? { metric, period } : null };
  }
  // prettier-ignore
  execute(q: DataQuery): QueryResult { return { queryId: q.id, data: [{ count: 42 }], summary: 'Mock result', executedAt: Date.now() }; }
  // prettier-ignore
  getSupportedMetrics() { return [...METRICS]; }
  // prettier-ignore
  getSupportedPeriods() { return [...PERIODS]; }
}
