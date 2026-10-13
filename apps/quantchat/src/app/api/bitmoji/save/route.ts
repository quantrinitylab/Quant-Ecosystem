// Bitmoji seam proxy: POST /api/bitmoji/save -> backend POST /bitmoji (QC-F-089)
// The /bitmoji page saves its editor config through this path.
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/bitmoji');
}
