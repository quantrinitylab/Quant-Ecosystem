// Message-reaction seam proxy:
//   POST   /api/messages/:id/reactions -> backend POST   /conversations/messages/:id/reactions
//   DELETE /api/messages/:id/reactions -> backend DELETE /conversations/messages/:id/reactions
// (the backend messages router is mounted under the /conversations prefix).
// QC-F-020: this proxy did not exist and neither did the backend route —
// apiClient.addReaction() called into a 404 and the thread page kept
// reactions in local state only.
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/conversations/messages/${encodeURIComponent(id)}/reactions`);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToBackend(request, `/conversations/messages/${encodeURIComponent(id)}/reactions`);
}
