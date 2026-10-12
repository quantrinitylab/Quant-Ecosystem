// WR-AI-002 — canonical endpoint resolution tests.
// Proves the gateway resolves routes from the @quant/app-registry catalog:
// stale hardcoded routes are gone, placeholders are gone, unknown tools fail
// closed, and path params are substituted or fail closed.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildGatewayRegistry,
  checkAppHealth,
  gatewayApps,
  gatewayToolCount,
  getGatewayRegistry,
  normalizeRoutePath,
  resolveCapabilityEndpoint,
  resolveToolEndpoint,
} from '../services/canonical-endpoints';
import {
  createHttpToolHandler,
  mapQuantChatSend,
  substitutePathParams,
} from '../services/http-tool-handler';
import {
  APP_ENDPOINTS,
  getEndpoint,
  getToolRoute,
} from '../services/app-endpoints';

const ENV_KEYS = ['QUANTAPP_QUANTMAIL_URL', 'QUANTAPP_QUANTCHAT_URL'];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  vi.unstubAllGlobals();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.unstubAllGlobals();
});

describe('WR-AI-002 stale routes are gone (registry-driven)', () => {
  it('quantchat.send resolves to POST /conversations/:id/messages, not POST /messages', () => {
    const r = resolveToolEndpoint('quantchat.send');
    expect(r).toBeDefined();
    expect(r!.method).toBe('POST');
    expect(r!.path).toBe('/conversations/:id/messages');
    expect(r!.appId).toBe('quantchat');
    expect(r!.capabilityId).toBe('chat.message.send');
  });

  it('quantchat.search resolves to POST /search, not GET /messages/search', () => {
    const r = resolveToolEndpoint('quantchat.search');
    expect(r).toBeDefined();
    expect(r!.method).toBe('POST');
    expect(r!.path).toBe('/search');
    expect(r!.capabilityId).toBe('chat.search.query');
  });

  it('quantmail.archive resolves to POST /emails/:id/archive, not POST /emails/archive', () => {
    const r = resolveToolEndpoint('quantmail.archive');
    expect(r).toBeDefined();
    expect(r!.method).toBe('POST');
    expect(r!.path).toBe('/emails/:id/archive');
    expect(r!.pathParams).toEqual({ id: ['messageId', 'threadId', 'id'] });
  });

  it('quantmail.send keeps the single-shot compose+send route POST /emails', () => {
    const r = resolveToolEndpoint('quantmail.send');
    expect(r).toBeDefined();
    expect(r!.method).toBe('POST');
    expect(r!.path).toBe('/emails');
  });

  it('quantmail.search resolves to GET /emails/search', () => {
    const r = resolveToolEndpoint('quantmail.search');
    expect(r).toBeDefined();
    expect(r!.method).toBe('GET');
    expect(r!.path).toBe('/emails/search');
  });
});

describe('WR-AI-002 Calendar/Drive placeholders are gone', () => {
  it('quantcalendar.create-event hits the real QuantMail calendar, not localhost:3999', () => {
    const r = resolveToolEndpoint('quantcalendar.create-event');
    expect(r).toBeDefined();
    expect(r!.method).toBe('POST');
    expect(r!.path).toBe('/events');
    expect(r!.appId).toBe('quantmail');
    expect(r!.baseUrl).toBe('http://localhost:3001');
    expect(r!.baseUrl).not.toContain('3999');
  });

  it('quantdrive.search hits GET /drive/search on the QuantMail backend', () => {
    const r = resolveToolEndpoint('quantdrive.search');
    expect(r).toBeDefined();
    expect(r!.method).toBe('GET');
    expect(r!.path).toBe('/drive/search');
    expect(r!.appId).toBe('quantmail');
    expect(r!.baseUrl).not.toContain('3999');
  });

  it('quantdrive.share resolves to POST /drive/files/:id/share', () => {
    const r = resolveToolEndpoint('quantdrive.share');
    expect(r).toBeDefined();
    expect(r!.method).toBe('POST');
    expect(r!.path).toBe('/drive/files/:id/share');
  });

  it('quantcalendar.cancel has no real backend route and stays unavailable (honest)', () => {
    // No DELETE /events/:id exists in apps/quantmail/backend/routes/calendar.ts.
    expect(resolveToolEndpoint('quantcalendar.cancel')).toBeUndefined();
  });

  it('quantcalendar.invite has no real backend route and stays unavailable (honest)', () => {
    expect(resolveToolEndpoint('quantcalendar.invite')).toBeUndefined();
  });
});

describe('WR-AI-002 fail-closed resolution', () => {
  it('unknown tool id resolves to undefined', () => {
    expect(resolveToolEndpoint('nope.not-a-tool')).toBeUndefined();
  });

  it('tool with no canonical binding stays unavailable', () => {
    expect(resolveToolEndpoint('quantmail.label')).toBeUndefined();
    expect(resolveToolEndpoint('quantchat.react')).toBeUndefined();
  });

  it('preview capabilities are honestly unavailable', () => {
    const registry = buildGatewayRegistry();
    // mail.draft.prepare exists in the canonical catalog as preview.
    expect(registry.resolve('mail.draft.prepare').status).toBe('preview');
    expect(resolveCapabilityEndpoint(registry, 'mail.draft.prepare')).toBeUndefined();
  });

  it('unknown capability id resolves to undefined', () => {
    const registry = buildGatewayRegistry();
    expect(resolveCapabilityEndpoint(registry, 'mail.nope.missing')).toBeUndefined();
  });

  it('lane extensions are registered active with verified routeRefs', () => {
    const registry = getGatewayRegistry();
    const cap = registry.resolve('chat.search.query');
    expect(cap.status).toBe('active');
    expect(cap.routeRef?.appId).toBe('quantchat');
    expect(cap.routeRef?.routeFile).toBe('apps/quantchat/backend/routes/search.ts');
    const cal = registry.resolve('mail.calendar.event.create');
    expect(cal.status).toBe('active');
    expect(cal.routeRef?.path).toBe('POST /events');
  });
});

describe('normalizeRoutePath', () => {
  it('strips the METHOD prefix and doc annotations', () => {
    expect(normalizeRoutePath('POST /emails/ (compose)')).toBe('/emails');
    expect(normalizeRoutePath('GET /emails/search')).toBe('/emails/search');
    expect(normalizeRoutePath('POST /conversations/:id/messages')).toBe(
      '/conversations/:id/messages',
    );
  });
});

describe('substitutePathParams', () => {
  it('substitutes :id from the first present candidate key', () => {
    expect(
      substitutePathParams('/conversations/:id/messages', { channelId: 'c1' }, { id: ['channelId', 'conversationId', 'id'] }),
    ).toBe('/conversations/c1/messages');
    expect(
      substitutePathParams('/emails/:id/archive', { messageId: 'm9' }, { id: ['messageId', 'id'] }),
    ).toBe('/emails/m9/archive');
  });

  it('URL-encodes substituted values', () => {
    expect(substitutePathParams('/x/:id', { id: 'a b/c' }, {})).toBe('/x/a%20b%2Fc');
  });

  it('fails closed when no candidate value exists', () => {
    expect(() =>
      substitutePathParams('/conversations/:id/messages', {}, { id: ['channelId'] }),
    ).toThrow(/missing value for ':id'/);
  });

  it('fails closed on empty-string values', () => {
    expect(() =>
      substitutePathParams('/x/:id', { id: '' }, {}),
    ).toThrow(/missing value for ':id'/);
  });
});

describe('mapQuantChatSend', () => {
  it('maps agent schema to the QuantChat send contract', () => {
    expect(mapQuantChatSend({ channelId: 'c1', message: 'hello', replyTo: 'm2' })).toEqual({
      content: 'hello',
      type: 'text',
      replyToId: 'm2',
    });
  });

  it('rejects empty messages before any HTTP call', () => {
    expect(() => mapQuantChatSend({ channelId: 'c1', message: '   ' })).toThrow(
      /non-empty message/,
    );
  });
});

describe('createHttpToolHandler with canonical routes', () => {
  function stubFetch() {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
    return calls;
  }

  const ctx = (jwt = 'jwt-token') => ({
    userId: 'u1',
    permissions: 1 as const,
    metadata: { jwt },
  });

  it('calls POST /conversations/:id/messages with the substituted channel id', async () => {
    const calls = stubFetch();
    const handler = createHttpToolHandler({
      endpoint: { appId: 'quantchat', baseUrl: 'http://qc.test', timeoutMs: 1000 },
      toolId: 'quantchat.send',
      route: { method: 'POST', path: '/conversations/:id/messages' },
      pathParams: { id: ['channelId', 'conversationId', 'id'] },
      mapParams: mapQuantChatSend,
    });
    await handler({ channelId: 'c42', message: 'hi' }, ctx() as never);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://qc.test/conversations/c42/messages');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      content: 'hi',
      type: 'text',
    });
    expect(calls[0].init.headers).toMatchObject({ Authorization: 'Bearer jwt-token' });
  });

  it('fails closed when the path param is missing — no request is sent', async () => {
    const calls = stubFetch();
    const handler = createHttpToolHandler({
      endpoint: { appId: 'quantchat', baseUrl: 'http://qc.test', timeoutMs: 1000 },
      toolId: 'quantchat.send',
      route: { method: 'POST', path: '/conversations/:id/messages' },
      pathParams: { id: ['channelId'] },
    });
    await expect(handler({ message: 'hi' }, ctx() as never)).rejects.toThrow(
      /missing value for ':id'/,
    );
    expect(calls).toHaveLength(0);
  });

  it('fails closed without a caller JWT', async () => {
    const calls = stubFetch();
    const handler = createHttpToolHandler({
      endpoint: { appId: 'quantmail', baseUrl: 'http://qm.test', timeoutMs: 1000 },
      toolId: 'quantmail.search',
      route: { method: 'GET', path: '/emails/search' },
    });
    await expect(handler({ q: 'x' }, ctx('') as never)).rejects.toThrow(/missing user JWT/);
    expect(calls).toHaveLength(0);
  });
});

describe('gateway app inventory (health endpoint inputs)', () => {
  it('lists only canonical owning apps — no fake quantcalendar/quantdrive entries', () => {
    const apps = gatewayApps();
    expect(apps).toEqual(['quantchat', 'quantmail']);
    expect(apps).not.toContain('quantcalendar');
    expect(apps).not.toContain('quantdrive');
  });

  it('counts bound tools per owning app', () => {
    expect(gatewayToolCount('quantmail')).toBeGreaterThan(0);
    expect(gatewayToolCount('quantchat')).toBeGreaterThan(0);
    expect(gatewayToolCount('quantdrive')).toBe(0);
  });

  it('checkAppHealth keeps its shape and reports tool counts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('ok', { status: 200 })),
    );
    const h = await checkAppHealth('quantmail');
    expect(h.appId).toBe('quantmail');
    expect(h.reachable).toBe(true);
    expect(h.toolCount).toBe(gatewayToolCount('quantmail'));
    expect(typeof h.latencyMs).toBe('number');

    const unknown = await checkAppHealth('quantdrive');
    expect(unknown.reachable).toBe(false);
    expect(unknown.toolCount).toBe(0);
  });
});

describe('deprecated app-endpoints shim (backwards compatibility)', () => {
  it('exposes canonical routes, not the stale table', () => {
    const route = getToolRoute('quantchat', 'quantchat.send');
    expect(route).toEqual({ method: 'POST', path: '/conversations/:id/messages' });
    // The old drifted key never matched a real tool and stays gone.
    expect(getToolRoute('quantchat', 'quantchat.send-message')).toBeUndefined();
  });

  it('APP_ENDPOINTS is derived — no localhost:3999 placeholders', () => {
    const dump = JSON.stringify(APP_ENDPOINTS);
    expect(dump).not.toContain('3999');
    expect(getEndpoint('quantmail')?.baseUrl).toBe('http://localhost:3001');
    expect(getEndpoint('quantcalendar')).toBeUndefined();
  });

  it('checkAppHealth delegates to the canonical implementation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('ok', { status: 200 })),
    );
    const h = await checkAppHealth('quantchat');
    expect(h).toEqual({
      appId: 'quantchat',
      reachable: true,
      latencyMs: expect.any(Number),
      toolCount: gatewayToolCount('quantchat'),
    });
  });
});
