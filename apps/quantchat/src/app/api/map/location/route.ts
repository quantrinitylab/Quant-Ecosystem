import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

// POST /api/map/location — publish/refresh the caller's own location
// (QC-F-056). Proxies to the real backend (Fastify POST /map/location,
// wired to the Prisma FriendLocation model via LocationService). Before
// this route existed the map page could only send WebSocket frames the
// backend never handled, so a web user's location was never stored.
export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/map/location');
}

// DELETE /api/map/location — stop sharing: removes the caller's location
// row on the backend (idempotent). This is what Ghost Mode calls so the
// pin actually disappears for close friends, instead of only hiding in
// local UI state while the server row lived on.
export async function DELETE(request: NextRequest) {
  return proxyToBackend(request, '/map/location');
}
