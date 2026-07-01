import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

const CALENDAR_BACKEND_URL = process.env.QUANTCALENDAR_BACKEND_URL || 'http://localhost:3013';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/events', undefined, CALENDAR_BACKEND_URL);
}

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/events', undefined, CALENDAR_BACKEND_URL);
}
