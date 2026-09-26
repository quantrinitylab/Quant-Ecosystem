import { NextRequest, NextResponse } from 'next/server';
import { proxyEngineRequest } from '../_lib/engine-proxy';
import { getGuestFeaturedVideos } from '../../../data/public-videos';

// GET /api/feed — the composed feed (recommendations retrieval → ranking),
// paginated via ?feedId=&page=&pageSize=. Fallback to curated public featured
// videos for unauthenticated guests.
export async function GET(request: NextRequest) {
  const hasAuth = Boolean(request.headers.get('authorization'));
  try {
    const res = await proxyEngineRequest(request, '/feed', {
      searchParams: request.nextUrl.searchParams,
    });

    // Preserve 403 (Forbidden) and non-2xx responses for authenticated callers
    if (res.status === 403 || (hasAuth && !res.ok)) {
      return res;
    }

    if (res.status === 401 || !res.ok) {
      const fallback = getGuestFeaturedVideos();
      return NextResponse.json(
        {
          success: true,
          data: {
            items: fallback.map((v) => ({
              id: v.id,
              content: v.description,
              title: v.title,
              videoUrl: v.videoUrl,
              thumbnailUrl: v.thumbnailUrl,
              authorId: v.channelId,
              authorName: v.channelName,
              authorAvatar: v.channelAvatar,
              timestamp: Date.now(),
              upvotes: v.views,
              isGuestFallback: true,
            })),
            total: fallback.length,
            isGuestFallback: true,
          },
        },
        { status: 200 },
      );
    }
    return res;
  } catch (_err) {
    if (hasAuth) {
      return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
    const fallback = getGuestFeaturedVideos();
    return NextResponse.json(
      {
        success: true,
        data: {
          items: fallback.map((v) => ({
            id: v.id,
            content: v.description,
            title: v.title,
            videoUrl: v.videoUrl,
            thumbnailUrl: v.thumbnailUrl,
            authorId: v.channelId,
            authorName: v.channelName,
            authorAvatar: v.channelAvatar,
            timestamp: Date.now(),
            upvotes: v.views,
            isGuestFallback: true,
          })),
          total: fallback.length,
          isGuestFallback: true,
        },
      },
      { status: 200 },
    );
  }
}
