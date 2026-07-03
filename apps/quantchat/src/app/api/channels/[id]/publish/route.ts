// Publish proxy: POST /api/channels/:id/publish -> backend.
// The backend is authoritative: only OWNER/ADMIN may publish; a subscriber is
// rejected 403 CHANNEL_POST_FORBIDDEN (client-side gating is UX only).
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/channels/${encodeURIComponent(id)}/publish`);
}
