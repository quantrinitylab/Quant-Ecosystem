// ============================================================================
// QuantTube - Sample Shorts
// ----------------------------------------------------------------------------
// Built-in sample shorts: REAL playable 6-second animated title cards,
// self-hosted under public/samples/, with real thumbnails extracted from the
// videos themselves (public/samples/posters/) and a local channel avatar.
// Zero external dependencies. The clips have NO audio track, so sound fields
// are neutral "no audio" values — never invented track/artist names.
// Engagement metadata is intentionally neutral (0 likes/comments/shares),
// durations are the REAL measured clip lengths, and channels are the neutral
// "Sample Channel" — no fake counts, durations, sounds, or creators.
// Everything here is sample content: `isSample: true` must be surfaced in the UI.
// ============================================================================

export interface SampleShort {
  id: string;
  videoUrl: string;
  thumbnailUrl: string;
  title: string;
  channelName: string;
  channelAvatar: string;
  channelId: string;
  isSubscribed: boolean;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  soundName: string;
  soundArtist: string;
  soundId: string;
  description: string;
  tags: string[];
  createdAt: string;
  /** Seconds. The REAL measured length of the clip. */
  duration: number;
  /** Always true — render a "Sample" badge, never present as real uploads. */
  isSample: true;
}

const SHORT_DESC =
  'Built-in sample placeholder — a 6-second animated title card with no audio. Real creator shorts will appear here once the catalog has content.';
const SHORT_AVATAR = '/samples/sample-avatar.svg';

export const SAMPLE_SHORTS: SampleShort[] = [
  {
    id: 'sh1',
    videoUrl: '/samples/short-01.mp4',
    thumbnailUrl: '/samples/posters/short-01.jpg',
    title: '60-sec coding tutorial #react (Sample)',
    channelName: 'Sample Channel',
    channelAvatar: SHORT_AVATAR,
    channelId: 'ch-sample',
    isSubscribed: false,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    soundName: 'No audio',
    soundArtist: 'Sample Channel',
    soundId: 'snd-sample',
    description: SHORT_DESC,
    tags: ['sample'],
    createdAt: '2026-10-11T00:00:00Z',
    duration: 6,
    isSample: true,
  },
  {
    id: 'sh2',
    videoUrl: '/samples/short-02.mp4',
    thumbnailUrl: '/samples/posters/short-02.jpg',
    title: 'Insane basketball trick shot (Sample)',
    channelName: 'Sample Channel',
    channelAvatar: SHORT_AVATAR,
    channelId: 'ch-sample',
    isSubscribed: false,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    soundName: 'No audio',
    soundArtist: 'Sample Channel',
    soundId: 'snd-sample',
    description: SHORT_DESC,
    tags: ['sample'],
    createdAt: '2026-10-11T00:00:00Z',
    duration: 6,
    isSample: true,
  },
  {
    id: 'sh3',
    videoUrl: '/samples/short-03.mp4',
    thumbnailUrl: '/samples/posters/short-03.jpg',
    title: 'Making the perfect latte art (Sample)',
    channelName: 'Sample Channel',
    channelAvatar: SHORT_AVATAR,
    channelId: 'ch-sample',
    isSubscribed: false,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    soundName: 'No audio',
    soundArtist: 'Sample Channel',
    soundId: 'snd-sample',
    description: SHORT_DESC,
    tags: ['sample'],
    createdAt: '2026-10-11T00:00:00Z',
    duration: 6,
    isSample: true,
  },
  {
    id: 'sh4',
    videoUrl: '/samples/short-04.mp4',
    thumbnailUrl: '/samples/posters/short-04.jpg',
    title: 'Drone footage of Iceland glaciers (Sample)',
    channelName: 'Sample Channel',
    channelAvatar: SHORT_AVATAR,
    channelId: 'ch-sample',
    isSubscribed: false,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    soundName: 'No audio',
    soundArtist: 'Sample Channel',
    soundId: 'snd-sample',
    description: SHORT_DESC,
    tags: ['sample'],
    createdAt: '2026-10-11T00:00:00Z',
    duration: 6,
    isSample: true,
  },
  {
    id: 'sh5',
    videoUrl: '/samples/short-05.mp4',
    thumbnailUrl: '/samples/posters/short-05.jpg',
    title: 'Dog learns to open door (Sample)',
    channelName: 'Sample Channel',
    channelAvatar: SHORT_AVATAR,
    channelId: 'ch-sample',
    isSubscribed: false,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    soundName: 'No audio',
    soundArtist: 'Sample Channel',
    soundId: 'snd-sample',
    description: SHORT_DESC,
    tags: ['sample'],
    createdAt: '2026-10-11T00:00:00Z',
    duration: 6,
    isSample: true,
  },
];
