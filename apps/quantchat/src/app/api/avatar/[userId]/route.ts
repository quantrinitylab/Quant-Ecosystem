// Avatar seam proxy: GET /api/avatar/:userId -> backend GET /avatar/:userId
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  return proxyToBackend(request, `/avatar/${encodeURIComponent(userId)}`);
}
