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
    const video = PUBLIC_FEATURED_VIDEOS.find((v) => v.id === id) || PUBLIC_FEATURED_VIDEOS[0];
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
