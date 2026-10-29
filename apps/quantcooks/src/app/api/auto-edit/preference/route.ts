import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

// Mirrors the backend layout: /auto-edit/preference (GET + PUT).
export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/auto-edit/preference');
}

export async function PUT(request: NextRequest) {
  return proxyToBackend(request, '/auto-edit/preference');
}
