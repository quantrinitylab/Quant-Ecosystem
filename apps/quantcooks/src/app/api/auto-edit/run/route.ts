import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

// Mirrors the backend layout: auto-edit lives at /auto-edit/run, not under /ai.
export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/auto-edit/run');
}
