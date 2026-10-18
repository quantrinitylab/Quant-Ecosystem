// Memory vault passcode set seam proxy (QC-F-450):
//   POST /api/memories/passcode/set -> backend POST /memories/passcode/set
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/memories/passcode/set');
}
