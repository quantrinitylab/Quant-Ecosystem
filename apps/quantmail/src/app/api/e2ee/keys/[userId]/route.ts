// encryption (E2EE) seam proxy (Layer 4):
//   GET /api/e2ee/keys/:userId -> backend GET /e2ee/keys/:userId
// Fetches a peer's published PUBLIC pre-key bundles so the caller can establish
// a session client-side. Forwards bearer + x-request-id. Public material only.
import type { NextRequest } from 'next/server';
import { proxyEncryptionRequest } from '../../../_lib/encryption-proxy';

export async function GET(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const { userId } = await context.params;
  return proxyEncryptionRequest(request, `/e2ee/keys/${encodeURIComponent(userId)}`);
}
