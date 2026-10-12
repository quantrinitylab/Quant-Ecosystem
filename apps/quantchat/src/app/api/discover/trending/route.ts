// Discover trending proxy (QC-F-077):
//   GET /api/discover/trending -> backend GET /discover/trending
// (reels ranked by real engagement counters — no invented view counts).
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/discover/trending');
}
