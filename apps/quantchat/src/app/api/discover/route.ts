// Discover feed proxy (QC-F-077):
//   GET /api/discover -> backend GET /discover (channel posts + reels feed)
// The backend route never existed before QC-F-077, so this proxy (and the
// trending/publishers/subscribe proxies) is what makes the shipped
// /discover page's apiClient calls reach real data instead of 404.
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../_lib/proxy';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/discover');
}
