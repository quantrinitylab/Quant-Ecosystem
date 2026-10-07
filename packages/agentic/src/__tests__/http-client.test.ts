import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpClient } from '../clients/http-client.js';

describe('HttpClient', () => {
  let client: HttpClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    client = new HttpClient({ baseUrl: 'http://localhost:3000', timeout: 5000 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('makes GET requests with correct URL and headers', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: 'test' }),
    });

    const response = await client.get('/api/items');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/items',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    expect(response.ok).toBe(true);
    expect(response.data).toEqual({ data: 'test' });
  });

  it('appends query parameters to GET requests', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => [],
    });

    await client.get('/api/items', { folder: 'inbox', limit: '10' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/items?folder=inbox&limit=10',
      expect.any(Object),
    );
  });

  it('makes POST requests with JSON body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: '123' }),
    });

    const response = await client.post('/api/items', { name: 'test' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/items',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'test' }),
      }),
    );
    expect(response.ok).toBe(true);
    expect(response.data).toEqual({ id: '123' });
  });

  it('includes auth token when provided', async () => {
    const authClient = new HttpClient({
      baseUrl: 'http://localhost:3000',
      authToken: 'my-token',
    });

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });

    await authClient.get('/api/secure');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer my-token' }),
      }),
    );
  });

  it('returns error response on HTTP errors without crashing', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ message: 'Not found' }),
    });

    const response = await client.get('/api/missing');

    expect(response.ok).toBe(false);
    expect(response.status).toBe(404);
    expect(response.error).toBe('Not found');
  });

  it('gracefully handles network errors without crashing', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const response = await client.get('/api/items');

    expect(response.ok).toBe(false);
    expect(response.status).toBe(0);
    expect(response.error).toContain('Service unreachable');
  });

  it('gracefully handles timeout', async () => {
    fetchMock.mockRejectedValue(new Error('The operation was aborted'));

    const response = await client.get('/api/items');

    expect(response.ok).toBe(false);
    expect(response.status).toBe(0);
    expect(response.error).toContain('timeout');
  });

  it('setAuthToken updates auth header for subsequent requests', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });

    client.setAuthToken('new-token');
    await client.get('/api/secure');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer new-token' }),
      }),
    );
  });
});
