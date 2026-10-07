import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

// GET /api/map/friends — the caller's close friends who are currently sharing
// their location. Proxies to the real backend (Fastify GET /map/friends,
// wired to the Prisma FriendLocation model via LocationService).
// No demo or fallback data is returned: when nobody is sharing, the backend
// returns an empty list and the map page renders an honest empty state.
export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/map/friends');
}
