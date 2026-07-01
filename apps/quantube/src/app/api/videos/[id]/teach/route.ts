import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

// GET /api/videos/:id/teach?q=<query>&limit=<n>
// Proxies to the backend SegmentService.findTopicJumps (query is forwarded).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/videos/${id}/teach`);
}
