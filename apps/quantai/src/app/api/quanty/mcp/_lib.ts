// ============================================================================
// Quanty MCP proxy helper (Next.js route layer).
//
// Q2 (`feat/quanty-mcp-production`) owns the Fastify backend routes
// (`apps/quantmail/backend/routes/quanty-mcp.ts`). Until that backend is live,
// these Next routes degrade honestly: GET /connections returns the built-in
// session-derived connections with `backendReady: false`; mutations return a
// 501 with an honest MCP_BACKEND_UNAVAILABLE error — never a fake success.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '@quant/api-client';
import { getBuiltinConnections, type McpConnection } from '../../../../lib/connectors/catalog';

/**
 * QuantMail Fastify backend origin (Q2's routes live there).
 * Single env var, same pattern as QUANTAI_BACKEND_URL.
 */
export const QUANTY_MCP_BACKEND_URL =
  process.env.QUANTY_MCP_BACKEND_URL ?? 'http://localhost:3001';

export const MCP_BACKEND_UNAVAILABLE = {
  ok: false,
  error: {
    code: 'MCP_BACKEND_UNAVAILABLE',
    message:
      'The connector service is not configured yet. External connectors are coming soon — built-in ecosystem connectors already work.',
  },
};

export interface ConnectionsResponse {
  connections: McpConnection[];
  /** False until Q2's production backend is deployed; mutations will 501. */
  backendReady: boolean;
}

function isBackendUpError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('ECONNREFUSED') ||
    msg.includes('fetch failed') ||
    msg.includes('Failed to fetch') ||
    msg.includes('aborted')
  );
}

/**
 * proxyToBackend converts transport failures into 502/504 JSON responses
 * instead of throwing — detect those and treat them as "backend down".
 */
async function isBackendDownResponse(res: NextResponse): Promise<boolean> {
  if (![502, 503, 504].includes(res.status)) return false;
  try {
    const data = (await res.clone().json()) as any;
    const code = data?.error?.code;
    return code === 'BACKEND_UNAVAILABLE' || code === 'TIMEOUT' || code === 'INVALID_RESPONSE';
  } catch {
    return false;
  }
}

/**
 * GET /api/quanty/mcp/connections
 * Merges Q2 backend connections (when reachable) with honest built-in
 * session-derived connections. Never fabricates OAuth grants.
 */
export async function getConnections(request: NextRequest): Promise<NextResponse> {
  const builtin = getBuiltinConnections();
  const fallback = () =>
    NextResponse.json({
      connections: builtin,
      backendReady: false,
    } satisfies ConnectionsResponse);
  try {
    const res = await proxyToBackend(request, {
      backendUrl: QUANTY_MCP_BACKEND_URL,
      path: '/api/quanty/mcp/connections',
      timeout: 5000,
    });
    if (!res.ok || (await isBackendDownResponse(res))) return fallback();
    const data = (await res.json()) as { connections?: McpConnection[] };
    const backend = Array.isArray(data.connections) ? data.connections : [];
    // Built-ins are session-derived; backend rows win on id collision.
    const seen = new Set(backend.map((c) => c.provider));
    const merged = [...backend, ...builtin.filter((c) => !seen.has(c.provider))];
    return NextResponse.json({ connections: merged, backendReady: true } satisfies ConnectionsResponse);
  } catch (error) {
    if (!isBackendUpError(error)) throw error;
    return fallback();
  }
}

/**
 * Proxy a mutation to the Q2 backend. On unreachable backend, return an
 * HONEST 501 — never a fake `{ ok: true }`.
 */
export async function proxyMcpMutation(
  request: NextRequest,
  path: string,
): Promise<NextResponse> {
  try {
    const res = await proxyToBackend(request, {
      backendUrl: QUANTY_MCP_BACKEND_URL,
      path,
      timeout: 15000,
    });
    if (await isBackendDownResponse(res)) {
      return NextResponse.json(MCP_BACKEND_UNAVAILABLE, { status: 501 });
    }
    return res;
  } catch (error) {
    if (!isBackendUpError(error)) throw error;
    return NextResponse.json(MCP_BACKEND_UNAVAILABLE, { status: 501 });
  }
}
