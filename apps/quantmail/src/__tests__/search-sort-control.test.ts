import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { QuantMailApiClient } from '../services/api-client';

// fix/qm-search-relevance-sort — the sort control must actually reach the
// backend: the api client forwards `sort` to /emails/search, and the search
// page wires its sort state into the search request it sends.

function jsonResponse(body: unknown, status = 200) {
  return { status, json: async () => body };
}

describe('QuantMailApiClient.searchEmails sort forwarding', () => {
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

  it('sends sort=oldest to /emails/search for a plain-text query', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: [], page: 1, pageSize: 20, totalPages: 0, totalCount: 0 }),
    );
    await client.searchEmails({ query: 'budget', sort: 'oldest' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/emails/search');
    expect(url.searchParams.get('sort')).toBe('oldest');
  });

  it('sends sort=relevance when the control is on its default', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: [], page: 1, pageSize: 20, totalPages: 0, totalCount: 0 }),
    );
    await client.searchEmails({ query: 'budget', sort: 'relevance' });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get('sort')).toBe('relevance');
  });
});

describe('Search page sort control wiring (source contract)', () => {
  const pageSource = fs.readFileSync(
    path.resolve(__dirname, '../app/search/page.tsx'),
    'utf8',
  );

  it('defines all three sort options with relevance first (the default)', () => {
    expect(pageSource).toContain("id: 'relevance', label: 'Relevance'");
    expect(pageSource).toContain("id: 'newest', label: 'Newest'");
    expect(pageSource).toContain("id: 'oldest', label: 'Oldest'");
    expect(pageSource).toContain("useState<'relevance' | 'newest' | 'oldest'>('relevance')");
  });

  it('renders the control as a labelled radio group in the mail scope only', () => {
    expect(pageSource).toContain('aria-label="Sort search results"');
    expect(pageSource).toContain('role="radiogroup"');
    expect(pageSource).toContain('role="radio"');
  });

  it('passes the sort state into the search request', () => {
    expect(pageSource).toMatch(/searchParams[\s\S]*?sort,/);
  });

  it('uses pill styling only — no divider-line classes in the sort row', () => {
    const sortBlock = pageSource.slice(pageSource.indexOf('SORT_OPTIONS'));
    expect(sortBlock).not.toMatch(/border-[tbr](?![a-z-])|divide-[xy](?![a-z-])/);
  });
});
