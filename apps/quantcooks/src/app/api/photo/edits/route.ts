import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

// Photo edit create (C-3B): POST /photo/edits. The backend refuses 503
// PHOTO_NOT_CONFIGURED when the companion binary is not configured, and
// 400 INVALID_OPERATIONS for an unlisted operation; the proxy passes the
// verdict through untouched.
export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/photo/edits');
}

// Photo edit list (C-3B): GET /photo/edits (optional ?projectId=).
export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/photo/edits');
}
