// Notifications seam proxy (QC-F-101):
//   POST /api/notifications/read-all -> backend POST /notifications/read-all
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/notifications/read-all');
}
