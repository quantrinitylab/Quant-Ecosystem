import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

// Backend exposes signed-upload-URL issuance at POST /assets/upload-url.
export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/assets/upload-url');
}
