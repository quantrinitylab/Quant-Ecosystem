// ============================================================================
// quantai — AgentPerformance tests (F-153)
// ============================================================================
//
// Covers the fetch/validation/normalization seam of the AgentPerformance
// component: honest failure on HTTP errors, rejection of malformed payloads,
// derivation of successRate (the backend getTopAgents() omits it — rendering
// `undefined.toFixed()` would crash), and the initial loading render.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(),
}));

import { apiFetchRaw } from '@quant/api-client';
import {
  AgentPerformance,
  fetchAgentStats,
  isAgentStatsArray,
  normalizeStats,
} from '../components/AgentPerformance';

const apiFetchRawMock = vi.mocked(apiFetchRaw);

function okResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const backendRow = {
  agentId: 'agent-1',
  totalRuns: 10,
  successfulRuns: 8,
  failedRuns: 2,
  averageResponseTime: 250,
  lastUsed: '2026-10-11T10:00:00.000Z',
};

describe('isAgentStatsArray', () => {
  it('accepts a well-formed array of agent stat objects', () => {
    expect(isAgentStatsArray([backendRow])).toBe(true);
  });

  it('accepts an empty array (honest empty state)', () => {
    expect(isAgentStatsArray([])).toBe(true);
  });

  it('rejects null, plain objects, and non-array JSON', () => {
    expect(isAgentStatsArray(null)).toBe(false);
    expect(isAgentStatsArray({ agentId: 'x' })).toBe(false);
    expect(isAgentStatsArray('[]')).toBe(false);
  });

  it('rejects rows with missing or wrongly-typed fields', () => {
    expect(isAgentStatsArray([{ ...backendRow, agentId: 42 }])).toBe(false);
    expect(isAgentStatsArray([{ ...backendRow, totalRuns: 'ten' }])).toBe(false);
    expect(isAgentStatsArray([null])).toBe(false);
  });
});

describe('normalizeStats', () => {
  it('derives successRate from successfulRuns / totalRuns when the backend omits it', () => {
    const [row] = normalizeStats([backendRow]);
    expect(row.successRate).toBeCloseTo(80, 5);
  });

  it('keeps a finite backend-provided successRate untouched', () => {
    const [row] = normalizeStats([{ ...backendRow, successRate: 95.5 }]);
    expect(row.successRate).toBe(95.5);
  });

  it('yields 0 — not NaN — when totalRuns is 0', () => {
    const [row] = normalizeStats([{ ...backendRow, totalRuns: 0, successfulRuns: 0 }]);
    expect(row.successRate).toBe(0);
    expect(Number.isNaN(row.successRate)).toBe(false);
  });

  it('replaces a non-finite successRate with the derived value', () => {
    const [row] = normalizeStats([{ ...backendRow, successRate: Number.NaN }]);
    expect(row.successRate).toBeCloseTo(80, 5);
  });
});

describe('fetchAgentStats', () => {
  beforeEach(() => {
    apiFetchRawMock.mockReset();
  });

  it('returns normalized rows on a 200 with a valid payload', async () => {
    apiFetchRawMock.mockResolvedValueOnce(okResponse([backendRow]));

    const rows = await fetchAgentStats();

    expect(apiFetchRawMock).toHaveBeenCalledWith('/api/analytics/agents/top');
    expect(rows).toHaveLength(1);
    expect(rows[0].agentId).toBe('agent-1');
    expect(rows[0].successRate).toBeCloseTo(80, 5);
  });

  it('returns an empty array when the backend honestly has no data', async () => {
    apiFetchRawMock.mockResolvedValueOnce(okResponse([]));

    await expect(fetchAgentStats()).resolves.toEqual([]);
  });

  it('throws on a backend 500 instead of swallowing it', async () => {
    apiFetchRawMock.mockResolvedValueOnce(okResponse({ error: 'boom' }, 500));

    await expect(fetchAgentStats()).rejects.toThrow('status 500');
  });

  it('throws on a 404 (the pre-F-153 symptom) instead of rendering stale empty data', async () => {
    apiFetchRawMock.mockResolvedValueOnce(okResponse({ error: 'not found' }, 404));

    await expect(fetchAgentStats()).rejects.toThrow('status 404');
  });

  it('throws when the network request itself fails', async () => {
    apiFetchRawMock.mockRejectedValueOnce(new Error('fetch failed'));

    await expect(fetchAgentStats()).rejects.toThrow('fetch failed');
  });

  it('throws on a malformed payload (object instead of array)', async () => {
    apiFetchRawMock.mockResolvedValueOnce(okResponse({ agentId: 'agent-1' }));

    await expect(fetchAgentStats()).rejects.toThrow('expected format');
  });

  it('throws on a malformed payload (array with invalid rows)', async () => {
    apiFetchRawMock.mockResolvedValueOnce(okResponse([{ nope: true }]));

    await expect(fetchAgentStats()).rejects.toThrow('expected format');
  });
});

describe('AgentPerformance render', () => {
  it('renders the honest loading state on first paint (effects do not run in SSR)', () => {
    const html = renderToStaticMarkup(React.createElement(AgentPerformance));
    expect(html).toContain('Agent Performance');
    expect(html).toContain('Loading performance data');
  });
});
