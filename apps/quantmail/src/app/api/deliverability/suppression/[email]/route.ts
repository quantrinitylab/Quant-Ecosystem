import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ email: string }> }) {
  const { email } = await params;
  return proxyToBackend(request, `/deliverability/suppression/${encodeURIComponent(email)}`, { method: 'DELETE' });
}
