// ============================================================================
// Tests for the Quanty MCP gateway (P1-1):
// - JSON-RPC 2.0 framing (initialize, unknown method, invalid params)
// - tools/list publishes canonical JSON-Schema output
// - tools/call routes to registered handlers
// - risk-tier gating: tier >= 2 requires the confirmation flow
// - honest "not wired yet" for declared-but-handlerless tools
// - Streamable HTTP transport (POST only, content negotiation)
// ============================================================================

import { createServer, type Server } from 'node:http';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuantyMcpServer, CONFIRMATION_ARG_KEY } from '../mcp/mcp-gateway-server.js';
import {
  toMcpInputSchema,
  toRiskTier,
  toToolDescriptor,
} from '../mcp/descriptor-mapping.js';
import { ToolRegistry } from '../registry/tool-registry.js';
import { ToolExecutor } from '../executor/tool-executor.js';
import { registerMailReadHandlers } from '../handlers/mail-read-handlers.js';
import { mailTools } from '../tools/mail-tools.js';
import type { PermissionTier, ToolDefinition } from '../types.js';

function makeTool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    id: 'test.echo',
    appId: 'test',
    name: 'Echo',
    description: 'Echoes its input',
    inputSchema: {
      text: { type: 'string', required: true, description: 'Text to echo' },
      count: { type: 'number', required: false, description: 'Repeat count', default: 1 },
    },
    outputSchema: { type: 'object', description: 'Echo result' },
    permissionTier: 0 as PermissionTier,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['test'],
    ...overrides,
  };
}

function makeServer(tools: ToolDefinition[] = [makeTool()]): {
  server: QuantyMcpServer;
  executor: ToolExecutor;
  registry: ToolRegistry;
} {
  const registry = new ToolRegistry();
  for (const t of tools) {
    registry.register(t);
  }
  const executor = new ToolExecutor();
  const server = new QuantyMcpServer(registry, executor);
  server.registerToken('token-user-1', 'user-1', 3);
  return { server, executor, registry };
}

async function rpc(
  server: QuantyMcpServer,
  method: string,
  params?: unknown,
  id: string | number | null = 1,
  bearer = 'token-user-1',
) {
  const message: Record<string, unknown> = { jsonrpc: '2.0', method, params };
  if (id !== null || method !== 'notifications/initialized') {
    message['id'] = id;
  }
  return server.handleJsonRpc(message as never, bearer);
}

function approvalIdOf(res: unknown): string {
  const result = (res as { result?: unknown } | null)?.result as
    | { _meta?: { quanty?: { approvalId?: unknown } } }
    | undefined;
  const id = result?._meta?.quanty?.approvalId;
  if (typeof id !== 'string') {
    throw new Error('expected a confirmation approvalId in the tools/call result');
  }
  return id;
}

describe('JSON-RPC framing', () => {
  it('initialize negotiates the protocol version and advertises tools capability', async () => {
    const { server } = makeServer();
    const res = await rpc(server, 'initialize', { protocolVersion: '2024-11-05' });
    expect(res?.error).toBeUndefined();
    const result = res?.result as Record<string, unknown>;
    expect(result['protocolVersion']).toBe('2024-11-05');
    expect((result['capabilities'] as Record<string, unknown>)['tools']).toBeDefined();
    expect((result['serverInfo'] as Record<string, unknown>)['name']).toBe('quanty-mcp-gateway');
  });

  it('initialize falls back to the latest version for unknown clients', async () => {
    const { server } = makeServer();
    const res = await rpc(server, 'initialize', { protocolVersion: '1999-01-01' });
    expect((res?.result as Record<string, unknown>)['protocolVersion']).toBe('2025-06-18');
  });

  it('unknown method returns -32601', async () => {
    const { server } = makeServer();
    const res = await rpc(server, 'tools/nope');
    expect(res?.error?.code).toBe(-32601);
  });

  it('malformed JSON-RPC request returns -32600', async () => {
    const { server } = makeServer();
    const res = await server.handleJsonRpc({ method: 'ping' } as never, 'token-user-1');
    expect(res?.error?.code).toBe(-32600);
  });

  it('notifications/initialized returns no response', async () => {
    const { server } = makeServer();
    const res = await server.handleJsonRpc(
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      undefined,
    );
    expect(res).toBeNull();
  });
});

describe('tools/list', () => {
  it('publishes name, description and JSON-Schema inputSchema', async () => {
    const { server } = makeServer();
    const res = await rpc(server, 'tools/list');
    const tools = (res?.result as Record<string, unknown>)['tools'] as Array<
      Record<string, unknown>
    >;
    expect(tools).toHaveLength(1);
    const [tool] = tools;
    expect(tool?.['name']).toBe('test.echo');
    expect(tool?.['description']).toBeTruthy();
    const schema = tool?.['inputSchema'] as Record<string, unknown>;
    expect(schema['type']).toBe('object');
    const props = schema['properties'] as Record<string, Record<string, unknown>>;
    expect(props['text']?.['type']).toBe('string');
    expect(schema['required']).toEqual(['text']);
  });

  it('requires authentication', async () => {
    const { server } = makeServer();
    const res = await rpc(server, 'tools/list', undefined, 1, 'no-such-token');
    expect(res?.error?.code).toBe(-32001);
  });
});

describe('tools/call routing', () => {
  it('routes to the registered handler and returns its data as content', async () => {
    const { server, executor } = makeServer();
    executor.registerHandler('test.echo', async (params) => ({
      echoed: `${params['text']}!`,
    }));
    const res = await rpc(server, 'tools/call', {
      name: 'test.echo',
      arguments: { text: 'hello' },
    });
    const result = res?.result as Record<string, unknown>;
    expect(result['isError']).toBeFalsy();
    const content = result['content'] as Array<Record<string, string>>;
    expect(JSON.parse(content[0]?.['text'] ?? '{}')).toEqual({ echoed: 'hello!' });
  });

  it('unknown tool returns -32602', async () => {
    const { server } = makeServer();
    const res = await rpc(server, 'tools/call', { name: 'nope.missing', arguments: {} });
    expect(res?.error?.code).toBe(-32602);
  });

  it('invalid arguments return -32602 with details', async () => {
    const { server } = makeServer();
    const res = await rpc(server, 'tools/call', { name: 'test.echo', arguments: {} });
    expect(res?.error?.code).toBe(-32602);
    expect((res?.error?.data as Record<string, unknown>)['errors']).toBeDefined();
  });

  it('unauthenticated call returns -32001', async () => {
    const { server } = makeServer();
    const res = await rpc(server, 'tools/call', { name: 'test.echo' }, 1, 'bad-token');
    expect(res?.error?.code).toBe(-32001);
  });

  it('declared-but-handlerless tool returns honest not-implemented (never fake data)', async () => {
    const { server } = makeServer(); // no handler registered for test.echo
    const res = await rpc(server, 'tools/call', {
      name: 'test.echo',
      arguments: { text: 'x' },
    });
    const result = res?.result as Record<string, unknown>;
    expect(result['isError']).toBe(true);
    const content = result['content'] as Array<Record<string, string>>;
    expect(content[0]?.['text']).toContain('not wired yet');
    expect((result['_meta'] as Record<string, Record<string, unknown>>)['quanty']?.['notImplemented']).toBe(
      true,
    );
  });

  it('handler errors surface as isError content, not exceptions', async () => {
    const { server, executor } = makeServer();
    executor.registerHandler('test.echo', async () => {
      throw new Error('backend exploded');
    });
    const res = await rpc(server, 'tools/call', {
      name: 'test.echo',
      arguments: { text: 'x' },
    });
    const result = res?.result as Record<string, unknown>;
    expect(result['isError']).toBe(true);
  });
});

describe('risk-tier confirmation gating (tier >= 2 never auto-executes)', () => {
  const destructive = makeTool({
    id: 'test.delete',
    name: 'Delete',
    description: 'Deletes a record',
    permissionTier: 2 as PermissionTier,
  });

  function gated() {
    const { server, executor } = makeServer([destructive]);
    const handler = vi.fn(async () => ({ deleted: true }));
    executor.registerHandler('test.delete', handler);
    return { server, handler };
  }

  it('first call returns a confirmation card and does NOT execute', async () => {
    const { server, handler } = gated();
    const res = await rpc(server, 'tools/call', {
      name: 'test.delete',
      arguments: { text: 'rec-1' },
    });
    expect(handler).not.toHaveBeenCalled();
    const result = res?.result as Record<string, unknown>;
    expect(result['isError']).toBeFalsy();
    const content = result['content'] as Array<Record<string, string>>;
    expect(content[0]?.['text']).toContain('CONFIRMATION REQUIRED');
    const meta = (result['_meta'] as Record<string, Record<string, unknown>>)['quanty'];
    expect(meta?.['confirmationRequired']).toBe(true);
    expect(meta?.['riskTier']).toBe(2);
    expect(typeof meta?.['approvalId']).toBe('string');
  });

  it('approved confirmation executes the tool exactly once', async () => {
    const { server, handler } = gated();
    const first = await rpc(server, 'tools/call', {
      name: 'test.delete',
      arguments: { text: 'rec-1' },
    });
    const approvalId = approvalIdOf(first);

    const second = await rpc(server, 'tools/call', {
      name: 'test.delete',
      arguments: { text: 'rec-1', [CONFIRMATION_ARG_KEY]: { approvalId, approved: true } },
    });
    expect(handler).toHaveBeenCalledTimes(1);
    const result = second?.result as Record<string, unknown>;
    expect(result['isError']).toBeFalsy();

    // approval is single-use: replaying it fails
    const replay = await rpc(server, 'tools/call', {
      name: 'test.delete',
      arguments: { text: 'rec-1', [CONFIRMATION_ARG_KEY]: { approvalId, approved: true } },
    });
    expect(replay?.error?.code).toBe(-32602);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('rejected confirmation never executes', async () => {
    const { server, handler } = gated();
    const first = await rpc(server, 'tools/call', {
      name: 'test.delete',
      arguments: { text: 'rec-1' },
    });
    const approvalId = approvalIdOf(first);

    const res = await rpc(server, 'tools/call', {
      name: 'test.delete',
      arguments: { text: 'rec-1', [CONFIRMATION_ARG_KEY]: { approvalId, approved: false } },
    });
    expect(handler).not.toHaveBeenCalled();
    const result = res?.result as Record<string, unknown>;
    expect(result['isError']).toBe(true);
    const content = result['content'] as Array<Record<string, string>>;
    expect(content[0]?.['text']).toContain('rejected');
  });

  it('unknown approvalId is rejected', async () => {
    const { server, handler } = gated();
    const res = await rpc(server, 'tools/call', {
      name: 'test.delete',
      arguments: { text: 'rec-1', [CONFIRMATION_ARG_KEY]: { approvalId: 'apr-bogus', approved: true } },
    });
    expect(handler).not.toHaveBeenCalled();
    expect(res?.error?.code).toBe(-32602);
  });
});

describe('QuantyToolDescriptor mapping', () => {
  it('tier 0 -> riskTier 0, never confirm, no idempotency', () => {
    const d = toToolDescriptor(makeTool({ permissionTier: 0 as PermissionTier }));
    expect(d.riskTier).toBe(0);
    expect(d.confirmationPolicy).toBe('never');
    expect(d.idempotencyPolicy).toBe('none');
    expect(d.verificationStrategy).toBe('none');
  });

  it('tier 2 -> riskTier 2, conditional confirm, required idempotency', () => {
    const d = toToolDescriptor(
      makeTool({ permissionTier: 2 as PermissionTier, undoRecipe: null }),
    );
    expect(toRiskTier(2 as PermissionTier)).toBe(2);
    expect(d.riskTier).toBe(2);
    expect(d.confirmationPolicy).toBe('conditional');
    expect(d.idempotencyPolicy).toBe('required');
    expect(d.verificationStrategy).toBe('read-back');
  });

  it('tier 3 -> always confirm', () => {
    const d = toToolDescriptor(makeTool({ permissionTier: 3 as PermissionTier }));
    expect(d.confirmationPolicy).toBe('always');
  });

  it('undo recipe becomes the verification/compensation strategy', () => {
    const d = toToolDescriptor(
      makeTool({
        permissionTier: 2 as PermissionTier,
        undoRecipe: { toolId: 'test.undo', params: {}, description: 'undo', ttlMs: 1000 },
      }),
    );
    expect(d.verificationStrategy).toBe('compensation:test.undo');
    expect(d.compensationRef).toBe('test.undo');
  });

  it('input schema converts to JSON Schema with required list', () => {
    const schema = toMcpInputSchema(makeTool().inputSchema);
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(['text']);
    expect(schema.properties['count']?.default).toBe(1);
  });
});

describe('mail read tools through the gateway (as the user)', () => {
  it('threads the bearer JWT to the backend and returns real-shaped data', async () => {
    const registry = new ToolRegistry();
    const searchDef = mailTools.find((t) => t.id === 'quantmail.search');
    expect(searchDef).toBeDefined();
    registry.register(searchDef!);
    const executor = new ToolExecutor();

    const seenAuth: string[] = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      seenAuth.push((init?.headers as Record<string, string>)['Authorization'] ?? '');
      const body = JSON.stringify({
        success: true,
        data: [{ id: 'm1', subject: 'Invoice', snippet: 'pay me' }],
        unreadCount: 3,
      });
      return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    registerMailReadHandlers(executor, { fetchImpl, baseUrl: 'https://example.test' });
    const server = new QuantyMcpServer(registry, executor);
    server.registerToken('user-jwt-abc', 'user-1', 3);

    const res = await server.handleJsonRpc(
      {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: { name: 'quantmail.search', arguments: { query: 'invoice' } },
      },
      'user-jwt-abc',
    );
    const result = res?.result as Record<string, unknown>;
    expect(result['isError']).toBeFalsy();
    expect(seenAuth).toEqual(['Bearer user-jwt-abc']);
    const content = result['content'] as Array<Record<string, string>>;
    expect(JSON.parse(content[0]?.['text'] ?? '{}')).toHaveLength(1);
  });
});

describe('Streamable HTTP transport', () => {
  let httpServer: Server;
  let baseUrl: string;

  beforeEach(async () => {
    const { server } = makeServer();
    httpServer = createServer((req, res) => {
      void server.handleHttp(req, res);
    });
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const addr = httpServer.address();
    const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}/mcp`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  async function post(body: unknown, headers: Record<string, string> = {}) {
    return fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer token-user-1',
        ...headers,
      },
      body: JSON.stringify(body),
    });
  }

  it('serves initialize + tools/list over POST', async () => {
    const init = await post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    });
    expect(init.status).toBe(200);
    const initJson = (await init.json()) as Record<string, unknown>;
    expect((initJson['result'] as Record<string, unknown>)['protocolVersion']).toBe('2024-11-05');

    const list = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(list.status).toBe(200);
    const listJson = (await list.json()) as Record<string, unknown>;
    expect(
      ((listJson['result'] as Record<string, unknown>)['tools'] as unknown[]).length,
    ).toBe(1);
  });

  it('serves tools/call end to end over POST', async () => {
    const { server } = makeServer();
    const s2 = createServer((req, res) => {
      void server.handleHttp(req, res);
    });
    await new Promise<void>((resolve) => s2.listen(0, '127.0.0.1', resolve));
    const port = (s2.address() as { port: number }).port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: 'Bearer token-user-1',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'test.echo', arguments: { text: 'hi' } },
        }),
      });
      expect(res.status).toBe(200);
      // no handler registered -> honest not-implemented, still 200 with isError content
      const json = (await res.json()) as Record<string, unknown>;
      expect(
        ((json['result'] as Record<string, unknown>)['content'] as Array<Record<string, string>>)[0]?.[
          'text'
        ],
      ).toContain('not wired yet');
    } finally {
      await new Promise<void>((resolve) => s2.close(() => resolve()));
    }
  });

  it('rejects GET with 405', async () => {
    const res = await fetch(baseUrl, { method: 'GET' });
    expect(res.status).toBe(405);
  });

  it('rejects non-JSON content type with 415', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}',
    });
    expect(res.status).toBe(415);
  });

  it('rejects unsupported MCP-Protocol-Version with 400', async () => {
    const res = await post(
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { 'MCP-Protocol-Version': '1999-01-01' },
    );
    expect(res.status).toBe(400);
  });

  it('answers notification-only batches with 202 and no body', async () => {
    const res = await post([{ jsonrpc: '2.0', method: 'notifications/initialized' }]);
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');
  });
});
