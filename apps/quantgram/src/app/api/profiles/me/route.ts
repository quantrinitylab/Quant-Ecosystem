import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/profiles/me');
}

export async function PATCH(request: NextRequest) {
  return proxyToBackend(request, '/profiles/me');
}
