// ============================================================================
// Tests for connect-once OAuth + capability token (P1-2):
// - JWT issue/verify round-trip, tampered/expired/malformed rejection
// - revocation denylist
// - requiredScopesForTool derivation against REAL tool definitions
// - gateway: scope gate denies/allows tools/call; legacy registerToken path
//   keeps working tier-only; tools/list carries requiredScopes
// - end-to-end HTTP: consent screen -> approve -> token (JWT) -> tools/call
// ============================================================================

import { createServer, request as httpRequest, type Server } from 'node:http';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { OAuth2Provider } from '@quant/federation';
import {
  QuantyMcpServer,
} from '../mcp/mcp-gateway-server.js';
import {
  allScopeNames,
  CapabilityTokenError,
  createConnectOnceHandler,
  isCapabilityTokenRevoked,
  issueCapabilityToken,
  JwtCapabilityTokenResolver,
  requiredScopesForTool,
  resolveCapabilitySecret,
  revokeCapabilityToken,
  SCOPE_CATALOG,
  verifyCapabilityToken,
} from '../connect-once/index.js';
import { ToolRegistry } from '../registry/tool-registry.js';
import { ToolExecutor } from '../executor/tool-executor.js';
import { mailTools } from '../tools/mail-tools.js';
import { calendarTools } from '../tools/calendar-tools.js';
import { driveTools } from '../tools/drive-tools.js';
import { paymentsTools } from '../tools/payments-tools.js';
import type { ToolDefinition } from '../types.js';

const SECRET = 'test-capability-secret-please-ignore';

function toolById(tools: ToolDefinition[], id: string): ToolDefinition {
  const tool = tools.find((t) => t.id === id);
  if (!tool) {
    throw new Error(`test setup: tool '${id}' not found`);
  }
  return tool;
}

function makeGatewayServer(secret: string = SECRET): {
  server: QuantyMcpServer;
  executor: ToolExecutor;
  registry: ToolRegistry;
} {
  const registry = new ToolRegistry();
  const search = toolById(mailTools, 'quantmail.search');
  const send = toolById(mailTools, 'quantmail.send');
  registry.register(search);
  registry.register(send);
  const executor = new ToolExecutor();
  executor.registerHandler('quantmail.search', async () => ({ results: [] }));
  executor.registerHandler('quantmail.send', async () => ({ messageId: 'msg-1' }));
  const server = new QuantyMcpServer(registry, executor, {
    tokenResolver: new JwtCapabilityTokenResolver(secret),
  });
  return { server, executor, registry };
}

function bearerJwt(scopes: string[], userId = 'user-1'): string {
  return issueCapabilityToken({ userId, scopes, clientId: 'test-client', ttlSec: 3600 }, SECRET);
}

async function rpcCall(
  server: QuantyMcpServer,
  name: string,
  args: Record<string, unknown>,
  bearer: string | undefined,
): Promise<{ ok: boolean; body: unknown }> {
  const res = await server.handleJsonRpc(
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
    bearer,
  );
  if (!res || res.error) {
    return { ok: false, body: res?.error };
  }
  return { ok: true, body: res.result };
}

// ---------------------------------------------------------------------------
// Capability token: issue / verify
// ---------------------------------------------------------------------------

describe('capability-token', () => {
  it('round-trips issue -> verify with the expected claims', () => {
    const token = issueCapabilityToken(
      { userId: 'user-1', scopes: ['mail.read', 'calendar.write'], clientId: 'c1', ttlSec: 3600 },
      SECRET,
    );
    const claims = verifyCapabilityToken(token, SECRET);
    expect(claims.sub).toBe('user-1');
    expect(claims.scopes).toEqual(['mail.read', 'calendar.write']);
    expect(claims.client_id).toBe('c1');
    expect(claims.iss).toBe('quanty-connect-once');
    expect(typeof claims.jti).toBe('string');
    expect(claims.exp).toBeGreaterThan(claims.iat);
  });

  it('rejects a tampered signature', () => {
    const token = bearerJwt(['mail.read']);
    const parts = token.split('.');
    const sig = parts[2] ?? '';
    const tampered = `${parts[0]}.${parts[1]}.${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`;
    expect(() => verifyCapabilityToken(tampered, SECRET)).toThrowError(CapabilityTokenError);
    try {
      verifyCapabilityToken(tampered, SECRET);
    } catch (e) {
      expect((e as CapabilityTokenError).code).toBe('invalid_signature');
    }
  });

  it('rejects a token signed with the wrong secret', () => {
    const token = bearerJwt(['mail.read']);
    expect(() => verifyCapabilityToken(token, 'wrong-secret')).toThrowError(
      expect.objectContaining({ code: 'invalid_signature' }),
    );
  });

  it('rejects an expired token', () => {
    // ttlSec well beyond the 60s clock-skew allowance
    const token = issueCapabilityToken(
      { userId: 'user-1', scopes: ['mail.read'], clientId: 'c1', ttlSec: -120 },
      SECRET,
    );
    expect(() => verifyCapabilityToken(token, SECRET)).toThrowError(
      expect.objectContaining({ code: 'expired' }),
    );
  });

  it('rejects malformed tokens', () => {
    for (const bad of ['abc', 'a.b', '....', '']) {
      expect(() => verifyCapabilityToken(bad, SECRET)).toThrowError(
        expect.objectContaining({ code: 'malformed' }),
      );
    }
  });

  it('supports revocation via the in-memory denylist', () => {
    const token = issueCapabilityToken(
      { userId: 'user-1', scopes: ['mail.read'], clientId: 'c1', ttlSec: 3600, jti: 'jti-test-1' },
      SECRET,
    );
    expect(isCapabilityTokenRevoked('jti-test-1')).toBe(false);
    revokeCapabilityToken('jti-test-1');
    expect(isCapabilityTokenRevoked('jti-test-1')).toBe(true);
    // verify() itself does not consult the denylist (documented split).
    expect(verifyCapabilityToken(token, SECRET).jti).toBe('jti-test-1');
  });

  it('resolveCapabilitySecret throws a clear error when the env var is missing', () => {
    const saved = process.env['QUANTY_CAPABILITY_TOKEN_SECRET'];
    delete process.env['QUANTY_CAPABILITY_TOKEN_SECRET'];
    try {
      expect(() => resolveCapabilitySecret()).toThrowError(/QUANTY_CAPABILITY_TOKEN_SECRET/);
    } finally {
      if (saved !== undefined) {
        process.env['QUANTY_CAPABILITY_TOKEN_SECRET'] = saved;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Scope derivation against real tool definitions
// ---------------------------------------------------------------------------

describe('requiredScopesForTool', () => {
  it('derives read/write from tier for plain tools', () => {
    expect(requiredScopesForTool(toolById(mailTools, 'quantmail.search'))).toEqual(['mail.read']);
    expect(requiredScopesForTool(toolById(mailTools, 'quantmail.listUnread'))).toEqual([
      'mail.read',
    ]);
    expect(requiredScopesForTool(toolById(calendarTools, 'quantcalendar.list-today'))).toEqual([
      'calendar.read',
    ]);
    expect(requiredScopesForTool(toolById(driveTools, 'quantdrive.download'))).toEqual([
      'drive.read',
    ]);
    // tier 3 -> write by the default rule
    expect(requiredScopesForTool(toolById(paymentsTools, 'quant-payments.send'))).toEqual([
      'payments.write',
    ]);
    expect(requiredScopesForTool(toolById(paymentsTools, 'quant-payments.balance'))).toEqual([
      'payments.read',
    ]);
  });

  it('applies the override table for tier 0/1 tools that mutate data', () => {
    // quantmail.send is tier 1 but sends mail -> must require mail.write
    expect(requiredScopesForTool(toolById(mailTools, 'quantmail.send'))).toEqual(['mail.write']);
    expect(requiredScopesForTool(toolById(mailTools, 'quantmail.archive'))).toEqual(['mail.write']);
    expect(requiredScopesForTool(toolById(calendarTools, 'quantcalendar.create-event'))).toEqual([
      'calendar.write',
    ]);
    expect(requiredScopesForTool(toolById(driveTools, 'quantdrive.upload'))).toEqual([
      'drive.write',
    ]);
  });

  it('returns [] for tool appIds with no scope vocabulary (tier gate only)', () => {
    const unknown: ToolDefinition = {
      ...toolById(mailTools, 'quantmail.search'),
      id: 'alien.probe',
      appId: 'alien',
    };
    expect(requiredScopesForTool(unknown)).toEqual([]);
  });

  it('every derivable scope exists in SCOPE_CATALOG, and write scopes are flagged', () => {
    const names = new Set(allScopeNames());
    for (const tool of [...mailTools, ...calendarTools, ...driveTools, ...paymentsTools]) {
      for (const scope of requiredScopesForTool(tool)) {
        expect(names.has(scope)).toBe(true);
      }
    }
    const write = SCOPE_CATALOG.find((s) => s.name === 'mail.write');
    const read = SCOPE_CATALOG.find((s) => s.name === 'mail.read');
    expect(write?.flagged).toBe(true);
    expect(read?.flagged).toBe(false);
    expect(write?.riskNote.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Gateway enforcement seam
// ---------------------------------------------------------------------------

describe('gateway capability-token seam', () => {
  it('allows tools/call when the JWT carries the required scope', async () => {
    const { server } = makeGatewayServer();
    const res = await rpcCall(server, 'quantmail.search', { query: 'invoice' }, bearerJwt(['mail.read']));
    expect(res.ok).toBe(true);
  });

  it('denies tools/call with UNAUTHENTICATED when a required scope is missing', async () => {
    const { server } = makeGatewayServer();
    // token has mail.read but quantmail.send requires mail.write (override)
    const res = await rpcCall(
      server,
      'quantmail.send',
      { to: 'a@b.c', subject: 's', body: 'b' },
      bearerJwt(['mail.read']),
    );
    expect(res.ok).toBe(false);
    const error = res.body as { code: number; message: string; data: Record<string, unknown> };
    expect(error.code).toBe(-32001);
    expect(error.message).toContain('Insufficient capability scopes');
    expect(error.data['missingScopes']).toEqual(['mail.write']);
    expect(error.data['grantedScopes']).toEqual(['mail.read']);
  });

  it('allows the write tool when the write scope is granted', async () => {
    const { server } = makeGatewayServer();
    const res = await rpcCall(
      server,
      'quantmail.send',
      { to: 'a@b.c', subject: 's', body: 'b' },
      bearerJwt(['mail.read', 'mail.write']),
    );
    expect(res.ok).toBe(true);
    const result = res.body as { content: Array<{ text: string }> };
    expect(result.content[0]?.text).toContain('msg-1');
  });

  it('rejects tampered JWTs (resolver -> null -> legacy miss -> unauthenticated)', async () => {
    const { server } = makeGatewayServer();
    const token = bearerJwt(['mail.read', 'mail.write']);
    const res = await rpcCall(server, 'quantmail.search', { query: 'x' }, `${token}tampered`);
    expect(res.ok).toBe(false);
    expect((res.body as { code: number }).code).toBe(-32001);
  });

  it('rejects revoked JWTs', async () => {
    const { server } = makeGatewayServer();
    const token = issueCapabilityToken(
      { userId: 'user-1', scopes: ['mail.read'], clientId: 'c1', ttlSec: 3600, jti: 'jti-revoke-test' },
      SECRET,
    );
    revokeCapabilityToken('jti-revoke-test');
    const res = await rpcCall(server, 'quantmail.search', { query: 'x' }, token);
    expect(res.ok).toBe(false);
    expect((res.body as { code: number }).code).toBe(-32001);
  });

  it('falls back to the legacy registerToken map (tier-only, empty scopes)', async () => {
    const { server } = makeGatewayServer();
    server.registerToken('legacy-token', 'user-9', 3);
    // legacy token has NO scopes -> quantmail.send runs on the tier gate alone
    const res = await rpcCall(
      server,
      'quantmail.send',
      { to: 'a@b.c', subject: 's', body: 'b' },
      'legacy-token',
    );
    expect(res.ok).toBe(true);
    const auth = server.authenticate('legacy-token');
    expect(auth?.scopes).toEqual([]);
  });

  it('legacy path without any resolver keeps working exactly as before', async () => {
    const registry = new ToolRegistry();
    registry.register(toolById(mailTools, 'quantmail.send'));
    const executor = new ToolExecutor();
    executor.registerHandler('quantmail.send', async () => ({ messageId: 'm' }));
    const server = new QuantyMcpServer(registry, executor);
    server.registerToken('t', 'u', 3);
    const res = await rpcCall(
      server,
      'quantmail.send',
      { to: 'a@b.c', subject: 's', body: 'b' },
      't',
    );
    expect(res.ok).toBe(true);
  });

  it('tools/list annotations carry requiredScopes per tool', async () => {
    const { server } = makeGatewayServer();
    const res = await server.handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      bearerJwt(['mail.read']),
    );
    const tools = (res?.result as { tools: Array<{ name: string; annotations: Record<string, unknown> }> })
      .tools;
    const search = tools.find((t) => t.name === 'quantmail.search');
    const send = tools.find((t) => t.name === 'quantmail.send');
    expect(search?.annotations['requiredScopes']).toEqual(['mail.read']);
    expect(send?.annotations['requiredScopes']).toEqual(['mail.write']);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: consent screen -> approve -> capability JWT -> tools/call
// ---------------------------------------------------------------------------

interface HttpResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function httpCall(
  port: number,
  method: 'GET' | 'POST',
  path: string,
  body?: string,
  contentType = 'application/x-www-form-urlencoded',
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        method,
        path,
        headers: body
          ? { 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(body) }
          : {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers as Record<string, string | string[] | undefined>,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

describe('connect-once HTTP flow (end to end)', () => {
  let server: Server;
  let port: number;
  let provider: OAuth2Provider;

  const REDIRECT_URI = 'http://127.0.0.1:9/cb';

  beforeEach(async () => {
    provider = new OAuth2Provider();
    provider.registerClient({
      clientId: 'test-client',
      clientSecret: 'test-secret',
      name: 'Test Client App',
      redirectUris: [REDIRECT_URI],
      scopes: allScopeNames(),
      grantTypes: ['authorization_code', 'refresh_token'],
    });
    const handler = createConnectOnceHandler({
      provider,
      resolveUser: async () => ({ userId: 'user-1', displayName: 'Test User' }),
      capabilitySecret: SECRET,
      capabilityTtlSec: 3600,
    });
    server = createServer((req, res) => void handler(req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('could not bind test server');
    }
    port = address.port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  });

  function authorizeUrl(scope = 'mail.read mail.write'): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: 'test-client',
      redirect_uri: REDIRECT_URI,
      scope,
      state: 'state-123',
    });
    return `/oauth/authorize?${params.toString()}`;
  }

  function nonceOf(html: string): string {
    const match = /name="nonce"\s+value="([0-9a-f]+)"/.exec(html);
    if (!match?.[1]) {
      throw new Error('consent page did not contain a nonce');
    }
    return match[1];
  }

  async function approveFlow(): Promise<{ code: string; accessToken: string }> {
    const get = await httpCall(port, 'GET', authorizeUrl());
    expect(get.status).toBe(200);
    const nonce = nonceOf(get.body);
    const decision = await httpCall(
      port,
      'POST',
      '/oauth/authorize/decision',
      new URLSearchParams({ nonce, decision: 'approve' }).toString(),
    );
    expect(decision.status).toBe(302);
    const location = decision.headers['location'];
    expect(typeof location).toBe('string');
    const code = new URL(location as string).searchParams.get('code');
    expect(code).toBeTruthy();

    const tokenRes = await httpCall(
      port,
      'POST',
      '/oauth/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: REDIRECT_URI,
        client_id: 'test-client',
      }).toString(),
    );
    expect(tokenRes.status).toBe(200);
    const tokenJson = JSON.parse(tokenRes.body) as {
      access_token: string;
      token_type: string;
      expires_in: number;
      scope: string;
      refresh_token: string;
    };
    expect(tokenJson.token_type).toBe('Bearer');
    expect(tokenJson.expires_in).toBe(3600);
    expect(tokenJson.scope).toBe('mail.read mail.write');
    expect(typeof tokenJson.refresh_token).toBe('string');
    return { code: code as string, accessToken: tokenJson.access_token };
  }

  it('renders a consent page listing scopes with risk badges', async () => {
    const res = await httpCall(port, 'GET', authorizeUrl());
    expect(res.status).toBe(200);
    expect(res.body).toContain('Test Client App');
    expect(res.body).toContain('Test User');
    expect(res.body).toContain('Mail — Read your mail');
    expect(res.body).toContain('Can make changes');
    expect(res.body).toContain('Read only');
    expect(res.body).toContain('Allow access');
    expect(res.body).toContain('Deny');
  });

  it('full flow: authorize -> approve -> token (capability JWT) -> tools/call', async () => {
    const { accessToken } = await approveFlow();

    // The access token IS a signed capability JWT.
    expect(accessToken.split('.')).toHaveLength(3);
    const claims = verifyCapabilityToken(accessToken, SECRET);
    expect(claims.sub).toBe('user-1');
    expect(claims.scopes).toEqual(['mail.read', 'mail.write']);
    expect(claims.client_id).toBe('test-client');

    // And the gateway accepts it for an in-scope tool call.
    const { server: gateway } = makeGatewayServer();
    const res = await rpcCall(gateway, 'quantmail.search', { query: 'invoice' }, accessToken);
    expect(res.ok).toBe(true);
  });

  it('deny redirects with error=access_denied and issues nothing', async () => {
    const get = await httpCall(port, 'GET', authorizeUrl());
    const nonce = nonceOf(get.body);
    const res = await httpCall(
      port,
      'POST',
      '/oauth/authorize/decision',
      new URLSearchParams({ nonce, decision: 'deny' }).toString(),
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers['location'] as string);
    expect(location.searchParams.get('error')).toBe('access_denied');
    expect(location.searchParams.get('state')).toBe('state-123');
    expect(location.searchParams.get('code')).toBeNull();
  });

  it('answers 401 with a sign-in page when nobody is logged in', async () => {
    const handler = createConnectOnceHandler({
      provider,
      resolveUser: async () => null,
      capabilitySecret: SECRET,
    });
    const anon = createServer((req, res) => void handler(req, res));
    await new Promise<void>((resolve) => anon.listen(0, '127.0.0.1', resolve));
    try {
      const address = anon.address();
      if (!address || typeof address === 'string') {
        throw new Error('bind failed');
      }
      const res = await httpCall(address.port, 'GET', authorizeUrl());
      expect(res.status).toBe(401);
      expect(res.body).toContain('Sign in required');
    } finally {
      await new Promise<void>((resolve, reject) =>
        anon.close((e) => (e ? reject(e) : resolve())),
      );
    }
  });

  it('rejects unknown scopes on the authorize page', async () => {
    const res = await httpCall(port, 'GET', authorizeUrl('mail.read evil.admin'));
    expect(res.status).toBe(400);
    expect(res.body).toContain('evil.admin');
  });

  it('revoking the capability JWT makes the gateway reject it', async () => {
    const { accessToken } = await approveFlow();
    const { server: gateway } = makeGatewayServer();

    const before = await rpcCall(gateway, 'quantmail.search', { query: 'x' }, accessToken);
    expect(before.ok).toBe(true);

    const revokeRes = await httpCall(
      port,
      'POST',
      '/oauth/revoke',
      new URLSearchParams({ token: accessToken }).toString(),
    );
    expect(revokeRes.status).toBe(200);

    const after = await rpcCall(gateway, 'quantmail.search', { query: 'x' }, accessToken);
    expect(after.ok).toBe(false);
    expect((after.body as { code: number }).code).toBe(-32001);
  });

  it('refresh grant mints a fresh capability JWT for the same subject/scopes', async () => {
    const first = await httpCall(port, 'GET', authorizeUrl());
    const nonce = nonceOf(first.body);
    const decision = await httpCall(
      port,
      'POST',
      '/oauth/authorize/decision',
      new URLSearchParams({ nonce, decision: 'approve' }).toString(),
    );
    const code = new URL(decision.headers['location'] as string).searchParams.get('code');
    const tokenRes = await httpCall(
      port,
      'POST',
      '/oauth/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: REDIRECT_URI,
        client_id: 'test-client',
      }).toString(),
    );
    const { refresh_token } = JSON.parse(tokenRes.body) as { refresh_token: string };

    const refreshRes = await httpCall(
      port,
      'POST',
      '/oauth/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token,
        client_id: 'test-client',
      }).toString(),
    );
    expect(refreshRes.status).toBe(200);
    const refreshed = JSON.parse(refreshRes.body) as { access_token: string; scope: string };
    const claims = verifyCapabilityToken(refreshed.access_token, SECRET);
    expect(claims.sub).toBe('user-1');
    expect(claims.scopes).toEqual(['mail.read', 'mail.write']);
  });
});
