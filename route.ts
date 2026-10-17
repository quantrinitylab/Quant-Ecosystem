// Memory vault passcode verify seam proxy (QC-F-450):
//   POST /api/memories/passcode/verify -> backend POST /memories/passcode/verify
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/memories/passcode/verify');
}
