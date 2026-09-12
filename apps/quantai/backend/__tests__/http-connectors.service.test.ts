import { describe, it, expect, vi } from 'vitest';
import { HttpAppConnectors } from '../services/http-connectors.service';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('HttpAppConnectors', () => {
  it('forwards the bearer token and maps a mail search response (envelope form)', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({
        success: true,
        data: [
          { id: 'e1', from: 'a@example.com', subject: 'Hi', snippet: 'hello', date: '2026-01-01' },
        ],
      }),
    );

    const connectors = new HttpAppConnectors({
      token: 'tok-123',
      urls: { mail: 'http://mail.local' },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const emails = await connectors.mail.search('inbox:today');

    expect(emails).toEqual([
      { id: 'e1', from: 'a@example.com', subject: 'Hi', snippet: 'hello', date: '2026-01-01' },
    ]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('http://mail.local/emails?q=inbox%3Atoday');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer tok-123');
  });

  it('maps a raw-array calendar response and normalizes field aliases', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse([
        { id: 'ev1', summary: 'Standup', startTime: 's', endTime: 'e', attendees: ['x@e.com'] },
      ]),
    );

    const connectors = new HttpAppConnectors({
      token: 't',
      urls: { calendar: 'http://cal.local' },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const events = await connectors.calendar.getEvents('2026-01-01');
    expect(events[0]).toEqual({
      id: 'ev1',
      title: 'Standup',
      start: 's',
      end: 'e',
      attendees: ['x@e.com'],
    });
  });

  it('fails closed (503) when a required backend URL is not configured', async () => {
    const connectors = new HttpAppConnectors({
      token: 't',
      urls: {},
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    await expect(connectors.mail.search('q')).rejects.toMatchObject({
      statusCode: 503,
      code: 'BACKEND_NOT_CONFIGURED',
    });
  });

  it('raises a 502 when the upstream backend returns an error status', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'boom' }, 500));
    const connectors = new HttpAppConnectors({
      token: 't',
      urls: { drive: 'http://drive.local' },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(connectors.drive.search('q')).rejects.toMatchObject({
      statusCode: 502,
      code: 'UPSTREAM_REQUEST_FAILED',
    });
  });

  it('posts a document create and extracts the doc id', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ data: { id: 'doc-9' } }, 201),
    );
    const connectors = new HttpAppConnectors({
      token: 't',
      urls: { docs: 'http://docs.local' },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await connectors.docs.create('Title', '# Body');
    expect(result).toEqual({ docId: 'doc-9' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('http://docs.local/documents');
    expect((init as RequestInit).method).toBe('POST');
  });

  it('lists CodeHub repositories and maps fields', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({
        success: true,
        data: [
          {
            id: 'repo-1',
            name: 'quant-engine',
            fullName: 'alice/quant-engine',
            description: 'Core engine',
            defaultBranch: 'main',
            visibility: 'public',
          },
        ],
      }),
    );
    const connectors = new HttpAppConnectors({
      token: 'pat-xyz',
      urls: { code: 'http://code.local' },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const repos = await connectors.code.listRepos();
    expect(repos).toHaveLength(1);
    expect(repos[0]).toEqual({
      id: 'repo-1',
      name: 'quant-engine',
      fullName: 'alice/quant-engine',
      description: 'Core engine',
      defaultBranch: 'main',
      visibility: 'public',
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('http://code.local/repos');
    expect(((init as RequestInit).headers as Record<string, string>)['authorization']).toBe(
      'Bearer pat-xyz',
    );
  });

  it('triggers automated PR AI review and parses report', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({
        success: true,
        data: {
          summary: 'Review passed with 0 critical findings.',
          riskLevel: 'LOW',
          filesChanged: 2,
          findingsCount: 0,
          suggestions: ['Add unit tests.'],
        },
      }),
    );
    const connectors = new HttpAppConnectors({
      token: 'tok-pr',
      urls: { code: 'http://code.local' },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const report = await connectors.code.reviewPullRequest('alice', 'quant-engine', 7);
    expect(report).toEqual({
      summary: 'Review passed with 0 critical findings.',
      riskLevel: 'LOW',
      filesChanged: 2,
      findingsCount: 0,
      suggestions: ['Add unit tests.'],
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('http://code.local/alice/quant-engine/pulls/7/ai-review');
    expect((init as RequestInit).method).toBe('POST');
  });
});
