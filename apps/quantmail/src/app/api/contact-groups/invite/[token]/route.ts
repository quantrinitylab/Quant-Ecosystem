import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return proxyToBackend(request, `/contact-groups/invite/${encodeURIComponent(token)}`);
}
