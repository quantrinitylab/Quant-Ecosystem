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

  it('POST /api/sessions fallback', async () => {
    const req = new NextRequest('http://localhost:3000/api/sessions', { method: 'POST' });
    const res = await proxyAgentRequest(req, '/sessions', {
      body: { title: 'Test Session', model: 'gpt-4o' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Test Session');
    expect(body.data.model).toBe('gpt-4o');
    expect(body.data.id).toMatch(/^sess_\d+$/);
    expect(body.data.messages).toEqual([]);
    expect(body.data.createdAt).toBeDefined();
  });

  it('Stream fallback when backend is offline', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));

    const req = new NextRequest('http://localhost:3000/api/sessions/sess_123/messages/stream', {
      method: 'POST',
      body: 'test',
    });
    const params = Promise.resolve({ id: 'sess_123' });
    const res = await StreamPOST(req, { params });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Connection')).toBe('keep-alive');

    if (!res.body) {
      throw new Error('Response body is null');
    }

    const reader = (res.body as any).getReader();
    const decoder = new TextDecoder();
    let result = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value);
    }

    expect(result).toContain('event: token');
    expect(result).toContain('Quant AI');
    expect(result).toContain('event: done');
  });
});
