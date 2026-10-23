import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

/**
 * POST /api/media/finalize?mediaId=<id>
 * Body: { filename: string, contentType: string, durationMs?: number }
 * Proxies to the quantchat backend's finalize endpoint, which HEAD-verifies
 * the uploaded object in storage and persists the durable Media row.
 * Only a finalized object may be referenced by a message (QC-F-573).
 */
export async function POST(request: NextRequest) {
  const mediaId = request.nextUrl.searchParams.get('mediaId');
  if (!mediaId) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INVALID_INPUT', message: 'mediaId query parameter is required' },
      },
      { status: 400 },
    );
  }
  return proxyToBackend(request, `/media/${encodeURIComponent(mediaId)}/finalize`, {
    method: 'POST',
  });
}
