import { NextRequest } from 'next/server';
import { proxyToBackend } from '../_lib/proxy';

// The per-user read-receipts default (open tracking on new mail). Stored
// server-side in User.preferences and consulted by the compose path when a
// request omits `trackOpens` — one setting covering every compose surface.
// A per-message compose toggle still overrides it for that message.
export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/read-receipts');
}

export async function PUT(request: NextRequest) {
  return proxyToBackend(request, '/read-receipts');
}
