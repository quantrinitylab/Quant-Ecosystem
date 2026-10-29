import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

// CP-1: cancel a QUEUED unified job (→ FAILED, USER_CANCELLED).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToBackend(request, `/jobs/${id}/cancel`);
}
