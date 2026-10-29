// ============================================================================
// QuantCooks CP-1 — MCP wiring (§9, behind the §9.5 flag).
//
// The MCP surface is the @quant/quant-tools gateway server (Streamable
// HTTP, tools/list + tools/call, confirmation gating) fed by the §2.3
// bridge with surface 'mcp'. It ships behind QUANTCOOKS_MCP_ENABLED=1
// (default OFF) so CP-1 can land the wiring without opening an external
// surface before CP-3's delegation verification exists (K11):
//
//  - No token issuance path exists in CP-1 (that is CP-3/CP-4's OAuth
//    grant against the ecosystem SSO) — the gateway therefore has no
//    registered tokens and authenticates nobody.
//  - Even with a token, the bridge's handlers claim agent identity
//    ('mcp-host'), and the registry refuses claimed delegations with
//    DELEGATION_NOT_CONFIGURED until CP-3. Tools/list still serves the
//    real catalogue: discovery is not execution.
//
// Auth is sign-in, never keys (§9.3): there is no QuantCooks API key —
// nothing to paste, leak or rotate. The public URL is configuration
// (QUANTCOOKS_PUBLIC_MCP_URL), never hard-coded in code paths.
// ============================================================================

import type { FastifyInstance } from 'fastify';
import { QuantyMcpServer } from '@quant/quant-tools';
import type { ToolRegistry } from './registry';
import { buildToolRegistry } from './index';
import { buildQuantToolsBridge, type QuantToolsBridge } from './quant-tools.adapter';
import type { StoragePort } from '../services/storage.adapter';

export function quantCooksMcpPublicUrl(): string {
  return process.env['QUANTCOOKS_PUBLIC_MCP_URL'] ?? 'http://localhost:3013/mcp';
}

export function buildQuantCooksMcpServer(registry: ToolRegistry): {
  server: QuantyMcpServer;
  bridge: QuantToolsBridge;
} {
  const bridge = buildQuantToolsBridge(registry, { surface: 'mcp', agentId: 'mcp-host' });
  const server = new QuantyMcpServer(bridge.pkgRegistry, bridge.executor);
  return { server, bridge };
}

/**
 * Mount the gateway on the Fastify instance at /mcp (server.ts only,
 * flag-gated by the caller). The handler hijacks the reply and hands the
 * raw node request/response to the gateway's Streamable HTTP transport.
 */
export async function mountQuantCooksMcp(
  app: FastifyInstance,
  opts: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma: any;
    storage: StoragePort | null;
  },
): Promise<{ server: QuantyMcpServer }> {
  const { registry } = buildToolRegistry({ prisma: opts.prisma, storage: opts.storage });
  const { server } = buildQuantCooksMcpServer(registry);

  app.all('/mcp', async (request, reply) => {
    reply.hijack();
    await server.handleHttp(request.raw, reply.raw);
  });

  return { server };
}
