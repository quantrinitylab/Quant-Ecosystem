// Memory vault passcode reset seam proxy (QC-F-450):
//   POST /api/memories/passcode/reset -> backend POST /memories/passcode/reset
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/memories/passcode/reset');
}
