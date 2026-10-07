import { describe, it, expect, beforeEach } from 'vitest';
import {
  McpBridgeService,
  NullMcpTransport,
  type McpBridgePrisma,
  type McpServerRegistrationRow,
  type McpTransport,
} from '../services/mcp-bridge.service';

function createFakePrisma() {
  const rows: McpServerRegistrationRow[] = [];
  let n = 0;
  const prisma: McpBridgePrisma & { rows: McpServerRegistrationRow[] } = {
    rows,
    mcpServerRegistration: {
      async create({ data }) {
        n += 1;
        const row: McpServerRegistrationRow = {
          id: `mcp-${n}`,
          userId: String(data['userId']),
          name: String(data['name']),
          endpoint: String(data['endpoint']),
          transport: String(data['transport']),
          enabled: data['enabled'] !== false,
        };
        rows.push(row);
        return row;
      },
      async findMany({ where }) {
        return rows.filter((r) => r.userId === where['userId']);
      },
      async findFirst({ where }) {
        return (
          rows.find(
            (r) =>
              r.userId === where['userId'] &&
              (where['name'] === undefined || r.name === where['name']),
          ) ?? null
        );
      },
      async deleteMany({ where }) {
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          if (rows[i]!.userId === where['userId'] && rows[i]!.name === where['name'])
            rows.splice(i, 1);
        }
        return { count: before - rows.length };
      },
    },
  };
  return prisma;
}

describe('McpBridgeService', () => {
  let prisma: ReturnType<typeof createFakePrisma>;
  let svc: McpBridgeService;

  beforeEach(() => {
    prisma = createFakePrisma();
    svc = new McpBridgeService(prisma as never); // NullMcpTransport default
  });

  it('registers and lists external MCP servers per user', async () => {
    await svc.registerServer('u1', {
      name: 'github',
      endpoint: 'https://mcp.gh/x',
      transport: 'http',
    });
    await svc.registerServer('u2', { name: 'other', endpoint: 'https://x' });
    const list = await svc.listServers('u1');
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe('github');
    expect(list[0]!.transport).toBe('http');
  });

  it('rejects a duplicate server name for the same user', async () => {
    await svc.registerServer('u1', { name: 'github', endpoint: 'https://a' });
    await expect(
      svc.registerServer('u1', { name: 'github', endpoint: 'https://b' }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'MCP_NAME_TAKEN',
    });
  });

  it('rejects invalid name/endpoint', async () => {
    await expect(
      svc.registerServer('u1', { name: '  ', endpoint: 'https://a' }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(svc.registerServer('u1', { name: 'x', endpoint: '  ' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('unregisters a server', async () => {
    await svc.registerServer('u1', { name: 'github', endpoint: 'https://a' });
    expect((await svc.unregisterServer('u1', 'github')).removed).toBe(true);
    expect(await svc.listServers('u1')).toHaveLength(0);
  });

  it('discover/invoke FAIL CLOSED with the default NullMcpTransport (no fabrication)', async () => {
    await svc.registerServer('u1', { name: 'github', endpoint: 'https://a' });
    await expect(svc.discoverTools('u1', 'github')).rejects.toMatchObject({
      statusCode: 503,
      code: 'MCP_TRANSPORT_NOT_CONFIGURED',
    });
    await expect(svc.invokeTool('u1', 'github', 'search', {})).rejects.toMatchObject({
      statusCode: 503,
      code: 'MCP_TRANSPORT_NOT_CONFIGURED',
    });
  });

  it('404s discovery/invoke for an unregistered server', async () => {
    await expect(svc.discoverTools('u1', 'ghost')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('discovers + invokes tools through a configured transport', async () => {
    const transport: McpTransport = {
      listTools: async (t) => [{ name: `tool-for-${t.endpoint}` }],
      invokeTool: async (_t, tool, args) => ({ ok: true, output: { tool, args } }),
    };
    const wired = new McpBridgeService(prisma as never, { transport });
    await wired.registerServer('u1', { name: 'github', endpoint: 'https://a', transport: 'http' });

    const tools = await wired.discoverTools('u1', 'github');
    expect(tools[0]!.name).toBe('tool-for-https://a');

    const result = await wired.invokeTool('u1', 'github', 'search', { q: 'x' });
    expect(result).toEqual({ ok: true, output: { tool: 'search', args: { q: 'x' } } });
  });

  it('NullMcpTransport throws MCP_TRANSPORT_NOT_CONFIGURED directly', async () => {
    await expect(new NullMcpTransport().listTools()).rejects.toMatchObject({
      code: 'MCP_TRANSPORT_NOT_CONFIGURED',
    });
  });
});
