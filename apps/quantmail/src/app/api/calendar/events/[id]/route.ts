import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

// Undefined makes proxyToBackend fall back to QUANTMAIL_BACKEND_URL. An
// explicitly deployed QuantCalendar backend can still override that target.
const CALENDAR_BACKEND_URL = process.env.QUANTCALENDAR_BACKEND_URL;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return proxyToBackend(request, `/events/${id}`, undefined, CALENDAR_BACKEND_URL);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return proxyToBackend(request, `/events/${id}`, { method: 'PATCH' }, CALENDAR_BACKEND_URL);
}

// Backward compatibility for clients that still issue PUT: the Fastify backend
// receives PATCH while both verbs remain accepted during migration.
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return proxyToBackend(request, `/events/${id}`, { method: 'PATCH' }, CALENDAR_BACKEND_URL);
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return proxyToBackend(request, `/events/${id}`, { method: 'DELETE' }, CALENDAR_BACKEND_URL);
}
