import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

// Craft render create (C-2): POST /craft/effects/render. The backend
// refuses 503 CRAFT_NOT_CONFIGURED when the companion binary is not
// configured; the proxy passes the verdict through untouched.
export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/craft/effects/render');
}
