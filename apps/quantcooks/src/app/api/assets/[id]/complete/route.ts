import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

// Upload step 3 (P0-3): the client has PUT the bytes directly to object
// storage; the backend verifies they landed and marks the asset READY.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToBackend(request, `/assets/${id}/complete`);
}
