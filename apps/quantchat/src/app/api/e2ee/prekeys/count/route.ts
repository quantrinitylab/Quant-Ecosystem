// Durable E2EE prekey seam proxy (Layer 4):
//   GET /api/e2ee/prekeys/count -> backend GET /e2ee/prekeys/count
// Returns the caller's remaining unclaimed one-time prekey count so the client
// can decide whether to replenish its pool (Req 2.7, 2.8). Forwards bearer +
// x-request-id. PUBLIC metadata only.
import type { NextRequest } from 'next/server';
import { proxyEncryptionRequest } from '../../../_lib/encryption-proxy';

export async function GET(request: NextRequest) {
  return proxyEncryptionRequest(request, '/e2ee/prekeys/count');
}
