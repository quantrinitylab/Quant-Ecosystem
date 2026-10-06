/**
 * Tests for the Contacts import/export api-client methods.
 *
 * Covers:
 * - exportContactsVCard / exportContactsCsv hit the backend bulk endpoints
 *   (GET /contacts/export/vcard, GET /contacts/export/csv) via the raw
 *   authenticated fetch — NOT the paginated list endpoint.
 * - importContactsVCard / importContactsCsv POST the file content to the
 *   backend bulk import endpoints and return the ImportResult shape.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the browser auth session before importing the client.
vi.mock('../services/browser-auth-session', () => ({
  browserAuthSession: {
    getAccessToken: () => 'test-token',
    authenticatedFetch: vi.fn(),
  },
}));

vi.mock('../services/browser-api-request', () => ({
  browserApiRequest: vi.fn(),
}));

vi.mock('../lib/ai-intent-preference', () => ({
  readAIIntent: () => null,
}));

import { apiClient } from '../services/api-client';
import { browserApiRequest } from '../services/browser-api-request';
import { browserAuthSession } from '../services/browser-auth-session';

const mockBrowserApiRequest = vi.mocked(browserApiRequest);
const mockAuthenticatedFetch = vi.mocked(browserAuthSession.authenticatedFetch);

describe('contacts import/export api-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exportContactsVCard calls the backend bulk vcard endpoint', async () => {
    const fakeResponse = new Response('BEGIN:VCARD', {
      headers: { 'Content-Type': 'text/vcard' },
    });
    mockBrowserApiRequest.mockResolvedValue(fakeResponse);

    const res = await apiClient.exportContactsVCard();

    expect(mockBrowserApiRequest).toHaveBeenCalledTimes(1);
    expect(mockBrowserApiRequest).toHaveBeenCalledWith('/api/contacts/export/vcard');
    expect(res).toBe(fakeResponse);
  });

  it('exportContactsCsv calls the backend bulk csv endpoint', async () => {
    const fakeResponse = new Response('name,email', {
      headers: { 'Content-Type': 'text/csv' },
    });
    mockBrowserApiRequest.mockResolvedValue(fakeResponse);

    const res = await apiClient.exportContactsCsv();

    expect(mockBrowserApiRequest).toHaveBeenCalledTimes(1);
    expect(mockBrowserApiRequest).toHaveBeenCalledWith('/api/contacts/export/csv');
    expect(res).toBe(fakeResponse);
  });

  it('importContactsVCard posts content to the bulk import endpoint', async () => {
    const importResult = { imported: 3, duplicates: 1, errors: 0, total: 4 };
    mockAuthenticatedFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: importResult }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const content = 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ada\r\nEMAIL:ada@x.io\r\nEND:VCARD';
    const res = await apiClient.importContactsVCard(content);

    expect(res.success).toBe(true);
    expect(res.data).toEqual(importResult);
    const [, init] = mockAuthenticatedFetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ content });
  });

  it('importContactsCsv posts content to the bulk csv import endpoint', async () => {
    const importResult = { imported: 2, duplicates: 0, errors: 1, total: 3 };
    mockAuthenticatedFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: importResult }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const res = await apiClient.importContactsCsv('name,email\nAda,ada@x.io');

    expect(res.success).toBe(true);
    expect(res.data).toEqual(importResult);
    const [url] = mockAuthenticatedFetch.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain('/contacts/import/csv');
  });

  it('import endpoints surface backend failures as unsuccessful responses', async () => {
    mockAuthenticatedFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: { message: 'bad input' } }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const res = await apiClient.importContactsVCard('garbage');
    expect(res.success).toBe(false);
  });
});
