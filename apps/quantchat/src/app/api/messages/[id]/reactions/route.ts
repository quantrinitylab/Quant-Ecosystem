// Message-reaction seam proxy:
//   POST /api/messages/:id/reactions -> backend POST /conversations/messages/:id/reactions
// (the backend messages router is mounted under the /conversations prefix).
// QC-F-410 (QC-2b): this proxy did not exist, so the shipped client's
// apiClient.addReaction call 404'd at the Next layer and could never reach
// the backend reactToMessage route.
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/conversations/messages/${encodeURIComponent(id)}/reactions`);
}
