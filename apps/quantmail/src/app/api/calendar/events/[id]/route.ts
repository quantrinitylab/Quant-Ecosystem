import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

const CALENDAR_BACKEND_URL = process.env.QUANTCALENDAR_BACKEND_URL || 'http://localhost:3013';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/events/${id}`, undefined, CALENDAR_BACKEND_URL);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/events/${id}`, { method: 'PUT' }, CALENDAR_BACKEND_URL);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToBackend(request, `/events/${id}`, { method: 'DELETE' }, CALENDAR_BACKEND_URL);
}
