// Spotlight seam proxy:
//   GET /api/spotlight -> backend GET /spotlight (engagement-ranked, personalized feed)
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../_lib/proxy';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/spotlight');
}
