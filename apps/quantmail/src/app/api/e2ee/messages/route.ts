// encryption (E2EE) seam proxy (Layer 4):
//   POST /api/e2ee/messages -> backend POST /e2ee/messages  (relay ciphertext)
//   GET  /api/e2ee/messages -> backend GET  /e2ee/messages  (drain inbox)
// Forwards bearer + x-request-id. Bodies carry opaque CIPHERTEXT envelopes only;
// decryption happens client-side via the engine (Req 7.5).
import type { NextRequest } from 'next/server';
import { proxyEncryptionRequest } from '../../_lib/encryption-proxy';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => undefined);
  return proxyEncryptionRequest(request, '/e2ee/messages', { body });
}

export async function GET(request: NextRequest) {
  return proxyEncryptionRequest(request, '/e2ee/messages', {
    searchParams: request.nextUrl.searchParams,
  });
}
