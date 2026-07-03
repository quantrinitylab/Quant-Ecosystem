// Subscribe proxy: POST /api/channels/:id/subscribe -> backend (idempotent).
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/channels/${encodeURIComponent(id)}/subscribe`);
}
