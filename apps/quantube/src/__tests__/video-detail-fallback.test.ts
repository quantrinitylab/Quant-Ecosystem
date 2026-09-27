import { expect, test, describe } from 'vitest';
import { GET as getVideo } from '../app/api/videos/[id]/route';
import { NextRequest } from 'next/server';

describe('Video Detail Fallback API', () => {
  test('returns video data for guest-vid-1 when backend is offline', async () => {
    const req = new NextRequest('http://localhost/api/videos/guest-vid-1');
    const res = await getVideo(req, { params: Promise.resolve({ id: 'guest-vid-1' }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.id).toBe('guest-vid-1');
  });

  test('returns video data for guest-vid-2 when backend is offline', async () => {
    const req = new NextRequest('http://localhost/api/videos/guest-vid-2');
    const res = await getVideo(req, { params: Promise.resolve({ id: 'guest-vid-2' }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.id).toBe('guest-vid-2');
  });

  test('returns comments data when backend is offline', async () => {
    const { GET: getComments } = await import('../app/api/interactions/comments/[id]/route');
    const req = new NextRequest('http://localhost/api/interactions/comments/guest-vid-1');
    const res = await getComments(req, { params: Promise.resolve({ id: 'guest-vid-1' }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.comments).toBeInstanceOf(Array);
    expect(json.data.comments[0].author).toBe('Quant Dev');
    expect(json.data.comments[0].text).toContain('sovereign infra');
  });
});
