import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';
import { PUBLIC_FEATURED_VIDEOS } from '../../../../data/public-videos';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const res = await proxyToBackend(request, `/videos/${id}`);
    if (!res.ok) {
      throw new Error(`Backend returned ${res.status}`);
    }
    return res;
  } catch (error) {
    // P0-1: serve the matching sample record — never fabricate a success by
    // returning PUBLIC_FEATURED_VIDEOS[0] for an unrelated unknown id.
    const video = PUBLIC_FEATURED_VIDEOS.find((v) => v.id === id);
    if (!video) {
      return NextResponse.json(
        { success: false, error: { message: 'Video not found', code: 'VIDEO_NOT_FOUND' } },
        { status: 404 },
      );
    }
    return NextResponse.json({
      success: true,
      data: {
        ...video,
        video: video,
      },
    });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/videos/${id}`);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToBackend(request, `/videos/${id}`);
}
