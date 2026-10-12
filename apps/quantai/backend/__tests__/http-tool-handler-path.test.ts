// F-190: the generic HTTP tool handler must interpolate `:param` route
// segments (e.g. POST /emails/:id/archive — the REAL QuantMail archive
// endpoint) instead of calling URLs with a literal ':id' in them, and must
// fail closed when a path param is missing or hostile.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createHttpToolHandler,
  mapQuantMailArchive,
} from '../services/http-tool-handler';
import { getToolRoute } from '../services/app-endpoints';
import type { ToolExecutionContext } from '@quant/quant-tools';

const BASE = 'http://localhost:3001';

function ctx(overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
  return {
    userId: 'user-1',
    sessionId: 'sess-1',
    permissions: 2,
    dryRun: false,
    metadata: { jwt: 'test-jwt' },
    ...overrides,
  };
}

describe('mapQuantMailArchive', () => {
  it('maps messageId -> id for the :id route segment', () => {
    expect(mapQuantMailArchive({ messageId: 'abc-123' })).toEqual({ id: 'abc-123' });
  });

  it('rejects path-traversal-shaped ids', () => {
    expect(() => mapQuantMailArchive({ messageId: '../../etc' })).toThrow(
      /unexpected shape/,
    );
    expect(() => mapQuantMailArchive({ messageId: 'a/b' })).toThrow(/unexpected shape/);
  });

  it('rejects empty ids', () => {
    expect(() => mapQuantMailArchive({ messageId: '   ' })).toThrow(/unexpected shape/);
    expect(() => mapQuantMailArchive({})).toThrow(/unexpected shape/);
  });
});

describe('createHttpToolHandler path params', () => {
  let fetchStub: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchStub = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ success: true, data: { message: 'Email archived' } }),
    }));
    (globalThis as Record<string, unknown>).fetch = fetchStub;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>).fetch;
  });

  it('the archive route points at the REAL QuantMail endpoint shape', () => {
    const route = getToolRoute('quantmail', 'quantmail.archive');
    expect(route).toBeDefined();
    expect(route!.method).toBe('POST');
    expect(route!.path).toBe('/emails/:id/archive');
  });

  it('interpolates :id, percent-encodes it, and keeps it out of the body', async () => {
    const route = getToolRoute('quantmail', 'quantmail.archive')!;
    const handler = createHttpToolHandler({
      endpoint: { appId: 'quantmail', baseUrl: BASE, healthPath: '/health', timeoutMs: 5000, toolRoutes: {} },
      toolId: 'quantmail.archive',
      route,
      mapParams: mapQuantMailArchive,
    });

    await handler({ messageId: 'msg-42' }, ctx());

    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/emails/msg-42/archive`);
    // Consumed path param must not ride along as a payload field.
    expect(init.body).toBe(JSON.stringify({}));
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-jwt');
  });

  it('percent-encodes hostile values instead of splitting the path', async () => {
    // encodeURIComponent('..%2f..%2fx') stays one segment; the mapper rejects
    // '/' anyway, so drive substitution directly with a crafted value.
    const handler = createHttpToolHandler({
      endpoint: { appId: 'quantmail', baseUrl: BASE, healthPath: '/health', timeoutMs: 5000, toolRoutes: {} },
      toolId: 'quantmail.archive',
      route: { method: 'POST', path: '/emails/:id/archive' },
      mapParams: (p) => ({ id: p['messageId'] }),
    });
    await handler({ messageId: '..%2f..%2fx' }, ctx());
    const [url] = fetchStub.mock.calls[0] as [string, RequestInit];
    // The hostile value is double-encoded: it stays ONE path segment.
    expect(url).toBe(`${BASE}/emails/..%252f..%252fx/archive`);
    expect(new URL(url).pathname).toBe('/emails/..%252f..%252fx/archive');
  });

  it('fails closed when the path param is missing after mapping', async () => {
    const handler = createHttpToolHandler({
      endpoint: { appId: 'quantmail', baseUrl: BASE, healthPath: '/health', timeoutMs: 5000, toolRoutes: {} },
      toolId: 'quantmail.archive',
      route: { method: 'POST', path: '/emails/:id/archive' },
    });
    await expect(handler({}, ctx())).rejects.toThrow(/missing path parameter 'id'/);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('fails closed without the caller JWT (delegated auth required)', async () => {
    const route = getToolRoute('quantmail', 'quantmail.archive')!;
    const handler = createHttpToolHandler({
      endpoint: { appId: 'quantmail', baseUrl: BASE, healthPath: '/health', timeoutMs: 5000, toolRoutes: {} },
      toolId: 'quantmail.archive',
      route,
      mapParams: mapQuantMailArchive,
    });
    await expect(
      handler({ messageId: 'msg-42' }, ctx({ metadata: {} })),
    ).rejects.toThrow(/missing user JWT/);
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
