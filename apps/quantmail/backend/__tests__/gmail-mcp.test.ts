// ============================================================================
// Quanty agent — Gmail MCP connector tests (mocked Gmail API, no network)
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GmailMcpClient,
  GmailRestTransport,
  GmailApiError,
  GMAIL_MCP_TOOL_DEFINITIONS,
} from '../services/quanty-agent/mcp/gmail/gmail-mcp-client';
import {
  GmailOAuth,
  EnvKeyTokenCipher,
  InMemoryGmailGrantStore,
  gmailOAuthConfigFromEnv,
  GMAIL_SCOPES,
} from '../services/quanty-agent/mcp/gmail/gmail-oauth';
import {
  buildQuantyGmailTools,
  buildRawEmail,
} from '../services/quanty-agent/mcp/gmail/gmail-tools';
import type { AssistantContext } from '@quant/ai';

// ---------------------------------------------------------------------------
// Mock fetch helper
// ---------------------------------------------------------------------------

type MockRoute = { match: (url: string, init: RequestInit) => boolean; respond: () => unknown; status?: number };

function mockFetch(routes: MockRoute[]) {
  return vi.fn(async (url: string, init: RequestInit = {}) => {
    const route = routes.find((r) => r.match(url, init));
    if (!route) {
      return new Response(JSON.stringify({ error: 'no mock route' }), { status: 404 });
    }
    const status = route.status ?? 200;
    return new Response(JSON.stringify(route.respond()), { status });
  }) as unknown as typeof fetch;
}

const ctx = (userId = 'user-123'): AssistantContext => ({
  userId,
  currentApp: 'quantmail' as never,
  conversationHistory: [],
  crossAppState: {},
});

const sampleListResponse = {
  messages: [
    { id: 'msg-1', threadId: 'thread-1' },
    { id: 'msg-2', threadId: 'thread-2' },
  ],
  resultSizeEstimate: 2,
};

const sampleMessage = (id: string) => ({
  id,
  threadId: `thread-${id}`,
  labelIds: ['INBOX', 'UNREAD'],
  snippet: 'Hello from the test',
  payload: {
    mimeType: 'multipart/alternative',
    headers: [
      { name: 'From', value: 'alice@example.com' },
      { name: 'To', value: 'user@gmail.com' },
      { name: 'Subject', value: 'Test subject' },
      { name: 'Date', value: 'Mon, 06 Oct 2026 10:00:00 +0000' },
    ],
    parts: [
      {
        mimeType: 'text/plain',
        body: { data: Buffer.from('Hello body text', 'utf8').toString('base64url'), size: 16 },
      },
    ],
  },
});

// ---------------------------------------------------------------------------
// GmailRestTransport
// ---------------------------------------------------------------------------

describe('GmailRestTransport', () => {
  it('connect() validates the token with a profile call', async () => {
    const fetchMock = mockFetch([
      { match: (u) => u.includes('/users/me/profile'), respond: () => ({ emailAddress: 'user@gmail.com' }) },
    ]);
    const t = new GmailRestTransport({ getAccessToken: async () => 'tok', fetchImpl: fetchMock });
    await t.connect();
    expect(t.connected).toBe(true);
    // Authorization header carried the token (never in URL).
    const [, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).not.toContain('tok');
  });

  it('throws GmailApiError with status on API failure (no token leak)', async () => {
    const fetchMock = mockFetch([
      { match: (u) => u.includes('/users/me/profile'), respond: () => ({ error: 'bad' }), status: 401 },
    ]);
    const t = new GmailRestTransport({ getAccessToken: async () => 'secret-tok', fetchImpl: fetchMock });
    await expect(t.connect()).rejects.toThrowError(GmailApiError);
    await expect(t.connect()).rejects.toThrowError(/401/);
  });

  it('tools/list returns the Gmail tool surface', async () => {
    const t = new GmailRestTransport({ getAccessToken: async () => 'tok', fetchImpl: mockFetch([]) });
    const res = (await t.send({ id: 1, method: 'tools/list' })) as { tools: unknown[] };
    expect(res.tools).toHaveLength(5);
    expect(GMAIL_MCP_TOOL_DEFINITIONS.map((d) => d.name)).toContain('gmail_list_messages');
  });

  it('rejects unknown MCP methods', async () => {
    const t = new GmailRestTransport({ getAccessToken: async () => 'tok', fetchImpl: mockFetch([]) });
    await expect(t.send({ id: 1, method: 'nope' })).rejects.toThrow(/Unsupported MCP method/);
  });
});

// ---------------------------------------------------------------------------
// GmailMcpClient
// ---------------------------------------------------------------------------

describe('GmailMcpClient', () => {
  function clientWith(routes: MockRoute[]) {
    const transport = new GmailRestTransport({
      getAccessToken: async () => 'tok',
      fetchImpl: mockFetch(routes),
    });
    return new GmailMcpClient({ transport });
  }

  it('listMessages passes query through', async () => {
    const c = clientWith([
      { match: (u) => u.includes('/users/me/messages') && !u.includes('/messages/'), respond: () => sampleListResponse },
    ]);
    const res = await c.listMessages('is:unread in:inbox', 5);
    expect(res.messages).toHaveLength(2);
    expect(res.messages![0].id).toBe('msg-1');
  });

  it('callTool throws on isError results', async () => {
    const transport = new GmailRestTransport({ getAccessToken: async () => 'tok', fetchImpl: mockFetch([]) });
    // Force an unknown tool -> isError result.
    const c = new GmailMcpClient({ transport });
    await expect(c.callTool('gmail_nope', {})).rejects.toThrow(/failed/);
  });

  it('sendMessage posts base64url raw', async () => {
    let capturedBody = '';
    const fetchMock = mockFetch([
      {
        match: (u) => u.includes('/messages/send'),
        respond: () => ({ id: 'sent-1', threadId: 'thread-9' }),
      },
    ]);
    const wrapped: typeof fetch = (async (url: unknown, init?: unknown) => {
      capturedBody = String((init as RequestInit)?.body ?? '');
      return (fetchMock as unknown as typeof fetch)(url as string, init as RequestInit);
    }) as unknown as typeof fetch;
    const c = new GmailMcpClient({
      transport: new GmailRestTransport({ getAccessToken: async () => 'tok', fetchImpl: wrapped }),
    });
    const sent = await c.sendMessage('cmF3LWJvZHk', 'thread-9');
    expect(sent.id).toBe('sent-1');
    expect(JSON.parse(capturedBody).raw).toBe('cmF3LWJvZHk');
  });
});

// ---------------------------------------------------------------------------
// GmailOAuth
// ---------------------------------------------------------------------------

const testConfig = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectUri: 'https://quantmail.in/api/quanty/gmail/callback',
  stateSecret: 'state-secret-32-bytes-long-enough!!',
  encryptionKey: 'a'.repeat(64), // 64-hex chars
};

describe('GmailOAuth', () => {
  let store: InMemoryGmailGrantStore;
  let oauth: GmailOAuth;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = new InMemoryGmailGrantStore();
    fetchMock = vi.fn();
    oauth = new GmailOAuth({
      config: testConfig,
      grantStore: store,
      cipher: new EnvKeyTokenCipher(testConfig.encryptionKey),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
  });

  it('getAuthorizationUrl includes scopes + signed state, no secret', () => {
    const url = oauth.getAuthorizationUrl('user-123');
    expect(url).toContain('accounts.google.com');
    expect(url).toContain(encodeURIComponent('https://www.googleapis.com/auth/gmail.readonly'));
    expect(url).toContain('access_type=offline');
    expect(url).not.toContain('test-client-secret');
    const state = new URL(url).searchParams.get('state')!;
    expect(state).toBeTruthy();
  });

  it('handleCallback exchanges code, encrypts refresh token, stores grant', async () => {
    // Extract the signed state from a real authorization URL.
    const url = oauth.getAuthorizationUrl('user-123');
    const state = new URL(url).searchParams.get('state')!;

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600, scope: 'gmail.readonly' }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ email: 'user@gmail.com' }), { status: 200 }));

    const { userId, accountEmail } = await oauth.handleCallback('auth-code-1', state);
    expect(userId).toBe('user-123');
    expect(accountEmail).toBe('user@gmail.com');

    const grant = await store.get('user-123');
    expect(grant).toBeTruthy();
    // Refresh token is encrypted at rest — never plaintext.
    expect(grant!.encryptedRefreshToken).not.toContain('rt-1');
    expect(grant!.encryptedRefreshToken.split(':')).toHaveLength(3);
  });

  it('handleCallback rejects tampered state', async () => {
    await expect(oauth.handleCallback('code', 'tampered-state')).rejects.toThrow(/Invalid OAuth state/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('getAccessToken returns null when not connected', async () => {
    expect(await oauth.getAccessToken('nobody')).toBeNull();
  });

  it('getAccessToken refreshes expired tokens and updates the store', async () => {
    const cipher = new EnvKeyTokenCipher(testConfig.encryptionKey);
    await store.save({
      userId: 'user-123',
      encryptedRefreshToken: cipher.encrypt('rt-old'),
      scope: GMAIL_SCOPES.join(' '),
      connectedAt: new Date().toISOString(),
    });
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'at-new', expires_in: 3600 }), { status: 200 }),
    );
    const token = await oauth.getAccessToken('user-123');
    expect(token).toBe('at-new');
    // Second call hits the in-memory cache — no extra HTTP.
    expect(await oauth.getAccessToken('user-123')).toBe('at-new');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Client secret never appears in logs/errors — assert the request body shape only.
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(init.body)).toContain('grant_type=refresh_token');
  });

  it('getAccessToken deletes the grant when refresh is rejected (revoked)', async () => {
    const cipher = new EnvKeyTokenCipher(testConfig.encryptionKey);
    await store.save({
      userId: 'user-123',
      encryptedRefreshToken: cipher.encrypt('rt-revoked'),
      scope: GMAIL_SCOPES.join(' '),
      connectedAt: new Date().toISOString(),
    });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }));
    expect(await oauth.getAccessToken('user-123')).toBeNull();
    expect(await store.get('user-123')).toBeNull();
  });

  it('EnvKeyTokenCipher round-trips and rejects tampered ciphertext', () => {
    const cipher = new EnvKeyTokenCipher(testConfig.encryptionKey);
    const enc = cipher.encrypt('super-secret-refresh-token');
    expect(cipher.decrypt(enc)).toBe('super-secret-refresh-token');
    // Flip the final hex nibble deterministically (never a no-op): setting it
    // to 'ff' is flaky — 1/256 of ciphertexts already end in 'ff', making the
    // "tamper" identical to the original so decrypt would not throw.
    const lastNibble = enc[enc.length - 1]!;
    const flipped = lastNibble === '0' ? '1' : '0';
    expect(() => cipher.decrypt(enc.slice(0, -1) + flipped)).toThrow();
  });

  it('gmailOAuthConfigFromEnv fails closed on missing env', () => {
    expect(() => gmailOAuthConfigFromEnv({} as NodeJS.ProcessEnv)).toThrow(/missing env/);
  });
});

// ---------------------------------------------------------------------------
// Quanty Gmail tools
// ---------------------------------------------------------------------------

function toolDeps(routes: MockRoute[], auditLog: unknown[] = []) {
  const transport = new GmailRestTransport({
    getAccessToken: async () => 'tok',
    fetchImpl: mockFetch(routes),
  });
  const client = new GmailMcpClient({ transport });
  return {
    deps: {
      getClient: async () => client,
      audit: (e: unknown) => {
        auditLog.push(e);
      },
    },
    auditLog,
  };
}

const gmailRoutes: MockRoute[] = [
  {
    match: (u) => /\/users\/me\/messages$/.test(u.split('?')[0]),
    respond: () => sampleListResponse,
  },
  {
    match: (u) => /\/users\/me\/messages\/msg-1/.test(u),
    respond: () => sampleMessage('msg-1'),
  },
  {
    match: (u) => /\/users\/me\/messages\/msg-2/.test(u),
    respond: () => sampleMessage('msg-2'),
  },
  {
    match: (u) => u.includes('/messages/send'),
    respond: () => ({ id: 'sent-1', threadId: 'thread-9' }),
  },
  {
    match: (u) => u.includes('/modify'),
    respond: () => sampleMessage('msg-1'),
  },
];

describe('buildQuantyGmailTools', () => {
  it('registers 4 tools with correct safety flags', () => {
    const { deps } = toolDeps([]);
    const tools = buildQuantyGmailTools(deps);
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['gmail_archive', 'gmail_read', 'gmail_search', 'gmail_send'].sort(),
    );
    const send = tools.find((t) => t.name === 'gmail_send')!;
    expect(send.destructive).toBe(true);
    expect(send.requiresConfirmation).toBe(true);
    expect(send.reversible).toBe(false);
    const archive = tools.find((t) => t.name === 'gmail_archive')!;
    expect(archive.destructive).toBe(false);
    expect(archive.reversible).toBe(true);
  });

  it('gmail_search returns message rows', async () => {
    const { deps } = toolDeps(gmailRoutes);
    const tools = buildQuantyGmailTools(deps);
    const search = tools.find((t) => t.name === 'gmail_search')!;
    const res = await search.handler({ query: 'is:unread in:inbox', maxResults: 10 }, ctx());
    expect(res.success).toBe(true);
    const data = res.data as { messages: Array<{ subject: string }> };
    expect(data.messages).toHaveLength(2);
    expect(data.messages[0].subject).toBe('Test subject');
  });

  it('gmail_read returns headers + body + attachments', async () => {
    const { deps } = toolDeps(gmailRoutes);
    const tools = buildQuantyGmailTools(deps);
    const read = tools.find((t) => t.name === 'gmail_read')!;
    const res = await read.handler({ messageId: 'msg-1' }, ctx());
    expect(res.success).toBe(true);
    const data = res.data as { body: string; subject: string };
    expect(data.body).toContain('Hello body text');
    expect(data.subject).toBe('Test subject');
  });

  it('gmail_send builds RFC822 and sends', async () => {
    const { deps } = toolDeps(gmailRoutes);
    const tools = buildQuantyGmailTools(deps);
    const send = tools.find((t) => t.name === 'gmail_send')!;
    const res = await send.handler(
      { to: 'bob@example.com', subject: 'Hi', body: 'Hello Bob' },
      ctx(),
    );
    expect(res.success).toBe(true);
    expect((res.data as { gmailId: string }).gmailId).toBe('sent-1');
  });

  it('gmail_send rejects invalid recipient', async () => {
    const auditLog: unknown[] = [];
    const { deps } = toolDeps(gmailRoutes, auditLog);
    const tools = buildQuantyGmailTools(deps);
    const send = tools.find((t) => t.name === 'gmail_send')!;
    const res = await send.handler({ to: 'not-an-email', subject: 'Hi', body: 'x' }, ctx());
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Invalid recipient/);
  });

  it('gmail_archive removes INBOX label from each message', async () => {
    const seen: string[] = [];
    const routes: MockRoute[] = [
      {
        match: (u) => u.includes('/modify'),
        respond: () => {
          seen.push('modify');
          return sampleMessage('msg-1');
        },
      },
    ];
    const { deps } = toolDeps(routes);
    const tools = buildQuantyGmailTools(deps);
    const archive = tools.find((t) => t.name === 'gmail_archive')!;
    const res = await archive.handler({ messageIds: 'msg-1, msg-2' }, ctx());
    expect(res.success).toBe(true);
    expect((res.data as { archived: number }).archived).toBe(2);
    expect(seen).toHaveLength(2);
  });

  it('returns GMAIL_NOT_CONNECTED when no grant', async () => {
    const tools = buildQuantyGmailTools({ getClient: async () => null });
    const search = tools.find((t) => t.name === 'gmail_search')!;
    const res = await search.handler({ query: 'is:unread' }, ctx());
    expect(res.success).toBe(false);
    expect(res.error).toBe('GMAIL_NOT_CONNECTED');
    expect(res.displayMessage).toMatch(/Connect Gmail/);
  });

  it('rejects missing userId and audits the failure', async () => {
    const auditLog: unknown[] = [];
    const { deps } = toolDeps(gmailRoutes, auditLog);
    const tools = buildQuantyGmailTools(deps);
    const search = tools.find((t) => t.name === 'gmail_search')!;
    const res = await search.handler({ query: 'x' }, ctx(''));
    expect(res.success).toBe(false);
    expect(auditLog).toHaveLength(1);
    expect((auditLog[0] as { success: boolean }).success).toBe(false);
  });

  it('audit log truncates long bodies and never contains tokens', async () => {
    const auditLog: Array<{ args: Record<string, unknown> }> = [];
    const { deps } = toolDeps(gmailRoutes, auditLog as unknown[]);
    const tools = buildQuantyGmailTools(deps);
    const send = tools.find((t) => t.name === 'gmail_send')!;
    const longBody = 'x'.repeat(500);
    await send.handler({ to: 'bob@example.com', subject: 'Hi', body: longBody }, ctx());
    const entry = auditLog[0];
    expect(String(entry.args.body)).toContain('[truncated]');
    expect(String(entry.args.body)).toHaveLength(200 + '…[truncated]'.length);
    expect(JSON.stringify(entry)).not.toContain('tok');
  });
});

describe('buildRawEmail', () => {
  it('builds a decodable base64url RFC822 message', () => {
    const raw = buildRawEmail({ to: 'bob@example.com', subject: 'Hi', body: 'Hello' });
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    expect(decoded).toContain('To: bob@example.com');
    expect(decoded).toContain('Subject: Hi');
    expect(decoded).toContain('Hello');
  });

  it('includes Cc/Bcc when provided', () => {
    const raw = buildRawEmail({
      to: 'a@x.com',
      subject: 's',
      body: 'b',
      cc: 'c@x.com',
      bcc: 'd@x.com',
    });
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    expect(decoded).toContain('Cc: c@x.com');
    expect(decoded).toContain('Bcc: d@x.com');
  });
});
