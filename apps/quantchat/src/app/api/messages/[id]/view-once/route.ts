// View-once snap consumption seam proxy:
//   POST /api/messages/:id/view-once -> backend POST /conversations/messages/:id/view-once
// (the backend messages router is mounted under the /conversations prefix).
// QC-F-019: this proxy did not exist, so the frontend could never reach the
// backend consumeSnap endpoint and snaps were "viewed" purely locally.
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/conversations/messages/${encodeURIComponent(id)}/view-once`);
}
