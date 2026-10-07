// Blind-index upload seam proxy (Layer 4, W5):
//   POST /api/search/index -> backend POST /search/index
// Uploads a sent E2EE message's blind-index token hashes (client tokenize +
// HMAC on send, Req 14.1). Forwards bearer + x-request-id. Bodies carry the
// message id, conversation id, and OPAQUE HMAC token hashes only — the owner is
// derived server-side from the session and the Search_Key/plaintext never
// transit here (Req 14.2, 14.3, 16.1).
import type { NextRequest } from 'next/server';
import { proxySearchRequest } from '../../_lib/search-proxy';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => undefined);
  return proxySearchRequest(request, '/search/index', { body });
}
