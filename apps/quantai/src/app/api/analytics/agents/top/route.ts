import { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client';

const BACKEND_URL = process.env.QUANTAI_BACKEND_URL || 'http://localhost:3020';

/**
 * GET /api/analytics/agents/top
 *
 * Proxies to the QuantAI backend GET /analytics/agents/top (Fastify
 * `analyticsRoutes` registered with prefix `/analytics`), which returns the
 * top agents by recorded run count from @quant/agentic's AgentAnalytics.
 *
 * This sub-path previously had no Next.js handler and 404'd on every call.
 * Uses the shared proxyToBackend utility so auth forwarding, the 30s timeout,
 * and backend-outage handling behave exactly like the other API seams.
 */
export async function GET(request: NextRequest) {
  return proxyToBackend(request, {
    backendUrl: BACKEND_URL,
    path: '/analytics/agents/top',
  });
}
