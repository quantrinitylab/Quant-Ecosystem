// Durable E2EE prekey seam proxy (Layer 4):
//   POST /api/e2ee/prekeys -> backend POST /e2ee/prekeys
// Tops up the caller's PUBLIC one-time prekey pool (client replenishment, Req
// 2.8) — and also relays a full PUBLIC bundle publish. Forwards bearer +
// x-request-id. PUBLIC key material only; private keys/plaintext never transit
// here (Req 16.1).
import type { NextRequest } from 'next/server';
import { proxyEncryptionRequest } from '../../_lib/encryption-proxy';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => undefined);
  return proxyEncryptionRequest(request, '/e2ee/prekeys', { body });
}
