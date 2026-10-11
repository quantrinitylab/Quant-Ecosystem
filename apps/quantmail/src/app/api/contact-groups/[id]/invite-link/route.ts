import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/contact-groups/${encodeURIComponent(id)}/invite-link`);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/contact-groups/${encodeURIComponent(id)}/invite-link`);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToBackend(request, `/contact-groups/${encodeURIComponent(id)}/invite-link`, {
    method: 'DELETE',
  });
}
