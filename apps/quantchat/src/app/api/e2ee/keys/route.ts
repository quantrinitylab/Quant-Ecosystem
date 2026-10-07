// encryption (E2EE) seam proxy (Layer 4):
//   POST /api/e2ee/keys -> backend POST /e2ee/keys
// Publishes the caller's PUBLIC pre-key bundle (key distribution). Forwards
// bearer + x-request-id. Ciphertext/public material only (Req 7.5).
import type { NextRequest } from 'next/server';
import { proxyEncryptionRequest } from '../../_lib/encryption-proxy';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => undefined);
  return proxyEncryptionRequest(request, '/e2ee/keys', { body });
}
