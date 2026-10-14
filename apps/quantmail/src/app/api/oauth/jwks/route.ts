import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

export const dynamic = 'force-dynamic';

/**
 * fix/qm-jwks-uri-live: the public discovery document
 * (src/app/.well-known/openid-configuration/route.ts) advertises
 * jwks_uri as `${issuer}/api/oauth/jwks`. This route makes that URL
 * resolve — it proxies to the backend's GET /.well-known/jwks.json
 * (backend/routes/oauth.ts), which serves the public half of the OIDC
 * signing key(s). Relying parties fetch this to verify id_tokens.
 */
export async function GET(request: NextRequest) {
  const res = await proxyToBackend(request, '/.well-known/jwks.json');
  // The JWKS is a long-lived public document (signing keys rotate rarely):
  // cache it like the discovery document itself (`public, max-age=3600`).
  // Honest backend errors keep the proxy's no-store / upstream headers.
  if (res.status === 200) {
    res.headers.set('Cache-Control', 'public, max-age=3600');
  }
  return res;
}
