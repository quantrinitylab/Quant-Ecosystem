// Unified search seam proxy (Layer 4, W5):
//   POST /api/search -> backend POST /search
// Routes a plaintext `q` through the legacy ILIKE path (non-E2EE messages) and
// client-computed `tokenHashes` through the blind index (E2EE messages, Req
// 15.1). Forwards bearer + x-request-id. Bodies carry OPAQUE HMAC token hashes
// only; the Search_Key and plaintext never transit here (Req 14.2, 16.1).
import type { NextRequest } from 'next/server';
import { proxySearchRequest } from '../_lib/search-proxy';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => undefined);
  return proxySearchRequest(request, '/search', { body });
}
