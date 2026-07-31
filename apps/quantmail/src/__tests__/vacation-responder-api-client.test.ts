import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuantMailApiClient } from '../services/api-client';

describe('QuantMailApiClient vacation responder', () => {
  const fetchMock = vi.fn();
  let client: QuantMailApiClient;

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({ success: true, data: null }),
    });
    vi.stubGlobal('fetch', fetchMock);
    client = new QuantMailApiClient('https://mail.test/api');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the live read and upsert routes', async () => {
    await client.getVacationResponder();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://mail.test/vacation-responder',
      expect.objectContaining({ method: 'GET' }),
    );

    const payload = {
      subject: 'Out of office',
      message: 'I will reply when I return.',
      startAt: null,
      endAt: null,
      onlyContacts: true,
      intervalDays: 2,
    };
    await client.upsertVacationResponder(payload);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://mail.test/vacation-responder',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(payload) }),
    );
  });

  it('uses explicit enable and disable actions', async () => {
    await client.enableVacationResponder();
    await client.disableVacationResponder();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://mail.test/vacation-responder/enable',
      expect.objectContaining({ method: 'POST', body: '{}' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://mail.test/vacation-responder/disable',
      expect.objectContaining({ method: 'POST', body: '{}' }),
    );
  });
});
