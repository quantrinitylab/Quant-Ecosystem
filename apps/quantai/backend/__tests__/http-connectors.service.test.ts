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

  describe('receipt-before-success (Interconnection Plan v1)', () => {
    function connectorsFor(app: 'mail' | 'docs' | 'calendar' | 'drive' | 'code', fetchMock: unknown) {
      const urls: Record<string, string> = {
        mail: 'http://mail.local',
        docs: 'http://docs.local',
        calendar: 'http://cal.local',
        drive: 'http://drive.local',
        code: 'http://code.local',
      };
      return new HttpAppConnectors({
        token: 't',
        urls: { [app]: urls[app] },
        fetchImpl: fetchMock as unknown as typeof fetch,
      });
    }

    it('mail.draft succeeds when the owner issues a draft receipt', async () => {
      const fetchMock = vi.fn(async () => jsonResponse({ data: { draftId: 'd-42' } }, 201));
      const c = connectorsFor('mail', fetchMock);
      await expect(c.mail.draft('a@b.c', 'Hi', 'Body')).resolves.toEqual({ draftId: 'd-42' });
    });

    it('mail.draft fails closed when 2xx carries no draft receipt', async () => {
      const fetchMock = vi.fn(async () => jsonResponse({ data: {} }, 201));
      const c = connectorsFor('mail', fetchMock);
      await expect(c.mail.draft('a@b.c', 'Hi', 'Body')).rejects.toMatchObject({
        statusCode: 502,
        code: 'UPSTREAM_RECEIPT_MISSING',
      });
    });

    it('mail.draft fails closed on a bare 2xx envelope without receipt fields', async () => {
      const fetchMock = vi.fn(async () => jsonResponse({ success: true }, 200));
      const c = connectorsFor('mail', fetchMock);
      await expect(c.mail.draft('a@b.c', 'Hi', 'Body')).rejects.toMatchObject({
        code: 'UPSTREAM_RECEIPT_MISSING',
      });
    });

    it('docs.create fails closed when 2xx carries no doc receipt', async () => {
      const fetchMock = vi.fn(async () => jsonResponse({}, 200));
      const c = connectorsFor('docs', fetchMock);
      await expect(c.docs.create('T', 'B')).rejects.toMatchObject({
        statusCode: 502,
        code: 'UPSTREAM_RECEIPT_MISSING',
      });
    });

    it('calendar.createEvent succeeds with an owner event id', async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({ data: { id: 'ev-9', title: 'Sync' } }, 201),
      );
      const c = connectorsFor('calendar', fetchMock);
      const ev = await c.calendar.createEvent('Sync', 's', 'e', []);
      expect(ev.id).toBe('ev-9');
    });

    it('calendar.createEvent fails closed when 2xx carries no event id', async () => {
      const fetchMock = vi.fn(async () => jsonResponse({ data: { title: 'Sync' } }, 200));
      const c = connectorsFor('calendar', fetchMock);
      await expect(c.calendar.createEvent('Sync', 's', 'e', [])).rejects.toMatchObject({
        code: 'UPSTREAM_RECEIPT_MISSING',
      });
    });

    it('drive.summarize treats the produced summary as the receipt', async () => {
      const ok = vi.fn(async () => jsonResponse({ data: { summary: 'Key points…' } }, 200));
      const c1 = connectorsFor('drive', ok);
      await expect(c1.drive.summarize('f1')).resolves.toEqual({
        fileId: 'f1',
        summary: 'Key points…',
      });

      const empty = vi.fn(async () => jsonResponse({ data: {} }, 200));
      const c2 = connectorsFor('drive', empty);
      await expect(c2.drive.summarize('f1')).rejects.toMatchObject({
        code: 'UPSTREAM_RECEIPT_MISSING',
      });
    });

    it('code.reviewPullRequest fails closed when 2xx carries no review summary', async () => {
      const fetchMock = vi.fn(async () => jsonResponse({ data: { riskLevel: 'LOW' } }, 200));
      const c = connectorsFor('code', fetchMock);
      await expect(c.code.reviewPullRequest('a', 'r', 1)).rejects.toMatchObject({
        statusCode: 502,
        code: 'UPSTREAM_RECEIPT_MISSING',
      });
    });

    it('receipt-missing error carries structured details for debugging', async () => {
      const fetchMock = vi.fn(async () => jsonResponse({}, 200));
      const c = connectorsFor('docs', fetchMock);
      const err = await c.docs.create('T', 'B').catch((e) => e);
      expect(err.details).toMatchObject({ app: 'docs', expectedReceiptKeys: ['docId', 'id'] });
    });

    it('read methods still succeed on empty 2xx results (no receipt needed for reads)', async () => {
      const fetchMock = vi.fn(async () => jsonResponse({ data: [] }, 200));
      const c = connectorsFor('mail', fetchMock);
      await expect(c.mail.search('nothing')).resolves.toEqual([]);
    });

    it('empty-string or non-string receipt fields fail closed as malformed', async () => {
      const empty = vi.fn(async () => jsonResponse({ data: { draftId: '' } }, 200));
      await expect(
        connectorsFor('mail', empty).mail.draft('a@b.c', 'Hi', 'Body'),
      ).rejects.toMatchObject({ code: 'UPSTREAM_RECEIPT_MISSING' });

      const numeric = vi.fn(async () => jsonResponse({ data: { id: 12345 } }, 200));
      await expect(
        connectorsFor('calendar', numeric).calendar.createEvent('S', 's', 'e', []),
      ).rejects.toMatchObject({ code: 'UPSTREAM_RECEIPT_MISSING' });
    });

    it('null/primitive response bodies fail closed on mutating calls', async () => {
      const nullBody = vi.fn(async () => jsonResponse({ data: null }, 200));
      await expect(
        connectorsFor('docs', nullBody).docs.create('T', 'B'),
      ).rejects.toMatchObject({ code: 'UPSTREAM_RECEIPT_MISSING' });
    });

    it('whitespace-only summary is not a valid review receipt', async () => {
      const fetchMock = vi.fn(async () => jsonResponse({ data: { summary: '   ' } }, 200));
      await expect(
        connectorsFor('code', fetchMock).code.reviewPullRequest('a', 'r', 1),
      ).rejects.toMatchObject({ code: 'UPSTREAM_RECEIPT_MISSING' });
    });
  });

  describe('request timeout (fail closed on hung sibling backends)', () => {
    it('rejects with UPSTREAM_TIMEOUT when the backend never responds', async () => {
      const hanging = vi.fn(async () => new Promise<Response>(() => {}));
      const c = new HttpAppConnectors({
        token: 't',
        urls: { mail: 'http://mail.local' },
        fetchImpl: hanging as unknown as typeof fetch,
        timeoutMs: 30,
      });
      const err = await c.mail.search('inbox:today').catch((e) => e);
      expect(err).toMatchObject({ statusCode: 502, code: 'UPSTREAM_TIMEOUT' });
      expect(err.details).toMatchObject({ app: 'mail', timeoutMs: 30 });
    });

    it('does not time out a healthy backend that responds within the budget', async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({ data: [{ id: 'e1', subject: 'Hi' }] }),
      );
      const c = new HttpAppConnectors({
        token: 't',
        urls: { mail: 'http://mail.local' },
        fetchImpl: fetchMock as unknown as typeof fetch,
        timeoutMs: 5000,
      });
      await expect(c.mail.search('x')).resolves.toEqual([
        expect.objectContaining({ id: 'e1' }),
      ]);
    });

    it('timeout also guards mutating calls before receipt checks run', async () => {
      const hanging = vi.fn(async () => new Promise<Response>(() => {}));
      const c = new HttpAppConnectors({
        token: 't',
        urls: { calendar: 'http://cal.local' },
        fetchImpl: hanging as unknown as typeof fetch,
        timeoutMs: 30,
      });
      await expect(c.calendar.createEvent('S', 's', 'e', [])).rejects.toMatchObject({
        code: 'UPSTREAM_TIMEOUT',
      });
    });
  });
});
