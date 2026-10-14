import { NextRequest } from 'next/server';

import { proxyToBackend } from '../../_lib/proxy';

export async function POST(request: NextRequest) {
  // Same backend path the staging ingress uses (`/api/*` → backend root), so
  // local dev exercises the registration production actually reaches.
  return proxyToBackend(request, '/ai/summarize-thread');
}
