// Avatar seam proxy: POST /api/avatar/generate -> backend POST /avatar/generate
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/avatar/generate');
}
