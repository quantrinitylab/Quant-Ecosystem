import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

// GET /api/users/search?q=... — proxies to the QuantChat backend
// GET /users/search (contact discovery for the New-chat picker).
// Without this route the frontend's /api/users/search calls 404 on the
// Next.js 404 page (HTML), which the API client misreports as a network
// failure — see QCHAT-P0-1.
export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/users/search');
}
