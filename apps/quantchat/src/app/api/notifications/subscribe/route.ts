// Notifications seam proxy (QC-F-101, drive-by):
//   POST /api/notifications/subscribe -> backend POST /notifications/subscribe
// A live caller (lib/push-notifications.ts) exists today and 404s on the web
// without this seam. Pure forward — no logic.
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/notifications/subscribe');
}
