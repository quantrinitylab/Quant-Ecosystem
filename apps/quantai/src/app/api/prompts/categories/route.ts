// Prompt library categories proxy (Layer 4):
//   GET /api/prompts/categories -> backend GET /prompts/categories
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../_lib/agent-proxy';

export async function GET(request: NextRequest) {
  return proxyAgentRequest(request, '/prompts/categories');
}
