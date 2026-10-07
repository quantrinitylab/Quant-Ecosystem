import { describe, it, expect, vi } from 'vitest';
import {
  CloudflareEmbeddingProvider,
  loadCloudflareEmbeddingConfig,
} from '../adapters/cloudflare-embedding-provider';

describe('CloudflareEmbeddingProvider', () => {
  it('throws if apiToken is missing', () => {
    expect(() => new CloudflareEmbeddingProvider({ apiToken: '' })).toThrow(/apiToken is required/);
  });

  it('embeds text correctly via OpenAI-compatible embeddings endpoint', async () => {
    const mockVector = new Array(1024).fill(0.123);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: mockVector }],
      }),
    });

    const provider = new CloudflareEmbeddingProvider({
      apiToken: 'test-token',
      accountId: 'test-account',
      fetch: mockFetch as unknown as typeof fetch,
    });

    const result = await provider.embed('Hello Cloudflare Workers AI');
    expect(result).toHaveLength(1024);
    expect(result).toBe(mockVector);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/test-account/ai/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
      }),
    );
  });

  it('handles result.data format fallback', async () => {
    const mockVector = new Array(384).fill(0.456);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: { data: [mockVector] },
      }),
    });

    const provider = new CloudflareEmbeddingProvider({
      apiToken: 'test-token',
      model: '@cf/baai/bge-small-en-v1.5',
      fetch: mockFetch as unknown as typeof fetch,
    });

    const result = await provider.embed('Hello small model');
    expect(result).toHaveLength(384);
    expect(provider.dimension).toBe(384);
  });

  it('throws on HTTP error response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Unauthorized token',
    });

    const provider = new CloudflareEmbeddingProvider({
      apiToken: 'bad-token',
      fetch: mockFetch as unknown as typeof fetch,
    });

    await expect(provider.embed('test')).rejects.toThrow(/Cloudflare embeddings failed \(403\)/);
  });

  it('loads config from environment safely', () => {
    const config = loadCloudflareEmbeddingConfig({
      CLOUDFLARE_API_TOKEN: 'env-token-xyz',
      CLOUDFLARE_ACCOUNT_ID: 'acc-123',
    });
    expect(config.apiToken).toBe('env-token-xyz');
    expect(config.accountId).toBe('acc-123');
    expect(config.model).toBe('@cf/baai/bge-large-en-v1.5');
  });
});
