import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ToolExecutor } from '../executor/tool-executor.js';
import {
  registerMailReadHandlers,
  resolveCallerJwt,
  resolveBaseUrl,
  DEFAULT_QUANTMAIL_API_BASE_URL,
  type ToolExecutionContext,
} from '../index.js';

const TEST_JWT = 'test-caller-jwt';
const TEST_BASE = 'https://quantmail.test';

type FetchMock = (url: string, init?: Record<string, unknown>) => Promise<unknown>;

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function emailRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    subject: 'Invoice #1234',
    from: { email: 'billing@acme.com', name: 'Acme Billing' },
    fromName: 'Acme Billing',
    fromAddress: 'billing@acme.com',
    bodyPlain: 'Please find attached your invoice for October.',
    receivedAt: '2026-10-09T10:00:00.000Z',
    isRead: false,
    toAddresses: ['user@quantmail.in'],
    ccAddresses: [],
    hasAttachments: false,
    ...overrides,
  };
}

describe('resolveCallerJwt', () => {
  const base: ToolExecutionContext = {
    userId: 'user-1',
    sessionId: 's-1',
    permissions: 0,
    dryRun: false,
  };

  it('returns the JWT threaded through metadata', () => {
    expect(resolveCallerJwt({ ...base, metadata: { jwt: TEST_JWT } })).toBe(TEST_JWT);
  });

  it('throws when metadata has no JWT', () => {
    expect(() => resolveCallerJwt(base)).toThrow(/no caller JWT/i);
  });

  it('throws when the JWT is blank', () => {
    expect(() => resolveCallerJwt({ ...base, metadata: { jwt: '   ' } })).toThrow(/no caller JWT/i);
  });
});

describe('resolveBaseUrl', () => {
  const ENV_KEY = 'QUANTMAIL_API_BASE_URL';
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[ENV_KEY];
    delete process.env[ENV_KEY];
  });

  afterEach(() => {
    if (saved === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = saved;
  });

  it('prefers the explicit option', () => {
    expect(resolveBaseUrl({ baseUrl: 'https://staging.example/' })).toBe('https://staging.example');
  });

  it('falls back to the env var', () => {
    process.env[ENV_KEY] = 'https://env.example/';
    expect(resolveBaseUrl()).toBe('https://env.example');
  });

  it('defaults to production', () => {
    expect(resolveBaseUrl()).toBe(DEFAULT_QUANTMAIL_API_BASE_URL);
  });
});

describe('mail read handlers', () => {
  let executor: ToolExecutor;
  let fetchMock: FetchMock;
  let calls: Array<{ url: string; init?: Record<string, unknown> }>;
  let context: ToolExecutionContext;

  beforeEach(() => {
    calls = [];
    fetchMock = async (url: string, init?: Record<string, unknown>) => {
      calls.push({ url, init });
      return jsonResponse(200, { success: true, data: [] });
    };
    executor = new ToolExecutor();
    registerMailReadHandlers(executor, {
      baseUrl: TEST_BASE,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    context = {
      userId: 'user-1',
      sessionId: 's-1',
      permissions: 0,
      dryRun: false,
      metadata: { jwt: TEST_JWT },
    };
  });

  function authHeader(): string | undefined {
    const init = calls[0]?.init;
    const headers = init?.['headers'] as Record<string, string> | undefined;
    return headers?.['Authorization'];
  }

  describe('quantmail.search', () => {
    it('queries the backend as the user and maps summaries', async () => {
      fetchMock = async (url, init) => {
        calls.push({ url, init });
        return jsonResponse(200, {
          success: true,
          data: [
            emailRow(),
            emailRow({ id: 'msg-2', subject: 'Re: invoice', isRead: true }),
          ],
        });
      };
      executor = new ToolExecutor();
      registerMailReadHandlers(executor, {
        baseUrl: TEST_BASE,
        fetchImpl: fetchMock as unknown as typeof fetch,
      });

      const result = await executor.executeSingle('quantmail.search', { query: 'invoice' }, context);

      expect(result.success).toBe(true);
      const url = new URL(calls[0]!.url);
      expect(`${url.origin}${url.pathname}`).toBe(`${TEST_BASE}/api/emails/search`);
      expect(url.searchParams.get('q')).toBe('invoice');
      expect(url.searchParams.get('pageSize')).toBe('20');
      expect(authHeader()).toBe(`Bearer ${TEST_JWT}`);

      const data = result.data as Array<Record<string, unknown>>;
      expect(data).toHaveLength(2);
      expect(data[0]).toMatchObject({
        id: 'msg-1',
        subject: 'Invoice #1234',
        from: 'billing@acme.com',
        fromName: 'Acme Billing',
        unread: true,
      });
      expect(data[1]).toMatchObject({ id: 'msg-2', unread: false });
      expect(String(data[0]!['snippet'])).toContain('invoice for October');
    });

    it('refuses to run without a caller JWT and never hits the backend', async () => {
      const noJwt = { ...context, metadata: undefined };
      const result = await executor.executeSingle('quantmail.search', { query: 'invoice' }, noJwt);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/no caller JWT/i);
      expect(calls).toHaveLength(0);
    });

    it('clamps huge limits to the page cap', async () => {
      await executor.executeSingle('quantmail.search', { query: 'x', limit: 5000 }, context);
      const url = new URL(calls[0]!.url);
      expect(url.searchParams.get('pageSize')).toBe('100');
    });

    it('rejects an empty query', async () => {
      const result = await executor.executeSingle('quantmail.search', { query: '  ' }, context);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/non-empty `query`/);
      expect(calls).toHaveLength(0);
    });

    it('reports a 401 honestly instead of fabricating results', async () => {
      fetchMock = async (url, init) => {
        calls.push({ url, init });
        return jsonResponse(401, { success: false, error: { message: 'bad token' } });
      };
      executor = new ToolExecutor();
      registerMailReadHandlers(executor, {
        baseUrl: TEST_BASE,
        fetchImpl: fetchMock as unknown as typeof fetch,
      });
      const result = await executor.executeSingle('quantmail.search', { query: 'invoice' }, context);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/HTTP 401/);
    });
  });

  describe('quantmail.listUnread', () => {
    it('returns only unread mail plus the backend unread count', async () => {
      fetchMock = async (url, init) => {
        calls.push({ url, init });
        return jsonResponse(200, {
          success: true,
          unreadCount: 42,
          data: [
            emailRow({ id: 'u1', isRead: false }),
            emailRow({ id: 'r1', isRead: true }),
            emailRow({ id: 'u2', isRead: false }),
          ],
        });
      };
      executor = new ToolExecutor();
      registerMailReadHandlers(executor, {
        baseUrl: TEST_BASE,
        fetchImpl: fetchMock as unknown as typeof fetch,
      });

      const result = await executor.executeSingle('quantmail.listUnread', { limit: 10 }, context);

      expect(result.success).toBe(true);
      const url = new URL(calls[0]!.url);
      expect(url.pathname).toBe('/api/emails/');
      expect(url.searchParams.get('folderType')).toBe('INBOX');
      expect(authHeader()).toBe(`Bearer ${TEST_JWT}`);

      const data = result.data as { emails: Array<{ id: string }>; unreadCount: number };
      expect(data.emails.map((e) => e.id)).toEqual(['u1', 'u2']);
      expect(data.unreadCount).toBe(42);
    });
  });

  describe('quantmail.getMessage', () => {
    it('fetches one message and maps the full detail', async () => {
      fetchMock = async (url, init) => {
        calls.push({ url, init });
        return jsonResponse(200, {
          success: true,
          data: emailRow({ bodyPlain: 'Full body text here.' }),
        });
      };
      executor = new ToolExecutor();
      registerMailReadHandlers(executor, {
        baseUrl: TEST_BASE,
        fetchImpl: fetchMock as unknown as typeof fetch,
      });

      const result = await executor.executeSingle(
        'quantmail.getMessage',
        { messageId: 'msg-1' },
        context,
      );

      expect(result.success).toBe(true);
      const url = new URL(calls[0]!.url);
      expect(url.pathname).toBe('/api/emails/msg-1');
      expect(authHeader()).toBe(`Bearer ${TEST_JWT}`);

      const data = result.data as Record<string, unknown>;
      expect(data).toMatchObject({
        id: 'msg-1',
        subject: 'Invoice #1234',
        from: 'billing@acme.com',
        bodyText: 'Full body text here.',
        to: ['user@quantmail.in'],
        hasAttachments: false,
      });
    });

    it('refuses a suspicious message id without touching the backend', async () => {
      const result = await executor.executeSingle(
        'quantmail.getMessage',
        { messageId: '../../admin' },
        context,
      );
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/unexpected shape/);
      expect(calls).toHaveLength(0);
    });

    it('requires a message id', async () => {
      const result = await executor.executeSingle('quantmail.getMessage', {}, context);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/non-empty `messageId`/);
      expect(calls).toHaveLength(0);
    });

    it('reports a backend 404 honestly', async () => {
      fetchMock = async (url, init) => {
        calls.push({ url, init });
        return jsonResponse(404, { success: false, error: { message: 'not found' } });
      };
      executor = new ToolExecutor();
      registerMailReadHandlers(executor, {
        baseUrl: TEST_BASE,
        fetchImpl: fetchMock as unknown as typeof fetch,
      });
      const result = await executor.executeSingle(
        'quantmail.getMessage',
        { messageId: 'missing' },
        context,
      );
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/HTTP 404/);
    });
  });

  describe('dry-run', () => {
    it('never calls the backend in dry-run mode', async () => {
      const result = await executor.executeSingle(
        'quantmail.search',
        { query: 'invoice' },
        { ...context, dryRun: true },
      );
      expect(result.success).toBe(true);
      expect(calls).toHaveLength(0);
    });
  });
});
