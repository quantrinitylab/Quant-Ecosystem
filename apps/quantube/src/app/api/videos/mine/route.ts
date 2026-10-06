import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

// GET /api/videos/mine — the caller's own uploaded videos.
// Requires auth; the backend returns 401 when no session is present.
// No demo fallback: studio shows an honest empty state when the creator
// has no videos yet.
export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/videos/mine');
}
