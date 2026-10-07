// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as videosGet } from '../app/api/videos/route';
import { GET as trendingGet } from '../app/api/videos/trending/route';
import { GET as feedGet } from '../app/api/feed/route';
import { PUBLIC_FEATURED_VIDEOS } from '../data/public-videos';

describe('QuanTube Guest Public Feed Hardening', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns 200 OK with featured videos when GET /api/videos is unauthenticated and backend is down or 401', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const request = new NextRequest('http://localhost:3000/api/videos');
    const response = await videosGet(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.isGuestFallback).toBe(true);
    expect(body.data.videos.length).toBeGreaterThan(0);
    expect(body.data.videos[0].title).toBe(PUBLIC_FEATURED_VIDEOS[0].title);
  });

  it('filters guest featured videos by category when requested', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const request = new NextRequest('http://localhost:3000/api/videos?category=music');
    const response = await videosGet(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.videos.every((v: any) => v.category === 'music')).toBe(true);
  });

  it('returns 200 OK with featured videos when GET /api/videos/trending is called by guest', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const request = new NextRequest('http://localhost:3000/api/videos/trending');
    const response = await trendingGet(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.videos.length).toBeGreaterThan(0);
    expect(body.data.isGuestFallback).toBe(true);
  });

  it('returns 200 OK with public recommendations when GET /api/feed encounters unauthenticated 401', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const request = new NextRequest('http://localhost:3000/api/feed');
    const response = await feedGet(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.items.length).toBeGreaterThan(0);
    expect(body.data.isGuestFallback).toBe(true);
  });
});
