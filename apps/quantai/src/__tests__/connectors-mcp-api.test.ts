// ============================================================================
// Quanty Connectors — MCP API route tests.
// Verifies spec contracts and HONEST degradation when Q2's backend is down:
// no fake connections, no fake success — 501 with MCP_BACKEND_UNAVAILABLE.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as catalogGET } from '../app/api/quanty/mcp/catalog/route';
import {
  getConnections,
  proxyMcpMutation,
  MCP_BACKEND_UNAVAILABLE,
} from '../app/api/quanty/mcp/_lib';

function req(path: string, method = 'GET'): NextRequest {
  return new NextRequest(new URL(`http://localhost${path}`), { method });
}

describe('GET /api/quanty/mcp/catalog', () => {
  it('returns the spec-shaped provider list', async () => {
    const res = await catalogGET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.providers)).toBe(true);
    expect(data.providers.length).toBeGreaterThan(0);
    for (const p of data.providers) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.name).toBe('string');
      expect(typeof p.icon).toBe('string');
      expect(typeof p.category).toBe('string');
      expect(typeof p.description).toBe('string');
      expect(typeof p.authType).toBe('string');
    }
  });
});

describe('MCP proxy honesty (Q2 backend unreachable)', () => {
  it('getConnections falls back to built-ins with backendReady:false — never fabricated grants', async () => {
    const res = await getConnections(req('/api/quanty/mcp/connections'));
    const data = await res.json();
    expect(data.backendReady).toBe(false);
    expect(Array.isArray(data.connections)).toBe(true);
    const ids = data.connections.map((c: any) => c.provider);
    expect(ids).toContain('browser');
    expect(ids).toContain('quantmail');
    // No fabricated OAuth connections.
    for (const c of data.connections) {
      expect(c.status).toBe('connected');
      expect(['ecosystem-session', 'oauth']).toContain(c.via);
    }
  }, 20000);

  it('proxyMcpMutation returns honest 501, never a fake { ok:true }', async () => {
    const res = await proxyMcpMutation(req('/api/quanty/mcp/connect/github', 'POST'), '/api/quanty/mcp/connect/github');
    expect(res.status).toBe(501);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe('MCP_BACKEND_UNAVAILABLE');
    expect(typeof data.error.message).toBe('string');
    expect(data.error.message.toLowerCase()).toContain('coming soon');
  }, 20000);

  it('MCP_BACKEND_UNAVAILABLE constant carries the honest message', () => {
    expect(MCP_BACKEND_UNAVAILABLE.ok).toBe(false);
    expect(MCP_BACKEND_UNAVAILABLE.error.code).toBe('MCP_BACKEND_UNAVAILABLE');
  });
});
