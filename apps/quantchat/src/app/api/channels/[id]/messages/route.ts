// Channel feed proxy:
//   GET /api/channels/:id/messages -> backend GET /channels/:id/messages
// (subscribers only; the backend rejects non-members 403 so private feeds
// are never leaked). Forwards ?limit through proxyToBackend's GET param pass.
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/channels/${encodeURIComponent(id)}/messages`);
}
