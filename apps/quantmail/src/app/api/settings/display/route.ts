import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

// The account-roaming display settings (theme, row density, Assistant
// intent). Stored server-side in User.preferences; the browser keeps a
// localStorage copy as its boot cache and offline fallback, reconciled by
// the `updatedAt` stamp on each side.
export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/settings/display');
}

export async function PUT(request: NextRequest) {
  return proxyToBackend(request, '/settings/display');
}
