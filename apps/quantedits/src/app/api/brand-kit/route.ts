import { NextRequest } from 'next/server';
import { proxyToBackend } from '../_lib/proxy';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/brand-kits');
}

export async function PUT(request: NextRequest) {
  return proxyToBackend(request, '/brand-kits');
}
