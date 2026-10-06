// ============================================================================
// Quanty MCP production — Q2 tests (no network, no real secrets)
// ============================================================================
//
// Covers:
//   1. Token cipher: AES-256-GCM encrypt/decrypt round-trip, wrong-key and
//      malformed-input rejection.
//   2. OAuth callback: happy path (code exchange → encrypted store), plus
//      invalid / tampered / expired state rejection.
//   3. Connection store: save/get/revoke/audit against a mocked Prisma
//      surface; listConnections never leaks the encrypted blob.
//   4. Tool gating: disabled connection → honest "unavailable"; destructive
//      tool (mcp.gmail.send) denied without a confirm gate, denied when the
//      gate says no, executed when the gate approves; read tools unaffected.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GmailOAuth,
  EnvKeyTokenCipher,
  gmailOAuthConfigFromEnv,
  GMAIL_SCOPES,
  type GmailOAuthConfig,
} from '../services/quanty-agent/mcp/gmail/gmail-oauth';
import {
  PrismaMcpConnectionStore,
  PrismaGmailGrantStore,
  type McpConnectionPrisma,
  type McpConnectionRow,
} from '../services/quanty-agent/mcp/connection-store';
import {
  registerMcpGmailTools,
  buildMcpGmailToolRegistry,
} from '../services/quanty-agent/mcp/gmail/gmail-registry';
import { MCP_PROVIDER_CATALOG, getProvider } from '../services/quanty-agent/mcp/catalog';
import { ToolRegistry } from '@quant/ai';
import type { AssistantContext } from '@quant/ai';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes

function testOAuthConfig(overrides: Partial<GmailOAuthConfig> = {}): GmailOAuthConfig {
  return {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'https://quantmail.in/api/quanty/mcp/callback',
    stateSecret: 'test-state-secret-32-bytes-minimum!!',
    encryptionKey: TEST_KEY,
    ...overrides,
  };
}

type MockRoute = {
  match: (url: string, init: RequestInit) => boolean;
  respond: () => unknown;
  status?: number;
};

function mockFetch(routes: MockRoute[]) {
  return vi.fn(async (url: string, init: RequestInit = {}) => {
    const route = routes.find((r) => r.match(String(url), init));
    if (!route) {
      return new Response(JSON.stringify({ error: 'no mock route' }), { status: 404 });
    }
    return new Response(JSON.stringify(route.respond()), { status: route.status ?? 200 });
  }) as unknown as typeof fetch;
}

const ctx = (userId = 'user-123'): AssistantContext =>
  ({
    userId,
    currentApp: 'quantmail',
    conversationHistory: [],
    crossAppState: {},
  }) as AssistantContext;

function mockPrisma() {
  const rows = new Map<string, McpConnectionRow>();
  const audits: Array<Record<string, unknown>> = [];
  const key = (userId: string, provider: string) => `${userId}:${provider}`;

  const prisma: McpConnectionPrisma = {
    mcpConnection: {
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const k = key(where.userId_provider.userId, where.userId_provider.provider);
        const existing = rows.get(k);
        const merged = {
          ...(existing ?? { id: `conn-${k}`, connectedAt: new Date() }),
          ...(create as object),
          ...(update as object),
          updatedAt: new Date(),
        } as McpConnectionRow;
        rows.set(k, merged);
        return merged;
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        return rows.get(key(where.userId_provider.userId, where.userId_provider.provider)) ?? null;
      }),
      delete: vi.fn(async ({ where }: any) => {
        const k = key(where.userId_provider.userId, where.userId_provider.provider);
        const existing = rows.get(k);
        rows.delete(k);
        return existing ?? {};
      }),
      findMany: vi.fn(async ({ where }: any) => {
        return [...rows.values()].filter((r) => r.userId === where.userId);
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const k = key(where.userId_provider.userId, where.userId_provider.provider);
        const existing = rows.get(k);
        if (!existing) throw new Error('not found');
        const merged = { ...existing, ...(data as object) } as McpConnectionRow;
        rows.set(k, merged);
        return merged;
      }),
    },
    mcpGrantAudit: {
      create: vi.fn(async ({ data }: any) => {
        audits.push(data as Record<string, unknown>);
        return data;
      }),
    },
  };
  return { prisma, rows, audits };
}

function validStateFor(oauth: GmailOAuth, userId: string): string {
  const url = oauth.getAuthorizationUrl(userId);
  return new URL(url).searchParams.get('state')!;
}

// ---------------------------------------------------------------------------
// 1. Token cipher
// ---------------------------------------------------------------------------

describe('EnvKeyTokenCipher', () => {
  it('round-trips encrypt → decrypt', () => {
    const cipher = new EnvKeyTokenCipher(TEST_KEY);
    const plaintext = 'refresh-token-abc-123';
    const encrypted = cipher.encrypt(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(cipher.decrypt(encrypted)).toBe(plaintext);
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const cipher = new EnvKeyTokenCipher(TEST_KEY);
    expect(cipher.encrypt('same')).not.toBe(cipher.encrypt('same'));
  });

  it('rejects decryption with the wrong key', () => {
    const cipher = new EnvKeyTokenCipher(TEST_KEY);
    const other = new EnvKeyTokenCipher('b'.repeat(64));
    expect(() => other.decrypt(cipher.encrypt('secret'))).toThrow();
  });

  it('rejects malformed ciphertext', () => {
    const cipher = new EnvKeyTokenCipher(TEST_KEY);
    expect(() => cipher.decrypt('not-a-valid-format')).toThrow('Malformed');
    // Wrong part count / bad tag → still throws (never decrypts garbage).
    expect(() => cipher.decrypt('aa:bb:cc:dd')).toThrow();
  });

  it('accepts a raw 32-char key as well as 64-hex', () => {
    const cipher = new EnvKeyTokenCipher('x'.repeat(32));
    expect(cipher.decrypt(cipher.encrypt('ok'))).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// 2. OAuth callback
// ---------------------------------------------------------------------------

describe('GmailOAuth callback', () => {
  const tokenExchangeRoutes: MockRoute[] = [
    {
      match: (url) => url.includes('oauth2.googleapis.com/token'),
      respond: () => ({
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 3600,
        scope: GMAIL_SCOPES.join(' '),
      }),
    },
    {
      match: (url) => url.includes('googleapis.com/oauth2/v3/userinfo'),
      respond: () => ({ email: 'user@gmail.com' }),
    },
  ];

  it('happy path: exchanges code, encrypts + stores the refresh token', async () => {
    const { prisma } = mockPrisma();
    const oauth = new GmailOAuth({
      config: testOAuthConfig(),
      grantStore: new PrismaGmailGrantStore(prisma),
      cipher: new EnvKeyTokenCipher(TEST_KEY),
      fetchImpl: mockFetch(tokenExchangeRoutes),
    });
    const state = validStateFor(oauth, 'user-123');
    const { userId, accountEmail } = await oauth.handleCallback('auth-code-xyz', state);
    expect(userId).toBe('user-123');
    expect(accountEmail).toBe('user@gmail.com');

    const stored = await oauth.isConnected('user-123');
    expect(stored).toBe(true);
  });

  it('rejects a tampered state signature', async () => {
    const { prisma } = mockPrisma();
    const oauth = new GmailOAuth({
      config: testOAuthConfig(),
      grantStore: new PrismaGmailGrantStore(prisma),
      cipher: new EnvKeyTokenCipher(TEST_KEY),
      fetchImpl: mockFetch(tokenExchangeRoutes),
    });
    const state = validStateFor(oauth, 'user-123');
    const tampered = state.slice(0, -4) + 'AAAA';
    await expect(oauth.handleCallback('auth-code-xyz', tampered)).rejects.toThrow(/state/i);
    expect(await oauth.isConnected('user-123')).toBe(false);
  });

  it('rejects garbage state', async () => {
    const { prisma } = mockPrisma();
    const oauth = new GmailOAuth({
      config: testOAuthConfig(),
      grantStore: new PrismaGmailGrantStore(prisma),
      cipher: new EnvKeyTokenCipher(TEST_KEY),
      fetchImpl: mockFetch(tokenExchangeRoutes),
    });
    await expect(oauth.handleCallback('auth-code-xyz', '!!!not-base64!!!')).rejects.toThrow();
  });

  it('rejects an expired state', async () => {
    const { prisma } = mockPrisma();
    const oauth = new GmailOAuth({
      config: testOAuthConfig({ stateSecret: 'another-secret-for-signing!!' }),
      grantStore: new PrismaGmailGrantStore(prisma),
      cipher: new EnvKeyTokenCipher(TEST_KEY),
      fetchImpl: mockFetch(tokenExchangeRoutes),
    });
    // Build an expired state manually (expiry in the past, valid signature).
    const { createHmac } = await import('node:crypto');
    const secret = 'another-secret-for-signing!!';
    const exp = Date.now() - 60_000;
    const payload = `user-123.${exp}`;
    const sig = createHmac('sha256', secret).update(payload).digest('hex');
    const expired = Buffer.from(`${payload}.${sig}`).toString('base64url');
    await expect(oauth.handleCallback('auth-code-xyz', expired)).rejects.toThrow(/expired/i);
  });

  it('fails closed when Google refuses the code exchange (no grant stored)', async () => {
    const { prisma } = mockPrisma();
    const oauth = new GmailOAuth({
      config: testOAuthConfig(),
      grantStore: new PrismaGmailGrantStore(prisma),
      cipher: new EnvKeyTokenCipher(TEST_KEY),
      fetchImpl: mockFetch([
        {
          match: (url) => url.includes('oauth2.googleapis.com/token'),
          respond: () => ({ error: 'invalid_grant' }),
          status: 400,
        },
      ]),
    });
    const state = validStateFor(oauth, 'user-123');
    await expect(oauth.handleCallback('bad-code', state)).rejects.toThrow(/Token exchange failed/);
    expect(await oauth.isConnected('user-123')).toBe(false);
  });

  it('fails closed when Google returns no refresh token', async () => {
    const { prisma } = mockPrisma();
    const oauth = new GmailOAuth({
      config: testOAuthConfig(),
      grantStore: new PrismaGmailGrantStore(prisma),
      cipher: new EnvKeyTokenCipher(TEST_KEY),
      fetchImpl: mockFetch([
        {
          match: (url) => url.includes('oauth2.googleapis.com/token'),
          respond: () => ({ access_token: 'x', expires_in: 3600 }),
        },
      ]),
    });
    const state = validStateFor(oauth, 'user-123');
    await expect(oauth.handleCallback('code', state)).rejects.toThrow(/refresh token/i);
  });

  it('gmailOAuthConfigFromEnv throws listing every missing var', () => {
    expect(() => gmailOAuthConfigFromEnv({} as NodeJS.ProcessEnv)).toThrow(
      /GOOGLE_OAUTH_CLIENT_ID|GMAIL_OAUTH_CLIENT_ID/,
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Connection store
// ---------------------------------------------------------------------------

describe('PrismaMcpConnectionStore', () => {
  let mocked: ReturnType<typeof mockPrisma>;
  beforeEach(() => {
    mocked = mockPrisma();
  });

  it('saves and reads back a grant (encrypted blob opaque)', async () => {
    const store = new PrismaMcpConnectionStore(mocked.prisma, 'gmail');
    await store.saveGrant({
      userId: 'u1',
      encryptedTokens: 'iv:tag:data',
      scopes: GMAIL_SCOPES,
      accountEmail: 'user@gmail.com',
    });
    const row = await store.getGrant('u1');
    expect(row?.accountEmail).toBe('user@gmail.com');
    expect(row?.encryptedTokens).toBe('iv:tag:data');
    expect(row?.enabled).toBe(true);
    expect(await store.isConnected('u1')).toBe(true);
  });

  it('upsert replaces the grant on reconnect (one row per user+provider)', async () => {
    const store = new PrismaMcpConnectionStore(mocked.prisma, 'gmail');
    await store.saveGrant({ userId: 'u1', encryptedTokens: 'first', scopes: [] });
    await store.saveGrant({ userId: 'u1', encryptedTokens: 'second', scopes: [] });
    const all = await mocked.prisma.mcpConnection.findMany({ where: { userId: 'u1' } });
    expect(all).toHaveLength(1);
    expect(all[0]!.encryptedTokens).toBe('second');
  });

  it('revoke deletes the grant and reports accurately', async () => {
    const store = new PrismaMcpConnectionStore(mocked.prisma, 'gmail');
    expect(await store.revoke('ghost')).toBe(false);
    await store.saveGrant({ userId: 'u1', encryptedTokens: 'x', scopes: [] });
    expect(await store.revoke('u1')).toBe(true);
    expect(await store.getGrant('u1')).toBeNull();
    expect(await store.isConnected('u1')).toBe(false);
  });

  it('setEnabled flips the kill switch without deleting the grant', async () => {
    const store = new PrismaMcpConnectionStore(mocked.prisma, 'gmail');
    await store.saveGrant({ userId: 'u1', encryptedTokens: 'x', scopes: [] });
    await store.setEnabled('u1', false);
    expect(await store.isConnected('u1')).toBe(false);
    expect(await store.getGrant('u1')).not.toBeNull();
    await store.setEnabled('u1', true);
    expect(await store.isConnected('u1')).toBe(true);
  });

  it('listConnections excludes the encrypted blob', async () => {
    const store = new PrismaMcpConnectionStore(mocked.prisma, 'gmail');
    await store.saveGrant({
      userId: 'u1',
      encryptedTokens: 'super-secret-blob',
      scopes: GMAIL_SCOPES,
      accountEmail: 'user@gmail.com',
    });
    const list = await store.listConnections('u1');
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('encryptedTokens');
    expect(JSON.stringify(list[0])).not.toContain('super-secret-blob');
    expect(list[0]?.accountEmail).toBe('user@gmail.com');
  });

  it('audit writes a token-free audit row', async () => {
    const store = new PrismaMcpConnectionStore(mocked.prisma, 'gmail');
    await store.audit({
      userId: 'u1',
      event: 'disconnected',
      detail: 'user-initiated',
      ipAddress: '1.2.3.4',
    });
    expect(mocked.audits).toHaveLength(1);
    expect(mocked.audits[0]?.event).toBe('disconnected');
    expect(JSON.stringify(mocked.audits[0])).not.toMatch(/refresh[_-]?token|client[_-]?secret/i);
  });

  it('PrismaGmailGrantStore adapts the prototype seam', async () => {
    const adapter = new PrismaGmailGrantStore(mocked.prisma);
    await adapter.save({
      userId: 'u1',
      encryptedRefreshToken: 'blob',
      scope: GMAIL_SCOPES.join(' '),
      accountEmail: 'user@gmail.com',
      connectedAt: new Date().toISOString(),
    });
    const grant = await adapter.get('u1');
    expect(grant?.encryptedRefreshToken).toBe('blob');
    expect(grant?.accountEmail).toBe('user@gmail.com');
    await adapter.delete('u1');
    expect(await adapter.get('u1')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Tool gating
// ---------------------------------------------------------------------------

describe('registerMcpGmailTools gating', () => {
  const gmailApiRoutes: MockRoute[] = [
    {
      // connect() validates the token with a cheap profile call.
      match: (url) => url.includes('/users/me/profile'),
      respond: () => ({ emailAddress: 'user@gmail.com', messagesTotal: 1 }),
    },
    {
      match: (url) => url.includes('gmail.googleapis.com/gmail/v1/users/me/messages') && !url.includes('/messages/'),
      respond: () => ({ messages: [{ id: 'm1', threadId: 't1' }], resultSizeEstimate: 1 }),
    },
    {
      match: (url) => url.includes('/messages/m1'),
      respond: () => ({
        id: 'm1',
        threadId: 't1',
        labelIds: ['INBOX'],
        payload: { headers: [{ name: 'Subject', value: 'Hi' }] },
      }),
    },
    {
      match: (url) => url.includes('/messages') && (url.includes('send') || url === 'send'),
      respond: () => ({ id: 'sent-1', threadId: 't1', labelIds: ['SENT'] }),
    },
  ];

  function buildRegistryWith(deps: Parameters<typeof registerMcpGmailTools>[1]) {
    const registry = new ToolRegistry();
    registerMcpGmailTools(registry, deps);
    return registry;
  }

  function toolDeps(getClient: (userId: string) => Promise<any>) {
    return { getClient, audit: () => undefined };
  }

  const searchHandler = (registry: ToolRegistry) =>
    registry.findTool('quantmail', 'mcp.gmail.search')!.handler;
  const sendHandler = (registry: ToolRegistry) =>
    registry.findTool('quantmail', 'mcp.gmail.send')!.handler;

  it('registers mcp.gmail.* namespaced tools', () => {
    const registry = buildMcpGmailToolRegistry(toolDeps(async () => null));
    const names = registry.getToolsForApp('quantmail').map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(['mcp.gmail.search', 'mcp.gmail.read', 'mcp.gmail.archive', 'mcp.gmail.send']),
    );
    expect(names.some((n) => n.startsWith('gmail_'))).toBe(false);
  });

  it('disabled connection → honest unavailable (no fake results)', async () => {
    const registry = buildRegistryWith({
      ...toolDeps(async () => {
        throw new Error('should not be called when disabled');
      }),
      isConnectionEnabled: async () => false,
    });
    const result = await searchHandler(registry)({ query: 'is:unread' }, ctx());
    expect(result.success).toBe(false);
    expect(result.error).toBe('gmail_not_connected');
    expect(result.displayMessage).toMatch(/not connected/i);
  });

  it('mcp.gmail.send is DENIED when no confirm gate is wired (fail closed)', async () => {
    const registry = buildRegistryWith({
      ...toolDeps(async () => ({})),
      isConnectionEnabled: async () => true,
      // no confirmGate — must deny, never auto-resolve
    });
    const result = await sendHandler(registry)(
      { to: 'a@b.com', subject: 'hi', body: 'hello' },
      ctx(),
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('confirmation_required');
  });

  it('mcp.gmail.send is denied when the gate says no', async () => {
    const getClient = vi.fn(async () => ({}));
    const registry = buildRegistryWith({
      ...toolDeps(getClient),
      isConnectionEnabled: async () => true,
      confirmGate: async () => false,
    });
    const result = await sendHandler(registry)(
      { to: 'a@b.com', subject: 'hi', body: 'hello' },
      ctx(),
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('confirmation_required');
    expect(getClient).not.toHaveBeenCalled();
  });

  it('mcp.gmail.send executes when the gate approves', async () => {
    const { GmailMcpClient, GmailRestTransport } = await import(
      '../services/quanty-agent/mcp/gmail/gmail-mcp-client'
    );
    const fetchImpl = mockFetch(gmailApiRoutes);
    const registry = buildRegistryWith({
      getClient: async () => {
        const transport = new GmailRestTransport({
          getAccessToken: async () => 'tok',
          fetchImpl,
        } as never);
        const client = new GmailMcpClient({ transport } as never);
        await client.connect();
        return client;
      },
      audit: () => undefined,
      isConnectionEnabled: async () => true,
      confirmGate: async (toolName, args) => {
        expect(toolName).toBe('mcp.gmail.send');
        expect(args.to).toBe('a@b.com');
        return true;
      },
    });
    const result = await sendHandler(registry)(
      { to: 'a@b.com', subject: 'hi', body: 'hello' },
      ctx(),
    );
    expect(result.success).toBe(true);
  });

  it('read tools work when connected (no confirmation needed)', async () => {
    const { GmailMcpClient, GmailRestTransport } = await import(
      '../services/quanty-agent/mcp/gmail/gmail-mcp-client'
    );
    const fetchImpl = mockFetch(gmailApiRoutes);
    const registry = buildRegistryWith({
      getClient: async () => {
        const transport = new GmailRestTransport({
          getAccessToken: async () => 'tok',
          fetchImpl,
        } as never);
        const client = new GmailMcpClient({ transport } as never);
        await client.connect();
        return client;
      },
      audit: () => undefined,
      isConnectionEnabled: async () => true,
    });
    const result = await searchHandler(registry)({ query: 'is:unread' }, ctx());
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Catalog sanity
// ---------------------------------------------------------------------------

describe('MCP provider catalog', () => {
  it('lists gmail as the only available provider', () => {
    expect(getProvider('gmail')?.available).toBe(true);
    expect(getProvider('gmail')?.tools).toContain('mcp.gmail.send');
    expect(getProvider('nope')).toBeUndefined();
  });

  it('device-source entries are honest placeholders (not connectable)', () => {
    const deviceEntries = MCP_PROVIDER_CATALOG.filter((p) => p.deviceSource);
    expect(deviceEntries.length).toBeGreaterThan(0);
    for (const entry of deviceEntries) {
      expect(entry.available).toBe(false);
    }
  });
});
