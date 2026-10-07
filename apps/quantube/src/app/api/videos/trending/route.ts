import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';
import { getGuestFeaturedVideos } from '../../../../data/public-videos';

export async function GET(request: NextRequest) {
  try {
    const res = await proxyToBackend(request, '/videos/trending');
    if (res.status === 401 || !res.ok) {
      const fallback = getGuestFeaturedVideos();
      return NextResponse.json(
        {
          success: true,
          data: {
            data: fallback,
            videos: fallback,
            total: fallback.length,
            page: 1,
            pageSize: 20,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
            isGuestFallback: true,
          },
        },
        { status: 200 },
      );
    }

    const json = await res.json().catch(() => null);
    const rawList =
      (json as any)?.data?.videos ??
      (json as any)?.data?.data ??
      (Array.isArray((json as any)?.data) ? (json as any)?.data : []);

    if ((!rawList || rawList.length === 0) && !request.headers.get('Authorization')) {
      const fallback = getGuestFeaturedVideos();
      return NextResponse.json(
        {
          success: true,
          data: {
            data: fallback,
            videos: fallback,
            total: fallback.length,
            page: 1,
            pageSize: 20,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
            isGuestFallback: true,
          },
        },
        { status: 200 },
      );
    }

    return NextResponse.json(json, { status: res.status });
  } catch (_err) {
    const fallback = getGuestFeaturedVideos();
    return NextResponse.json(
      {
        success: true,
        data: {
          data: fallback,
          videos: fallback,
          total: fallback.length,
          page: 1,
          pageSize: 20,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
          isGuestFallback: true,
        },
      },
      { status: 200 },
    );
  }
}
