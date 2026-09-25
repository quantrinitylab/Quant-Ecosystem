import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QuantCliClient, QuantCliApiError } from '../client.js';

describe('QuantCliClient HTTP Client (client.ts)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('attaches Authorization header automatically from environment / config', async () => {
    process.env.QUANT_API_URL = 'https://api.quantmail.in';
    process.env.QUANT_TOKEN = 'jwt-auth-token-xyz';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, user: 'test' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new QuantCliClient();
    const result = await client.get('/api/auth/session');

    expect(result).toEqual({ success: true, user: 'test' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.quantmail.in/api/auth/session',
      expect.objectContaining({
        method: 'GET',
        headers: expect.any(Headers),
      }),
    );

    const calledHeaders = fetchMock.mock.calls[0][1].headers as Headers;
    expect(calledHeaders.get('Authorization')).toBe('Bearer jwt-auth-token-xyz');
  });

  it('uses constructor overrides when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: 'custom-res' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new QuantCliClient({
      apiUrl: 'https://staging.quantmail.in/',
      token: 'constructor-token-999',
    });

    await client.get('api/v1/health');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://staging.quantmail.in/api/v1/health',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    const calledHeaders = fetchMock.mock.calls[0][1].headers as Headers;
    expect(calledHeaders.get('Authorization')).toBe('Bearer constructor-token-999');
  });

  it('handles post requests with JSON body serialization', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ created: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new QuantCliClient({ apiUrl: 'https://api.quantmail.in', token: 'token-1' });
    const payload = { title: 'Test Repo', private: false };
    const res = await client.post('/api/repos', payload);

    expect(res).toEqual({ created: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.quantmail.in/api/repos',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    );
  });

  it('handles delete requests correctly', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new QuantCliClient({ apiUrl: 'https://api.quantmail.in' });
    const res = await client.delete('/api/repos/old-repo');

    expect(res).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.quantmail.in/api/repos/old-repo',
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
  });

  it('throws descriptive QuantCliApiError on non-ok status codes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ error: 'Invalid authentication credentials' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new QuantCliClient({ apiUrl: 'https://api.quantmail.in' });

    await expect(client.get('/api/secure')).rejects.toThrowError(QuantCliApiError);

    try {
      await client.get('/api/secure');
    } catch (err: any) {
      expect(err).toBeInstanceOf(QuantCliApiError);
      expect(err.status).toBe(401);
      expect(err.message).toContain('API Error [401 Unauthorized]');
      expect(err.message).toContain('Invalid authentication credentials');
      expect(err.data).toEqual({ error: 'Invalid authentication credentials' });
    }
  });

  it('handles network connection failure gracefully', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchMock);

    const client = new QuantCliClient({ apiUrl: 'http://localhost:9999' });
    await expect(client.get('/health')).rejects.toThrow(
      'Failed to connect to Quant API at http://localhost:9999/health: ECONNREFUSED',
    );
  });
});
