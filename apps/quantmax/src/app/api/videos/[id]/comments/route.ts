import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

// GET /api/videos/:id/comments  -> list a video's comments (paginated)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/videos/${id}/comments`);
}

// POST /api/videos/:id/comments -> post a comment
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/videos/${id}/comments`);
}
