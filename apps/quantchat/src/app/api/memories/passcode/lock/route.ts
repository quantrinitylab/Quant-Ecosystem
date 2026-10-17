// Memory vault lock seam proxy (QC-F-450):
//   POST /api/memories/passcode/lock -> backend POST /memories/passcode/lock
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/memories/passcode/lock');
}
