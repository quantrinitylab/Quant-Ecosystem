// Discover subscribe proxy (QC-F-077):
//   POST /api/discover/publishers/:id/subscribe -> backend
//   POST /discover/publishers/:id/subscribe (real, idempotent channel
//   subscription; the response carries the real subscriber count).
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../../_lib/proxy';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/discover/publishers/${encodeURIComponent(id)}/subscribe`);
}
