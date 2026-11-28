import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

// Per-label notification overrides (label id → 'all' | 'none'). Stored
// server-side in User.preferences and enforced by the inbound webhook before
// a `new_email` notification is created — Gmail's per-label "Notify for
// every message", plus the mute side ('none'). An absent entry means "follow
// the global mode".
export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/notifications/mail-notification-label-overrides');
}

export async function PUT(request: NextRequest) {
  return proxyToBackend(request, '/notifications/mail-notification-label-overrides');
}
