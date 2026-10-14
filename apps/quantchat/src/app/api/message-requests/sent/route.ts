import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

// QC-F-321: GET /api/message-requests/sent -> backend GET /message-requests/sent
export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/message-requests/sent');
}
