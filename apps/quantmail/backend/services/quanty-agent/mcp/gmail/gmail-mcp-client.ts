// ============================================================================
// Quanty agent — Gmail MCP client wrapper
// ============================================================================
//
// PURPOSE
//   The transport-agnostic client Quanty uses to talk to Gmail. It speaks the
//   Model Context Protocol shape (JSON-RPC 2.0: `tools/list`, `tools/call`)
//   so the same client works against:
//
//     1. A REAL MCP server process (StdioMcpTransport) — e.g. a community
//        Gmail MCP server spawned as a subprocess. This is the production
//        path: the MCP server owns the Gmail API credentials and exposes
//        Gmail operations as MCP tools.
//
//     2. The Gmail REST API directly (GmailRestTransport) — the prototype /
//        test path. Implements the same tool surface by calling the Gmail
//        API itself. Fully mockable for unit tests.
//
//   Quanty tools (./gmail-tools.ts) consume ONLY this client — they never
//   touch HTTP, subprocesses, or tokens directly.
//
// SECURITY
//   * Tokens live in the transport, never in tool args or logs.
//   * The client never logs request/response bodies (only method names +
//     success/failure for the audit trail).

// ---------------------------------------------------------------------------
// MCP protocol types (subset of the Model Context Protocol spec)
// ---------------------------------------------------------------------------

/** A tool advertised by the MCP server. */
export interface McpToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool's input. */
  inputSchema: Record<string, unknown>;
}

/** JSON-RPC 2.0 request envelope. */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

/** JSON-RPC 2.0 response envelope. */
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** Content block returned by an MCP `tools/call`. */
export interface McpContentBlock {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

/** Result of an MCP `tools/call`. */
export interface McpToolResult {
  content: McpContentBlock[];
  isError?: boolean;
}

// ---------------------------------------------------------------------------
// Transport abstraction
// ---------------------------------------------------------------------------

/**
 * How the client reaches the MCP server. Implementations:
 *  - StdioMcpTransport: spawns a real MCP server subprocess (production).
 *  - GmailRestTransport: calls the Gmail REST API directly (prototype/test).
 */
export interface McpTransport {
  /** Open the underlying connection (spawn process, validate credentials...). */
  connect(): Promise<void>;
  /** Close the underlying connection. */
  disconnect(): Promise<void>;
  /** Send one JSON-RPC request, resolve with the `result` (throws on error). */
  send(request: Omit<JsonRpcRequest, 'jsonrpc'>): Promise<unknown>;
  /** True after a successful connect(). */
  readonly connected: boolean;
}

// ---------------------------------------------------------------------------
// Stdio transport — real MCP server subprocess (production path)
// ---------------------------------------------------------------------------

export interface StdioMcpTransportOptions {
  /** Command that starts the MCP server, e.g. ['npx', '-y', '@gongrzhe/gmail-mcp-server']. */
  command: string[];
  /** Extra env vars for the server process (credentials live here, never in args). */
  env?: Record<string, string>;
  /** Milliseconds to wait for the server's initialize response. */
  initTimeoutMs?: number;
}

/**
 * Spawns a real MCP server over stdio and speaks JSON-RPC 2.0 to it.
 *
 * NOTE: This is the production transport. The prototype defaults to
 * GmailRestTransport (no subprocess needed). Both expose the identical
 * GmailMcpClient surface, so swapping is a one-line change in wiring.
 */
export class StdioMcpTransport implements McpTransport {
  private child: import('node:child_process').ChildProcess | null = null;
  private pending = new Map<number | string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private nextId = 1;
  private buffer = '';
  private _connected = false;

  constructor(private readonly options: StdioMcpTransportOptions) {}

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    if (this._connected) return;
    // Dynamic import keeps the prototype bundle free of node:child_process
    // unless this transport is actually used.
    const { spawn } = await import('node:child_process');
    const [cmd, ...args] = this.options.command;
    this.child = spawn(cmd, args, {
      env: { ...process.env, ...this.options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stdout?.on('data', (chunk: Buffer) => this.onData(chunk.toString('utf8')));
    this.child.stderr?.on('data', () => {
      // Server stderr is diagnostic noise — never forwarded, never logged
      // with secrets (servers must not print credentials to stderr).
    });
    this.child.on('exit', () => {
      this._connected = false;
      for (const { reject } of this.pending.values()) {
        reject(new Error('MCP server process exited'));
      }
      this.pending.clear();
    });

    // MCP initialize handshake.
    const timeoutMs = this.options.initTimeoutMs ?? 10_000;
    await this.withTimeout(
      this.rawSend('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'quanty-gmail-mcp-client', version: '0.1.0' },
      }),
      timeoutMs,
      'MCP server initialize timed out',
    );
    // Per MCP spec, client sends notifications/initialized after initialize.
    this.notify('notifications/initialized', {});
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    this.child?.kill();
    this.child = null;
    this._connected = false;
    this.pending.clear();
  }

  async send(request: Omit<JsonRpcRequest, 'jsonrpc'>): Promise<unknown> {
    return this.rawSend(request.method, request.params ?? {});
  }

  private async rawSend(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.child?.stdin?.writable) {
      throw new Error('MCP server not connected');
    }
    const id = this.nextId++;
    const envelope: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.child.stdin.write(`${JSON.stringify(envelope)}\n`);
    return promise;
  }

  private notify(method: string, params: Record<string, unknown>): void {
    const envelope = { jsonrpc: '2.0', method, params };
    this.child?.stdin?.write(`${JSON.stringify(envelope)}\n`);
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as JsonRpcResponse;
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) {
            reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
          } else {
            resolve(msg.result);
          }
        }
        // Notifications from the server are ignored in the prototype.
      } catch {
        // Malformed line — ignore (never log raw server output; may contain data).
      }
    }
  }

  private async withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    });
    try {
      return await Promise.race([p, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }
}

// ---------------------------------------------------------------------------
// Gmail REST transport — prototype/test path
// ---------------------------------------------------------------------------

export interface GmailRestTransportOptions {
  /** Returns a fresh (non-expired) OAuth access token. Tokens never leave this closure. */
  getAccessToken: () => Promise<string>;
  /** Gmail API base URL (override for tests). */
  baseUrl?: string;
  /** Fetch implementation (injectable for tests). */
  fetchImpl?: typeof fetch;
}

/**
 * Implements the Gmail MCP tool surface by calling the Gmail REST API
 * directly. This is what the prototype uses: no subprocess, no external
 * MCP server binary — and every HTTP call is mockable in unit tests.
 *
 * Tool surface (mirrors what a Gmail MCP server would advertise):
 *   gmail_list_messages, gmail_get_message, gmail_send_message,
 *   gmail_modify_message (labels), gmail_trash_message
 */
export class GmailRestTransport implements McpTransport {
  private _connected = false;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: GmailRestTransportOptions) {
    this.baseUrl = (options.baseUrl ?? 'https://gmail.googleapis.com/gmail/v1').replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    // Validate the token works with a cheap profile call (1 unit).
    await this.gmailFetch('/users/me/profile', { method: 'GET' });
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    this._connected = false;
  }

  async send(request: Omit<JsonRpcRequest, 'jsonrpc'>): Promise<unknown> {
    const { method, params } = request;
    if (method === 'tools/list') {
      return { tools: GMAIL_MCP_TOOL_DEFINITIONS };
    }
    if (method === 'tools/call') {
      const { name, arguments: args } = (params ?? {}) as { name: string; arguments?: Record<string, unknown> };
      return this.callGmailTool(name, args ?? {});
    }
    throw new Error(`Unsupported MCP method: ${method}`);
  }

  // -- internal -------------------------------------------------------------

  private async gmailFetch(path: string, init: RequestInit, query?: Record<string, string>): Promise<unknown> {
    const token = await this.options.getAccessToken();
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    }
    const res = await this.fetchImpl(url.toString(), {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // Never include the token in errors; truncate bodies (may contain mail).
      throw new GmailApiError(res.status, `Gmail API ${res.status}: ${body.slice(0, 200)}`);
    }
    if (res.status === 204) return null;
    return res.json() as Promise<unknown>;
  }

  private async callGmailTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const text = (v: unknown): McpToolResult => ({
      content: [{ type: 'text', text: JSON.stringify(v) }],
    });
    switch (name) {
      case 'gmail_list_messages': {
        const q = typeof args.q === 'string' ? args.q : '';
        const maxResults = Math.min(Math.max(Number(args.maxResults ?? 10) || 10, 1), 100);
        const pageToken = typeof args.pageToken === 'string' ? args.pageToken : undefined;
        const data = await this.gmailFetch('/users/me/messages', { method: 'GET' }, {
          q,
          maxResults: String(maxResults),
          ...(pageToken ? { pageToken } : {}),
        });
        return text(data);
      }
      case 'gmail_get_message': {
        const id = String(args.id ?? '');
        if (!id) throw new Error('gmail_get_message: missing id');
        const format = typeof args.format === 'string' ? args.format : 'full';
        const data = await this.gmailFetch(`/users/me/messages/${encodeURIComponent(id)}`, { method: 'GET' }, { format });
        return text(data);
      }
      case 'gmail_send_message': {
        const raw = String(args.raw ?? '');
        if (!raw) throw new Error('gmail_send_message: missing raw (base64url RFC822)');
        const threadId = typeof args.threadId === 'string' ? args.threadId : undefined;
        const data = await this.gmailFetch('/users/me/messages/send', {
          method: 'POST',
          body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }),
        });
        return text(data);
      }
      case 'gmail_modify_message': {
        const id = String(args.id ?? '');
        if (!id) throw new Error('gmail_modify_message: missing id');
        const addLabelIds = Array.isArray(args.addLabelIds) ? (args.addLabelIds as string[]) : [];
        const removeLabelIds = Array.isArray(args.removeLabelIds) ? (args.removeLabelIds as string[]) : [];
        const data = await this.gmailFetch(`/users/me/messages/${encodeURIComponent(id)}/modify`, {
          method: 'POST',
          body: JSON.stringify({ addLabelIds, removeLabelIds }),
        });
        return text(data);
      }
      case 'gmail_trash_message': {
        const id = String(args.id ?? '');
        if (!id) throw new Error('gmail_trash_message: missing id');
        const data = await this.gmailFetch(`/users/me/messages/${encodeURIComponent(id)}/trash`, { method: 'POST' });
        return text(data);
      }
      default:
        return { content: [{ type: 'text', text: `Unknown Gmail MCP tool: ${name}` }], isError: true };
    }
  }
}

/** Tool surface shared by both transports (what `tools/list` returns). */
export const GMAIL_MCP_TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    name: 'gmail_list_messages',
    description: 'List Gmail messages matching a Gmail search query.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Gmail search query (e.g. "is:unread in:inbox")' },
        maxResults: { type: 'number', description: 'Max results (1-100, default 10)' },
        pageToken: { type: 'string', description: 'Pagination token' },
      },
      required: ['q'],
    },
  },
  {
    name: 'gmail_get_message',
    description: 'Get a full Gmail message by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Gmail message ID' },
        format: { type: 'string', description: 'full | metadata | raw (default full)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'gmail_send_message',
    description: 'Send a Gmail message. `raw` is base64url-encoded RFC822.',
    inputSchema: {
      type: 'object',
      properties: {
        raw: { type: 'string', description: 'base64url-encoded RFC822 message' },
        threadId: { type: 'string', description: 'Thread ID for replies' },
      },
      required: ['raw'],
    },
  },
  {
    name: 'gmail_modify_message',
    description: 'Add/remove Gmail labels on a message (e.g. archive = remove INBOX).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Gmail message ID' },
        addLabelIds: { type: 'array', items: { type: 'string' } },
        removeLabelIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['id'],
    },
  },
  {
    name: 'gmail_trash_message',
    description: 'Move a Gmail message to trash (recoverable).',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Gmail message ID' } },
      required: ['id'],
    },
  },
];

/** Typed Gmail API error (status preserved for retry/refresh decisions). */
export class GmailApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GmailApiError';
  }
}

// ---------------------------------------------------------------------------
// High-level client used by Quanty tools
// ---------------------------------------------------------------------------

export interface GmailMcpClientOptions {
  transport: McpTransport;
}

/**
 * The client Quanty tools use. Owns the MCP session lifecycle and exposes
 * typed helpers over the raw `tools/call` surface.
 */
export class GmailMcpClient {
  private toolCache: McpToolDefinition[] | null = null;

  constructor(private readonly options: GmailMcpClientOptions) {}

  get transport(): McpTransport {
    return this.options.transport;
  }

  async connect(): Promise<void> {
    await this.options.transport.connect();
  }

  async disconnect(): Promise<void> {
    await this.options.transport.disconnect();
  }

  /** List tools advertised by the MCP server (cached after first call). */
  async listTools(): Promise<McpToolDefinition[]> {
    if (this.toolCache) return this.toolCache;
    const result = (await this.options.transport.send({ id: 'tools-list', method: 'tools/list' })) as {
      tools: McpToolDefinition[];
    };
    this.toolCache = result.tools ?? [];
    return this.toolCache;
  }

  /**
   * Call one MCP tool. Returns the parsed JSON payload of the first text
   * content block. Throws on `isError` results.
   */
  async callTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
    const result = (await this.options.transport.send({
      id: `call-${name}-${Date.now()}`,
      method: 'tools/call',
      params: { name, arguments: args },
    })) as McpToolResult;
    if (result.isError) {
      const msg = result.content.map((c) => c.text ?? '').join(' ').slice(0, 300);
      throw new Error(`Gmail MCP tool "${name}" failed: ${msg}`);
    }
    const first = result.content[0];
    if (!first?.text) return undefined as T;
    try {
      return JSON.parse(first.text) as T;
    } catch {
      return first.text as unknown as T;
    }
  }

  // -- typed Gmail helpers ---------------------------------------------------

  async listMessages(q: string, maxResults = 10, pageToken?: string): Promise<GmailListResponse> {
    return this.callTool<GmailListResponse>('gmail_list_messages', {
      q,
      maxResults,
      ...(pageToken ? { pageToken } : {}),
    });
  }

  async getMessage(id: string, format: 'full' | 'metadata' | 'raw' = 'full'): Promise<GmailMessage> {
    return this.callTool<GmailMessage>('gmail_get_message', { id, format });
  }

  async sendMessage(raw: string, threadId?: string): Promise<{ id: string; threadId: string }> {
    return this.callTool('gmail_send_message', { raw, ...(threadId ? { threadId } : {}) });
  }

  async modifyMessage(id: string, addLabelIds: string[], removeLabelIds: string[]): Promise<GmailMessage> {
    return this.callTool<GmailMessage>('gmail_modify_message', { id, addLabelIds, removeLabelIds });
  }

  async trashMessage(id: string): Promise<GmailMessage> {
    return this.callTool<GmailMessage>('gmail_trash_message', { id });
  }
}

// ---------------------------------------------------------------------------
// Gmail API shapes (subset)
// ---------------------------------------------------------------------------

export interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export interface GmailMessageHeader {
  name: string;
  value: string;
}

export interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailMessageHeader[];
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailMessagePart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
  raw?: string;
  sizeEstimate?: number;
}
