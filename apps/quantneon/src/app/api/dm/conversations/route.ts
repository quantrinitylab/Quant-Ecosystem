import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/dm/conversations');
}

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/dm/conversations');
}
