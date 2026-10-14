import { NextRequest } from 'next/server';
import { proxyToBackend } from '../_lib/proxy';

// QC-F-321: POST /api/message-requests -> backend POST /message-requests
// (create a first-contact message request; the backend decides 201/200/4xx).
export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/message-requests');
}
