import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../../../_lib/proxy';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const { id, versionId } = await params;
  return proxyToBackend(request, `/docs/${id}/versions/${versionId}/restore`);
}
