// Bitmoji seam proxy: GET /api/bitmoji/current -> backend GET /bitmoji/me (QC-F-089)
// The /bitmoji page loads its saved config from this path.
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/bitmoji/me');
}
