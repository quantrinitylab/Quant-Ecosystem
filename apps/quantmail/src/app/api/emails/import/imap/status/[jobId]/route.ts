import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../../_lib/proxy';

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return proxyToBackend(request, `/emails/import/imap/status/${encodeURIComponent(jobId)}`);
}
