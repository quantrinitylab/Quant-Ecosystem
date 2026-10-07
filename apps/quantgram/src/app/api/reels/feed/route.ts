import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';
import { getGuestFeaturedReels } from '../../../../data/public-reels';

export async function GET(request: NextRequest) {
  try {
    const res = await proxyToBackend(request, '/reels/feed');
    if (res.status === 401 || !res.ok) {
      const fallback = getGuestFeaturedReels();
      return NextResponse.json(
        {
          success: true,
          data: {
            reels: fallback,
            isGuestFallback: true,
          },
        },
        { status: 200 },
      );
    }

    const json = await res.json().catch(() => null);
    const reelsList =
      (json as any)?.data?.reels ?? (Array.isArray((json as any)?.data) ? (json as any)?.data : []);
    if ((!reelsList || reelsList.length === 0) && !request.headers.get('Authorization')) {
      const fallback = getGuestFeaturedReels();
      return NextResponse.json(
        {
          success: true,
          data: {
            reels: fallback,
            isGuestFallback: true,
          },
        },
        { status: 200 },
      );
    }

    return NextResponse.json(json, { status: res.status });
  } catch (_err) {
    const fallback = getGuestFeaturedReels();
    return NextResponse.json(
      {
        success: true,
        data: {
          reels: fallback,
          isGuestFallback: true,
        },
      },
      { status: 200 },
    );
  }
}
