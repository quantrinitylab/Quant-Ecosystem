import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/oauth/userinfo');
}
