import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

// The per-user mail notification mode (all / important / off). Stored
// server-side in User.preferences and enforced by the inbound webhook before
// a `new_email` notification is created — one setting covering the in-app
// bell, web push and the desktop-alert watcher's feed.
export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/notifications/mail-notification-mode');
}

export async function PUT(request: NextRequest) {
  return proxyToBackend(request, '/notifications/mail-notification-mode');
}
