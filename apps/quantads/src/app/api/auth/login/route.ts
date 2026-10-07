import { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client/proxy';

// QuantMail is the ecosystem's OAuth2/OIDC identity provider (canonical
// infra/PORTS.md: quantmail backend :3010). QuantAds proxies credential login
// to it; on backend-down the shared proxy fails closed (502), never a fabricated
// session.
const QUANTMAIL_URL = process.env.QUANTMAIL_BACKEND_URL || 'http://localhost:3010';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return proxyToBackend(request, { backendUrl: QUANTMAIL_URL, path: '/auth/login', body });
}
