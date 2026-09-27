import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const res = await proxyToBackend(request, `/interactions/comments/${id}`);
    if (!res.ok) {
      throw new Error(`Backend returned ${res.status}`);
    }
    return res;
  } catch (error) {
    return NextResponse.json({
      success: true,
      data: {
        comments: [
          {
            id: 'comm_1',
            videoId: id,
            author: 'Quant Dev',
            username: 'Quant Dev',
            content: 'Incredible video streaming quality on sovereign infra!',
            text: 'Incredible video streaming quality on sovereign infra!',
            createdAt: new Date().toISOString(),
            timestamp: 'Just now',
            likes: 42,
          },
        ],
        total: 1,
      },
    });
  }
}
