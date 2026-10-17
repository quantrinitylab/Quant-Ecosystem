// Memory vault passcode change seam proxy (QC-F-450):
//   POST /api/memories/passcode/change -> backend POST /memories/passcode/change
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/memories/passcode/change');
}
