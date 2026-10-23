// Notifications seam proxy (QC-F-101, drive-by):
//   GET /api/notifications/settings -> backend GET /notifications/settings
//   PUT /api/notifications/settings -> backend PUT /notifications/settings
// Live callers (NotificationSettings.tsx, sw.js registration path) 404 on
// the web without this seam. Pure forwards — no logic.
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/notifications/settings');
}

export async function PUT(request: NextRequest) {
  return proxyToBackend(request, '/notifications/settings');
}
