import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuantMailApiClient } from '../services/api-client';

describe('QuantMailApiClient read receipts', () => {
  const fetchMock = vi.fn();
  let client: QuantMailApiClient;

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({ success: true, data: { marked: 2, readAt: '2026-10-06T12:00:00.000Z' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    client = new QuantMailApiClient('https://mail.test/api');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('marks a thread read via POST /threads/:id/read', async () => {
    const res = await client.markThreadRead('thread-1');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://mail.test/threads/thread-1/read',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(res.data?.marked).toBe(2);
    expect(res.data?.readAt).toBe('2026-10-06T12:00:00.000Z');
  });
});
