import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

// CP-1: one unified job (owner-scoped; outputs carry per-read signed URLs).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToBackend(request, `/jobs/${id}`);
}
