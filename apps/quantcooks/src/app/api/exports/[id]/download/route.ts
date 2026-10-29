import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

// Download (P0-4): re-added together with its backend endpoint
// (GET /export/:id/download). The backend 302-redirects to a fresh signed
// URL for COMPLETED jobs and answers a precise 404 EXPORT_NOT_READY
// otherwise; streamed through so the redirect/body passes cleanly.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToBackend(request, `/export/${id}/download`, { stream: true });
}
