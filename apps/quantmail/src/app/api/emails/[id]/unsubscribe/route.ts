import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

// NOTE: proxyToBackend only forwards search params for GET requests.
// POST /emails/{id}/unsubscribe requires the `q` query param, so it is
// forwarded explicitly here.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = request.nextUrl.searchParams.get('q');
  const query = q ? `?q=${encodeURIComponent(q)}` : '';
  return proxyToBackend(request, `/emails/${encodeURIComponent(id)}/unsubscribe${query}`);
}
