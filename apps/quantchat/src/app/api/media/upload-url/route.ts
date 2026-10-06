import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

/**
 * POST /api/media/upload-url
 * Body: { filename: string, contentType: string }
 * Proxies to the quantchat backend's presigned upload-URL generator so the
 * browser can upload media (e.g. voice notes) directly to object storage.
 */
export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/media/upload-url', { method: 'POST' });
}
