// Memories seam proxy:
//   GET  /api/memories  -> backend GET  /memories   (list + search)
//   POST /api/memories  -> backend POST /memories   (save to vault)
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../_lib/proxy';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/memories');
}

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/memories');
}
