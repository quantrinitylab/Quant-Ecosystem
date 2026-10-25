import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuantMailApiClient, hasSearchOperatorSyntax } from '../services/api-client';

function jsonResponse(body: unknown, status = 200) {
  return { status, json: async () => body };
}

describe('hasSearchOperatorSyntax', () => {
  it.each([
    ['from:kundan', true],
    ['to:bob@x.com', true],
    ['subject:invoice', true],
    ['label:work', true],
    ['in:inbox', true],
    ['has:attachment', true],
    ['is:unread', true],
    ['before:2026-01-01', true],
    ['after:2026-01-01', true],
    ['newer_than:7d', true],
    ['older_than:2w', true],
    ['filename:invoice.pdf', true],
    ['filename:report', true],
    ['larger:10M', true],
    ['smaller:1M', true],
    ['size:5M', true],
    ['"exact phrase"', true],
    ['subject:"year end review"', true],
    ['Re: from:kundan invoice', true],
    ['invoice from:kundan', true],
  ])('detects operator syntax in %p', (query, expected) => {
    expect(hasSearchOperatorSyntax(query)).toBe(expected);
  });

  it.each([
    ['invoice', false],
    ['kundan@gmail.com', false],
    ['12:30 meeting', false],
    ['note: remember this', false],
    ['Re: project update', false],
    ['', false],
  ])('leaves plain text alone in %p', (query, expected) => {
    expect(hasSearchOperatorSyntax(query)).toBe(expected);
  });
});

describe('QuantMailApiClient.searchEmails operator routing', () => {
  const fetchMock = vi.fn();
  let client: QuantMailApiClient;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    client = new QuantMailApiClient('https://mail.test/api');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes an operator query to the operator-aware /search/emails path', async () => {
    const operatorEnvelope = {
      success: true,
      data: [
        {
          id: 'm1',
          from: { email: 'kundan@x.com', name: 'Kundan' },
          subject: 'Invoice',
        },
      ],
      page: 2,
      pageSize: 10,
      totalPages: 1,
      totalCount: 1,
      hasNext: false,
      hasPrev: true,
    };
    fetchMock.mockResolvedValue(jsonResponse(operatorEnvelope));

    const res = await client.searchEmails({ query: 'from:kundan has:attachment', page: 2, pageSize: 10 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/search/emails');
    expect(url.searchParams.get('q')).toBe('from:kundan has:attachment');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('pageSize')).toBe('10');
    expect(res.success).toBe(true);
    expect(res.data).toEqual(operatorEnvelope.data);
  });

  it('keeps plain-text queries on the legacy literal /emails/search path', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: [] }));

    await client.searchEmails({ query: 'invoice' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/emails/search');
    expect(url.searchParams.get('q')).toBe('invoice');
  });

  it('keeps operator-looking queries with filter chips on the legacy path (chips preserved)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: [] }));

    await client.searchEmails({ query: 'from:kundan', from: 'bob@x.com', pageSize: 20 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/emails/search');
    // The chip still rides along as its own param on the legacy path.
    expect(url.searchParams.get('from')).toBe('bob@x.com');
    expect(url.searchParams.get('q')).toBe('from:kundan');
  });

  it('falls back to the literal path when the operator path answers success:false', async () => {
    const literalEnvelope = { success: true, data: [{ id: 'm2' }] };
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ success: false, error: { code: 'BACKEND_UNAVAILABLE', message: 'down', statusCode: 502 } }, 502),
      )
      .mockResolvedValueOnce(jsonResponse(literalEnvelope));

    const res = await client.searchEmails({ query: 'before:2026-01-01' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = new URL(fetchMock.mock.calls[0][0] as string);
    const secondUrl = new URL(fetchMock.mock.calls[1][0] as string);
    expect(firstUrl.pathname).toBe('/search/emails');
    expect(secondUrl.pathname).toBe('/emails/search');
    expect(secondUrl.searchParams.get('q')).toBe('before:2026-01-01');
    expect(res).toEqual(literalEnvelope);
  });

  it('falls back to the literal path when the operator path throws (network failure)', async () => {
    const literalEnvelope = { success: true, data: [{ id: 'm3' }] };
    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(jsonResponse(literalEnvelope));

    const res = await client.searchEmails({ query: 'is:unread' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(fetchMock.mock.calls[0][0] as string).pathname).toBe('/search/emails');
    expect(new URL(fetchMock.mock.calls[1][0] as string).pathname).toBe('/emails/search');
    expect(res).toEqual(literalEnvelope);
  });
});
