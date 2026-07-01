import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

// GET /api/videos/:id/skip-plan?duration=<sec>&skip=<comma-kinds>
// Proxies to the backend SegmentService.getSkipPlan (query is forwarded).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/videos/${id}/skip-plan`);
}
