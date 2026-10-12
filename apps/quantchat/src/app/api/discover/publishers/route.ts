// Discover publishers proxy (QC-F-077):
//   GET /api/discover/publishers -> backend GET /discover/publishers
// (broadcast channels with real subscriber/content counts).
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/discover/publishers');
}
