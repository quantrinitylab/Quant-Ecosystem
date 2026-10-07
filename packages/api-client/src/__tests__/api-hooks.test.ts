import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useApiQuery } from '../hooks/useApiQuery';
import { useApiMutation } from '../hooks/useApiMutation';
import { apiFetch, buildPath } from '../core/api-fetch';
import { useQuery, useMutation } from '@tanstack/react-query';

// Mock react-query so we can assert the options passed to it without a renderer.
vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn((options) => ({
    data: undefined,
    isLoading: true,
    error: null,
    queryKey: options?.queryKey,
    queryFn: options?.queryFn,
  })),
  useMutation: vi.fn((options) => ({
    mutate: vi.fn(),
    mutateAsync: options?.mutationFn,
    isLoading: false,
    error: null,
    mutationFn: options?.mutationFn,
  })),
}));

const useQueryMock = vi.mocked(useQuery);
const useMutationMock = vi.mocked(useMutation);

describe('buildPath', () => {
  it('returns the path unchanged when there are no params', () => {
    expect(buildPath('/api/items')).toBe('/api/items');
  });

  it('appends params with ? when none present', () => {
    expect(buildPath('/api/items', { page: '1', q: 'x' })).toBe('/api/items?page=1&q=x');
  });

  it('appends params with & when a query string already exists', () => {
    expect(buildPath('/api/items?sort=asc', { page: '2' })).toBe('/api/items?sort=asc&page=2');
  });
});

describe('apiFetch', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as typeof global.fetch;
  });

  it('issues a same-origin GET and returns the parsed envelope', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { ok: 1 } }),
    });

    const result = await apiFetch<{ ok: number }>('/api/ping');

    expect(mockFetch).toHaveBeenCalledWith('/api/ping', expect.objectContaining({ method: 'GET' }));
    expect(result.success).toBe(true);
    expect(result.data.ok).toBe(1);
  });

  it('attaches a bearer token and JSON body for mutations', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: 'a' } }),
    });

    await apiFetch('/api/notifications/send', {
      method: 'POST',
      body: { to: 'u1' },
      token: 'tok-123',
    });

    const [, init] = mockFetch.mock.calls[0]!;
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).body).toBe(JSON.stringify({ to: 'u1' }));
    expect(((init as RequestInit).headers as Record<string, string>)['Authorization']).toBe(
      'Bearer tok-123',
    );
  });

  it('maps non-2xx responses to a failure envelope (never throws)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ code: 'UNAUTHORIZED', message: 'no token' }),
    });

    const result = await apiFetch('/api/secure');

    expect(result.success).toBe(false);
    expect(result.error?.statusCode).toBe(401);
    expect(result.error?.code).toBe('UNAUTHORIZED');
  });

  it('maps network errors to a NETWORK_ERROR envelope', async () => {
    mockFetch.mockRejectedValue(new Error('boom'));

    const result = await apiFetch('/api/down');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NETWORK_ERROR');
  });
});

describe('useApiQuery', () => {
  beforeEach(() => useQueryMock.mockClear());

  it('builds a stable query key from path + params', () => {
    useApiQuery<{ items: string[] }>('/api/items', { params: { page: '1' } });

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['/api/items', { page: '1' }] }),
    );
  });

  it('passes enabled/staleTime through to react-query', () => {
    useApiQuery('/api/items', { enabled: false, staleTime: 5000 });

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, staleTime: 5000 }),
    );
  });
});

describe('useApiMutation', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useMutationMock.mockClear();
    mockFetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ success: true, data: {} }) });
    global.fetch = mockFetch as typeof global.fetch;
  });

  it('registers a mutation function with react-query', () => {
    useApiMutation<{ body: string }, { id: string }>('/api/notifications/send');

    expect(useMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ mutationFn: expect.any(Function) }),
    );
  });

  it('POSTs the variables to the static path by default', async () => {
    const result = useApiMutation<{ msg: string }, { id: string }>('/api/notifications/send');
    // The mock returns mutationFn as mutateAsync; invoke it directly.
    await (result.mutateAsync as (i: { msg: string }) => Promise<unknown>)({ msg: 'hi' });

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe('/api/notifications/send');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).body).toBe(JSON.stringify({ msg: 'hi' }));
  });

  it('supports a dynamic path builder and custom method', async () => {
    const result = useApiMutation<{ id: string }, unknown>('/api/items', {
      method: 'DELETE',
      path: (input) => `/api/items/${input.id}`,
    });
    await (result.mutateAsync as (i: { id: string }) => Promise<unknown>)({ id: '42' });

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe('/api/items/42');
    expect((init as RequestInit).method).toBe('DELETE');
  });
});
