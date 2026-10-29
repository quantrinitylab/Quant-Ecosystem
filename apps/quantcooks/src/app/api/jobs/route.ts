import { NextRequest } from 'next/server';
import { proxyToBackend } from '../_lib/proxy';

// CP-1: the caller's unified jobs (EditJob) across every tool surface.
export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/jobs');
}
