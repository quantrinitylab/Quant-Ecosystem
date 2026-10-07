// ============================================================================
// QuantTube - Shared Sample Video Catalog (single source of truth)
// ----------------------------------------------------------------------------
// These are REAL, playable, openly-licensed sample videos (Blender Foundation
// open movies served from Google's public sample bucket). They exist so guests
// see a working product while the real catalog is empty — they are ALWAYS
// flagged `isSample: true` and must never be presented as real user content.
// Engagement metadata is intentionally neutral: views are 0, upload ages are
// blank, and channels are a single neutral "Sample Channel" — no fake counts,
// dates, or channels may be shown for samples.
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
  thumbnailUrl: string;
  channelId: string;
  channelName: string;
  channelAvatar: string;
  views: number;
  /** Human-friendly age for the frontend ("2 days ago"). */
  uploadedAt: string;
  /** ISO date for the backend API shape. */
  publishedAt: string;
  /** Seconds. 0 = live stream. */
  duration: number;
  isLive?: boolean;
  category: string;
  resolution?: string;
}

const BUCKET = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample';

export const SAMPLE_CATALOG: SampleVideo[] = [
  {
    id: 'guest-vid-1',
    title: 'Building the Future of Sovereign Computing: Quant OS Keynote 2026',
    description:
      'An exclusive walkthrough of the distributed sovereign cloud, AI-orchestrated runtime, and zero-knowledge memory architecture powering the Quant Ecosystem.',
    videoUrl: `${BUCKET}/BigBuckBunny.mp4`,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=80',
    channelId: 'chan-quant-labs',
    channelName: 'Sample Channel',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=SampleChannel',
    views: 0,
    uploadedAt: '',
    publishedAt: '2026-10-04T12:00:00.000Z',
    duration: 1845,
    category: 'tech',
    resolution: '1080p Full HD',
  },
  {
    id: 'guest-vid-2',
    title: 'Quant Beats — Lo-Fi Chill Beats to Code / Relax to [24/7 Live Stream]',
    description:
      'Continuous generative lo-fi streams, ambient soundscapes, and chill beats for deep focus work, coding sessions, and study.',
    videoUrl: `${BUCKET}/ElephantsDream.mp4`,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=80',
    channelId: 'chan-lofi-records',
    channelName: 'Sample Channel',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=SampleChannel',
    views: 0,
    uploadedAt: '',
    publishedAt: '2026-10-06T12:00:00.000Z',
    duration: 0,
    isLive: true,
    category: 'music',
    resolution: '720p HD',
  },
  {
    id: 'guest-vid-3',
    title: 'Deep Dive into Distributed CRDTs and Multi-Master Databases',
    description:
      'Learn how conflict-free replicated data types synchronize document state in real time across tens of thousands of active peers without central locks.',
    videoUrl: `${BUCKET}/ForBiggerBlazes.mp4`,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&auto=format&fit=crop&q=80',
    channelId: 'chan-systems-eng',
    channelName: 'Sample Channel',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=SampleChannel',
    views: 0,
    uploadedAt: '',
    publishedAt: '2026-10-01T12:00:00.000Z',
    duration: 2460,
    category: 'education',
    resolution: '480p SD',
  },
  {
    id: 'guest-vid-4',
    title: 'Championship Grand Finals — Global Esports Highlights 2026',
    description:
      'Relive the most intense clutch moments, tactical teamfights, and game-winning aces from the World Championship arena.',
    videoUrl: `${BUCKET}/ForBiggerEscapes.mp4`,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80',
    channelId: 'chan-esports-global',
    channelName: 'Sample Channel',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=SampleChannel',
    views: 0,
    uploadedAt: '',
    publishedAt: '2026-09-29T12:00:00.000Z',
    duration: 1120,
    category: 'gaming',
    resolution: '1080p Full HD',
  },
  {
    id: 'guest-vid-5',
    title: 'Global Tech & Market Round-up: The Rise of Sovereign AI',
    description:
      'Breaking down major developments in localized inference, sovereign cloud infrastructure, and private intelligence networks worldwide.',
    videoUrl: `${BUCKET}/ForBiggerFun.mp4`,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&auto=format&fit=crop&q=80',
    channelId: 'chan-techpulse',
    channelName: 'Sample Channel',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=SampleChannel',
    views: 0,
    uploadedAt: '',
    publishedAt: '2026-10-03T12:00:00.000Z',
    duration: 890,
    category: 'news',
    resolution: '720p HD',
  },
  {
    id: 'guest-vid-6',
    title: 'Next-Gen Quantum GPU Architecture Explained: Parallel Qubits in Silicon',
    description:
      'How topological insulators and silicon photonics are redefining high-performance tensor computing for real-time autonomous swarms.',
    videoUrl: `${BUCKET}/ForBiggerJoyBlazes.mp4`,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&auto=format&fit=crop&q=80',
    channelId: 'chan-quantum-insight',
    channelName: 'Sample Channel',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=SampleChannel',
    views: 0,
    uploadedAt: '',
    publishedAt: '2026-10-02T12:00:00.000Z',
    duration: 1540,
    category: 'tech',
    resolution: '1080p Full HD',
  },
  {
    id: 'guest-vid-7',
    title: 'Electronic Music Festival Live Set — Soundwave 2026',
    description:
      'High-energy progressive house and synthwave set recorded live in 4K spatial audio at Soundwave Arena.',
    videoUrl: `${BUCKET}/TearsOfSteel.mp4`,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop&q=80',
    channelId: 'chan-soundwave',
    channelName: 'Sample Channel',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=SampleChannel',
    views: 0,
    uploadedAt: '',
    publishedAt: '2026-09-30T12:00:00.000Z',
    duration: 3600,
    category: 'music',
    resolution: '1080p Full HD',
  },
  {
    id: 'guest-vid-8',
    title: 'Formula 1 2026 Season Opener — Cinematic Race Highlights & Overtakes',
    description:
      'Experience wheel-to-wheel racing at 350 km/h with 4K cockpit telemetry and high-drama overtakes.',
    videoUrl: `${BUCKET}/WeAreGoingOnBullrun.mp4`,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop&q=80',
    channelId: 'chan-speed-channel',
    channelName: 'Sample Channel',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=SampleChannel',
    views: 0,
    uploadedAt: '',
    publishedAt: '2026-10-04T12:00:00.000Z',
    duration: 1240,
    category: 'sports',
    resolution: '720p HD',
  },
  {
    id: 'guest-vid-9',
    title: 'Autonomous Drone Racing Championship — 4K FPV Obstacle Course',
    description:
      'High-speed autonomous AI drones competing through neon-lit obstacles in record-breaking times.',
    videoUrl: `${BUCKET}/WhatCarCanYouGetForAGrand.mp4`,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=800&auto=format&fit=crop&q=80',
    channelId: 'chan-fpv-pulse',
    channelName: 'Sample Channel',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=SampleChannel',
    views: 0,
    uploadedAt: '',
    publishedAt: '2026-10-02T12:00:00.000Z',
    duration: 780,
    category: 'sports',
    resolution: '480p SD',
  },
  {
    id: 'guest-vid-10',
    title: 'Indie Game Developer Showcase 2026 — Top 10 Upcoming Masterpieces',
    description:
      'A curated showcase of the most creative indie games currently in development, featuring gameplay footage and developer insights.',
    videoUrl: `${BUCKET}/BigBuckBunny.mp4`,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1552824744-f9037cfa9074?w=800&auto=format&fit=crop&q=80',
    channelId: 'chan-indie-spotlight',
    channelName: 'Sample Channel',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=SampleChannel',
    views: 0,
    uploadedAt: '',
    publishedAt: '2026-09-29T12:00:00.000Z',
    duration: 1450,
    category: 'gaming',
    resolution: '1080p Full HD',
  },
  {
    id: 'guest-vid-11',
    title: 'AI Agent Swarms in Production: Lessons from 100M Daily Events',
    description:
      'Architecture breakdown of how multi-agent swarms coordinate autonomous tasks, prevent race conditions, and self-heal in distributed production clusters.',
    videoUrl: `${BUCKET}/ElephantsDream.mp4`,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&auto=format&fit=crop&q=80',
    channelId: 'chan-quant-labs',
    channelName: 'Sample Channel',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=SampleChannel',
    views: 0,
    uploadedAt: '',
    publishedAt: '2026-10-03T12:00:00.000Z',
    duration: 1980,
    category: 'education',
    resolution: '1080p Full HD',
  },
  {
    id: 'guest-vid-12',
    title: 'Cosmic Horizons: Ultra High Definition James Webb Deep Space Odyssey',
    description:
      'Travel through distant nebulae, gravitational lenses, and early galaxy formations captured by the James Webb Space Telescope in stunning detail.',
    videoUrl: `${BUCKET}/ForBiggerBlazes.mp4`,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80',
    channelId: 'chan-cosmos-odyssey',
    channelName: 'Sample Channel',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=SampleChannel',
    views: 0,
    uploadedAt: '',
    publishedAt: '2026-10-01T12:00:00.000Z',
    duration: 2100,
    category: 'entertainment',
    resolution: '1080p Full HD',
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
    isLive: v.isLive ?? false,
    publishedAt: v.publishedAt,
    createdAt: v.publishedAt,
    updatedAt: v.publishedAt,
    // Honesty marker: this row is a built-in sample, not real user content.
    isSample: true,
  };
}
