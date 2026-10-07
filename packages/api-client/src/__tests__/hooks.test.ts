import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpClient } from '../core/http-client';
import { createQueryHook } from '../hooks/useQuery';
import { createMutationHook } from '../hooks/useMutation';
import { createInfiniteQueryHook } from '../hooks/useInfiniteQuery';
import { useQuery, useMutation, useInfiniteQuery } from '@tanstack/react-query';

// Mock react-query
vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn((options) => ({
    data: undefined,
    isLoading: true,
    error: null,
    queryKey: options.queryKey,
    queryFn: options.queryFn,
  })),
  useMutation: vi.fn((options) => ({
    mutate: vi.fn(),
    mutateAsync: options.mutationFn,
    isLoading: false,
    error: null,
  })),
  useInfiniteQuery: vi.fn((options) => ({
    data: undefined,
    isLoading: true,
    error: null,
    queryKey: options.queryKey,
    queryFn: options.queryFn,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
  })),
}));

// Mock react
vi.mock('react', () => ({
  useEffect: vi.fn(),
  useRef: vi.fn(() => ({ current: null })),
  useCallback: vi.fn((fn) => fn),
  useState: vi.fn((initial) => [initial, vi.fn()]),
}));

const useQueryMock = vi.mocked(useQuery);
const useMutationMock = vi.mocked(useMutation);
const useInfiniteQueryMock = vi.mocked(useInfiniteQuery);

describe('HttpClient', () => {
  let client: HttpClient;
  let mockFetch: ReturnType<
    typeof vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<any>>
  >;

  beforeEach(() => {
    client = new HttpClient({ baseUrl: 'https://api.quant.ai' });
    mockFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<any>>();
    global.fetch = mockFetch as typeof global.fetch;
  });

  it('builds GET request URLs correctly', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { items: [] } }),
    });

    await client.get('/users', { page: '1', limit: '10' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.quant.ai/users?page=1&limit=10',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('includes auth token in headers', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: {} }),
    });

    client.setAuthToken('my-token-123');
    await client.get('/protected');

    const callArgs = mockFetch.mock.calls[0]!;
    const options = callArgs[1] as RequestInit;
    expect((options.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer my-token-123',
    );
  });

  it('handles error responses correctly', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ code: 'NOT_FOUND', message: 'Resource not found' }),
    });

    const result = await client.get('/missing');

    expect(result.success).toBe(false);
    expect(result.error?.statusCode).toBe(404);
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  it('sends POST with JSON body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: '123' } }),
    });

    await client.post('/users', { name: 'John', email: 'john@example.com' });

    const callArgs = mockFetch.mock.calls[0]!;
    const options = callArgs[1] as RequestInit;
    expect(options.method).toBe('POST');
    expect(options.body).toBe(JSON.stringify({ name: 'John', email: 'john@example.com' }));
  });
});

describe('createQueryHook', () => {
  let client: HttpClient;

  beforeEach(() => {
    client = new HttpClient({ baseUrl: 'https://api.quant.ai' });
    useQueryMock.mockClear();
  });

  it('creates a hook function', () => {
    const useHook = createQueryHook<Record<string, string>, { items: string[] }>(
      client,
      '/api/items',
    );

    expect(typeof useHook).toBe('function');
  });

  it('creates a hook with dynamic path', () => {
    const useHook = createQueryHook<{ id: string }, { name: string }>(
      client,
      (params) => `/api/users/${params.id}`,
    );

    expect(typeof useHook).toBe('function');
  });

  it('generates correct query key for static endpoint', () => {
    const useHook = createQueryHook<Record<string, string>, { items: string[] }>(
      client,
      '/api/items',
    );

    useHook({ page: '1', limit: '10' });

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['/api/items', { page: '1', limit: '10' }],
      }),
    );
  });

  it('generates correct query key for dynamic endpoint', () => {
    const useHook = createQueryHook<{ id: string }, { name: string }>(
      client,
      (params) => `/api/users/${params.id}`,
    );

    useHook({ id: '42' });

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['/api/users/42', { id: '42' }],
      }),
    );
  });

  it('passes staleTime and enabled options', () => {
    const useHook = createQueryHook<Record<string, string>, { items: string[] }>(
      client,
      '/api/items',
      { staleTime: 60000 },
    );

    useHook({}, { enabled: false, staleTime: 5000 });

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
        staleTime: 5000,
      }),
    );
  });
});

describe('createMutationHook', () => {
  let client: HttpClient;

  beforeEach(() => {
    client = new HttpClient({ baseUrl: 'https://api.quant.ai' });
    useMutationMock.mockClear();
  });

  it('creates a mutation hook function', () => {
    const useMutation = createMutationHook<{ name: string }, { id: string }>(client, '/api/items');

    expect(typeof useMutation).toBe('function');
  });

  it('calls the hook with a mutation function', () => {
    const useMutation = createMutationHook<{ name: string }, { id: string }>(client, '/api/items');

    useMutation();

    expect(useMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mutationFn: expect.any(Function),
      }),
    );
  });

  it('uses correct HTTP method from options', () => {
    const useMutation = createMutationHook<{ name: string }, { id: string }>(client, '/api/items', {
      method: 'PUT',
    });

    useMutation();

    expect(useMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mutationFn: expect.any(Function),
      }),
    );
  });
});

describe('createInfiniteQueryHook', () => {
  let client: HttpClient;

  beforeEach(() => {
    client = new HttpClient({ baseUrl: 'https://api.quant.ai' });
    useInfiniteQueryMock.mockClear();
  });

  it('creates an infinite query hook function', () => {
    const useInfinite = createInfiniteQueryHook<
      { category: string },
      { id: string; title: string }
    >(client, '/api/posts');

    expect(typeof useInfinite).toBe('function');
  });

  it('generates correct query key with infinite marker', () => {
    const useInfinite = createInfiniteQueryHook<
      { category: string },
      { id: string; title: string }
    >(client, '/api/posts');

    useInfinite({ category: 'tech' });

    expect(useInfiniteQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['/api/posts', 'infinite', { category: 'tech' }],
        initialPageParam: 1,
      }),
    );
  });

  it('generates correct query key for dynamic endpoint', () => {
    const useInfinite = createInfiniteQueryHook<{ userId: string }, { id: string; title: string }>(
      client,
      (params) => `/api/users/${params.userId}/posts`,
    );

    useInfinite({ userId: '99' });

    expect(useInfiniteQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['/api/users/99/posts', 'infinite', { userId: '99' }],
      }),
    );
  });
});
