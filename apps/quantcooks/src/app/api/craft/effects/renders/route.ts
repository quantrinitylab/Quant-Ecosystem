import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

// Craft render list (C-2): GET /craft/effects/renders (optional ?projectId=).
export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/craft/effects/renders');
}
