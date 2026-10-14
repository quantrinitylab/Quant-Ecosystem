import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

// QC-F-321: GET /api/message-requests/inbox -> backend GET /message-requests/inbox
export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/message-requests/inbox');
}
