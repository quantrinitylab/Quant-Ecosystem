import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '../_lib/proxy';
import { getGuestFeaturedPosts } from '../../../data/public-reels';

export async function GET(request: NextRequest) {
  try {
    const res = await proxyToBackend(request, '/explore');
    if (res.status === 401 || !res.ok) {
      const fallback = getGuestFeaturedPosts();
      return NextResponse.json(
        {
          success: true,
          data: {
            posts: fallback,
            isGuestFallback: true,
          },
        },
        { status: 200 },
      );
    }

    const json = await res.json().catch(() => null);
    const postsList =
      (json as any)?.data?.posts ?? (Array.isArray((json as any)?.data) ? (json as any)?.data : []);
    if ((!postsList || postsList.length === 0) && !request.headers.get('Authorization')) {
      const fallback = getGuestFeaturedPosts();
      return NextResponse.json(
        {
          success: true,
          data: {
            posts: fallback,
            isGuestFallback: true,
          },
        },
        { status: 200 },
      );
    }

    return NextResponse.json(json, { status: res.status });
  } catch (_err) {
    const fallback = getGuestFeaturedPosts();
    return NextResponse.json(
      {
        success: true,
        data: {
          posts: fallback,
          isGuestFallback: true,
        },
      },
      { status: 200 },
    );
  }
}
