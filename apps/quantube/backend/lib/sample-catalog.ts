// ============================================================================
// QuantTube - Shared Sample Video Catalog (single source of truth)
// ----------------------------------------------------------------------------
// These are REAL, playable sample videos generated in-house (8-second
// animated title cards) and self-hosted under the app's public/samples/
// directory, so they play everywhere with zero external dependencies.
// Thumbnails are real frames extracted from the videos themselves
// (public/samples/posters/), and the channel avatar is a local SVG.
// They exist so guests see a working product while the real catalog is
// empty — they are ALWAYS flagged `isSample: true` and must never be
// presented as real user content.
// Engagement metadata is intentionally neutral: views are 0, upload ages are
// blank, durations are the REAL measured clip lengths, and channels are a
// single neutral "Sample Channel" — no fake counts, dates, durations, live
// badges, or channels may be shown for samples.
// Consumers:
//   - backend/routes/videos.ts   (GET /videos/:id fallback + seed script)
//   - src/data/public-videos.ts  (frontend re-export, same ids/shapes)
// ============================================================================

export interface SampleVideo {
  id: string;
  title: string;
  description: string;
  /** Real, playable mp4 URL. Never a dead placeholder. */
  videoUrl: string;
  /** Real frame extracted from the video. Self-hosted, never external. */
  thumbnailUrl: string;
  channelId: string;
  channelName: string;
  channelAvatar: string;
  views: number;
  /** Human-friendly age for the frontend ("2 days ago"). */
  uploadedAt: string;
  /** ISO date for the backend API shape. */
  publishedAt: string;
  /** Seconds. The REAL measured length of the clip. Never a live stream. */
  duration: number;
  category: string;
  resolution?: string;
}

const SAMPLE_DESC =
  'Built-in sample placeholder — an 8-second animated title card. Real creator uploads will appear here once the catalog has content.';

const SAMPLE_AVATAR = '/samples/sample-avatar.svg';

export const SAMPLE_CATALOG: SampleVideo[] = [
  {
    id: 'guest-vid-1',
    title: 'Building the Future of Sovereign Computing: Quant OS Keynote 2026',
    description: SAMPLE_DESC,
    videoUrl: '/samples/vid-01.mp4',
    thumbnailUrl: '/samples/posters/vid-01.jpg',
    channelId: 'chan-sample',
    channelName: 'Sample Channel',
    channelAvatar: SAMPLE_AVATAR,
    views: 0,
    uploadedAt: '',
    publishedAt: '2026-10-04T12:00:00.000Z',
    duration: 8,
    category: 'tech',
    resolution: '360p',
  },
  {
    id: 'guest-vid-2',
    title: 'Quant Beats — Lo-Fi Chill Beats (Sample)',
    description: SAMPLE_DESC,
    videoUrl: '/samples/vid-02.mp4',
    thumbnailUrl: '/samples/posters/vid-02.jpg',
    channelId: 'chan-sample',
    channelName: 'Sample Channel',
    channelAvatar: SAMPLE_AVATAR,
    views: 0,
    uploadedAt: '',
    publishedAt: '2026-10-06T12:00:00.000Z',
    duration: 8,
    category: 'music',
    resolution: '360p',
  },
  {
    id: 'guest-vid-3',
    title: 'Deep Dive into Distributed CRDTs and Multi-Master Databases (Sample)',
    description: SAMPLE_DESC,
    videoUrl: '/samples/vid-03.mp4',
    thumbnailUrl: '/samples/posters/vid-03.jpg',
    channelId: 'chan-sample',
    channelName: 'Sample Channel',
    channelAvatar: SAMPLE_AVATAR,
    views: 0,
    uploadedAt: '',
    publishedAt: '2026-10-01T12:00:00.000Z',
    duration: 8,
    category: 'education',
    resolution: '360p',
  },
  {
    id: 'guest-vid-4',
    title: 'Championship Grand Finals — Global Esports Highlights 2026 (Sample)',
    description: SAMPLE_DESC,
    videoUrl: '/samples/vid-04.mp4',
    thumbnailUrl: '/samples/posters/vid-04.jpg',
    channelId: 'chan-sample',
    channelName: 'Sample Channel',
    channelAvatar: SAMPLE_AVATAR,
    views: 0,
    uploadedAt: '',
    publishedAt: '2026-09-29T12:00:00.000Z',
    duration: 8,
    category: 'gaming',
    resolution: '360p',
  },
  {
    id: 'guest-vid-5',
    title: 'Global Tech & Market Round-up: The Rise of Sovereign AI (Sample)',
    description: SAMPLE_DESC,
    videoUrl: '/samples/vid-05.mp4',
    thumbnailUrl: '/samples/posters/vid-05.jpg',
    channelId: 'chan-sample',
    channelName: 'Sample Channel',
    channelAvatar: SAMPLE_AVATAR,
    views: 0,
    uploadedAt: '',
    publishedAt: '2026-10-03T12:00:00.000Z',
    duration: 8,
    category: 'news',
    resolution: '360p',
  },
  {
    id: 'guest-vid-6',
    title: 'Next-Gen Quantum GPU Architecture Explained (Sample)',
    description: SAMPLE_DESC,
    videoUrl: '/samples/vid-06.mp4',
    thumbnailUrl: '/samples/posters/vid-06.jpg',
    channelId: 'chan-sample',
    channelName: 'Sample Channel',
    channelAvatar: SAMPLE_AVATAR,
    views: 0,
    uploadedAt: '',
    publishedAt: '2026-10-02T12:00:00.000Z',
    duration: 8,
    category: 'tech',
    resolution: '360p',
  },
  {
    id: 'guest-vid-7',
    title: 'Electronic Music Festival Live Set — Soundwave 2026 (Sample)',
    description: SAMPLE_DESC,
    videoUrl: '/samples/vid-07.mp4',
    thumbnailUrl: '/samples/posters/vid-07.jpg',
    channelId: 'chan-sample',
    channelName: 'Sample Channel',
    channelAvatar: SAMPLE_AVATAR,
    views: 0,
    uploadedAt: '',
    publishedAt: '2026-09-30T12:00:00.000Z',
    duration: 8,
    category: 'music',
    resolution: '360p',
  },
  {
    id: 'guest-vid-8',
    title: 'Formula 1 2026 Season Opener — Race Highlights (Sample)',
    description: SAMPLE_DESC,
    videoUrl: '/samples/vid-08.mp4',
    thumbnailUrl: '/samples/posters/vid-08.jpg',
    channelId: 'chan-sample',
    channelName: 'Sample Channel',
    channelAvatar: SAMPLE_AVATAR,
    views: 0,
    uploadedAt: '',
    publishedAt: '2026-10-04T12:00:00.000Z',
    duration: 8,
    category: 'sports',
    resolution: '360p',
  },
  {
    id: 'guest-vid-9',
    title: 'Autonomous Drone Racing Championship (Sample)',
    description: SAMPLE_DESC,
    videoUrl: '/samples/vid-09.mp4',
    thumbnailUrl: '/samples/posters/vid-09.jpg',
    channelId: 'chan-sample',
    channelName: 'Sample Channel',
    channelAvatar: SAMPLE_AVATAR,
    views: 0,
    uploadedAt: '',
    publishedAt: '2026-10-02T12:00:00.000Z',
    duration: 8,
    category: 'sports',
    resolution: '360p',
  },
  {
    id: 'guest-vid-10',
    title: 'Indie Game Developer Showcase 2026 (Sample)',
    description: SAMPLE_DESC,
    videoUrl: '/samples/vid-10.mp4',
    thumbnailUrl: '/samples/posters/vid-10.jpg',
    channelId: 'chan-sample',
    channelName: 'Sample Channel',
    channelAvatar: SAMPLE_AVATAR,
    views: 0,
    uploadedAt: '',
    publishedAt: '2026-09-29T12:00:00.000Z',
    duration: 8,
    category: 'gaming',
    resolution: '360p',
  },
  {
    id: 'guest-vid-11',
    title: 'AI Agent Swarms in Production (Sample)',
    description: SAMPLE_DESC,
    videoUrl: '/samples/vid-11.mp4',
    thumbnailUrl: '/samples/posters/vid-11.jpg',
    channelId: 'chan-sample',
    channelName: 'Sample Channel',
    channelAvatar: SAMPLE_AVATAR,
    views: 0,
    uploadedAt: '',
    publishedAt: '2026-10-03T12:00:00.000Z',
    duration: 8,
    category: 'education',
    resolution: '360p',
  },
  {
    id: 'guest-vid-12',
    title: 'Cosmic Horizons: Deep Space Odyssey (Sample)',
    description: SAMPLE_DESC,
    videoUrl: '/samples/vid-12.mp4',
    thumbnailUrl: '/samples/posters/vid-12.jpg',
    channelId: 'chan-sample',
    channelName: 'Sample Channel',
    channelAvatar: SAMPLE_AVATAR,
    views: 0,
    uploadedAt: '',
    publishedAt: '2026-10-01T12:00:00.000Z',
    duration: 8,
    category: 'entertainment',
    resolution: '360p',
  },
];

export function findSampleVideo(id: string): SampleVideo | undefined {
  return SAMPLE_CATALOG.find((v) => v.id === id);
}

/**
 * Backend API shape for GET /api/videos/:id. Carries BOTH `videoUrl` (direct
 * media file) and `url` (watch page) because older frontend builds read
 * `v.url` — a missing field was the empty-<video src> root cause of P0-1.
 */
export function toSampleApiRecord(v: SampleVideo): Record<string, unknown> {
  return {
    id: v.id,
    title: v.title,
    description: v.description,
    videoUrl: v.videoUrl,
    url: `/watch/${v.id}`,
    thumbnailUrl: v.thumbnailUrl,
    duration: v.duration,
    views: v.views,
    viewCount: v.views,
    likeCount: 0,
    commentCount: 0,
    channelId: v.channelId,
    channel: {
      id: v.channelId,
      name: v.channelName,
      handle: v.channelId.replace(/^chan-/, '').replace(/-/g, ''),
      avatarUrl: v.channelAvatar,
    },
    channelName: v.channelName,
    channelAvatar: v.channelAvatar,
    category: v.category,
    resolution: v.resolution,
    isLive: false,
    publishedAt: v.publishedAt,
    createdAt: v.publishedAt,
    updatedAt: v.publishedAt,
    // Honesty marker: this row is a built-in sample, not real user content.
    isSample: true,
  };
}
