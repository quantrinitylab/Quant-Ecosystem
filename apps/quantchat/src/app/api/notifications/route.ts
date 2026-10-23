// Notifications seam proxy (QC-F-101):
//   GET /api/notifications -> backend GET /notifications (durable inbox list)
// Query params (limit/sourceApp/unreadOnly) are forwarded verbatim for GET.
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../_lib/proxy';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/notifications');
}
