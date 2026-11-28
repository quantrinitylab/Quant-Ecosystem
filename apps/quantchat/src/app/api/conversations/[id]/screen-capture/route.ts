import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

// Phase 2B: POST /api/conversations/[id]/screen-capture -> backend
// POST /conversations/:id/screen-capture (conversation-level screenshot /
// screen-recording notice; detection + notice only, never prevention).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/conversations/${id}/screen-capture`);
}
