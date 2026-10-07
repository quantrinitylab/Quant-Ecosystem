import { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../_lib/agent-proxy';
import { POST as StreamPOST } from '../[id]/messages/stream/route';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock proxyToBackend and fetch
vi.mock('@quant/api-client', () => ({
  proxyToBackend: vi.fn().mockImplementation(() => {
    throw new Error('fetch failed');
  }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('sessions-fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/sessions fallback', async () => {
    const req = new NextRequest('http://localhost:3000/api/sessions', { method: 'GET' });
    const res = await proxyAgentRequest(req, '/sessions');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      data: { items: [], total: 0, page: 1, pageSize: 50 },
    });
  });

  it('POST /api/sessions fallback returns honest 503 (never fabricates a session)', async () => {
    const req = new NextRequest('http://localhost:3000/api/sessions', { method: 'POST' });
    const res = await proxyAgentRequest(req, '/sessions', {
      body: { title: 'Test Session', model: 'gpt-4o' },
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(body.error).toBeDefined();
    // No fabricated session id may be present.
    expect(body.data).toBeUndefined();
  });

  it('Stream fallback returns honest 503 when backend is offline (no canned greeting)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));

    const req = new NextRequest('http://localhost:3000/api/sessions/sess_123/messages/stream', {
      method: 'POST',
      body: 'test',
    });
    const params = Promise.resolve({ id: 'sess_123' });
    const res = await StreamPOST(req, { params });

    expect(res.status).toBe(503);
    expect(res.headers.get('Content-Type')).toContain('application/json');

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(body.error).toBeDefined();
  });
});
