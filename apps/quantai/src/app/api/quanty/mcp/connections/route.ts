// GET /api/quanty/mcp/connections — list connected providers.
// Honest fallback: built-in session connections + backendReady:false when Q2 is down.
import type { NextRequest } from 'next/server';
import { getConnections } from '../_lib';

export async function GET(request: NextRequest) {
  return getConnections(request);
}
