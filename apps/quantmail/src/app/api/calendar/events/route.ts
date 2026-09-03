import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

// Left `undefined` on purpose: `proxyToBackend` then resolves
// QUANTMAIL_BACKEND_URL like every other route in this app, and quantmail's own
// backend serves /events (see backend/routes/calendar.ts). The old default was
// `http://localhost:3013` — a standalone quantcalendar service that is not
// deployed — so every request through here answered 502 BACKEND_UNAVAILABLE.
// The env var is still honoured, for a deployment that really does run one.
const CALENDAR_BACKEND_URL = process.env.QUANTCALENDAR_BACKEND_URL;

export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/events', undefined, CALENDAR_BACKEND_URL);
}

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/events', undefined, CALENDAR_BACKEND_URL);
}
