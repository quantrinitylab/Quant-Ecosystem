import { NextRequest } from 'next/server';

import { proxyToBackend } from '../../_lib/proxy';

/**
 * fix/qm-accounts-import — send-mail-as identities.
 * GET  /api/settings/send-as — list the caller's identities.
 * POST /api/settings/send-as — add an address (starts UNVERIFIED; a code is
 * mailed to the address itself).
 */
export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/settings/send-as');
}

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/settings/send-as');
}
