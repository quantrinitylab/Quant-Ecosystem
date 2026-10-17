// Memory vault status seam proxy (QC-F-450):
//   GET /api/memories/passcode/status -> backend GET /memories/passcode/status
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/memories/passcode/status');
}
