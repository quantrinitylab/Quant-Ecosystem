// Broadcast-channels proxy:
//   GET  /api/channels -> backend GET  /channels (caller's owned + subscribed)
//   POST /api/channels -> backend POST /channels (create; caller becomes OWNER)
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../_lib/proxy';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/channels');
}

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/channels');
}
