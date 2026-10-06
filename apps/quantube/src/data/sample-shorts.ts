// ============================================================================
// QuantTube - Sample Shorts
// ----------------------------------------------------------------------------
// Built-in sample shorts with REAL playable video URLs (Google's public sample
// bucket) and real thumbnails. The old MOCK_SHORTS pointed at /videos/shortN.mp4
// and /thumbs/shortN.jpg, which do not exist (404 → black player).
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
  duration: number;
  /** Always true — render a "Sample" badge, never present as real uploads. */
  isSample: true;
}

const BUCKET = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample';

export const SAMPLE_SHORTS: SampleShort[] = [
  {
    id: 'sh1',
    videoUrl: `${BUCKET}/ForBiggerBlazes.mp4`,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&auto=format&fit=crop&q=80',
    title: '60-second coding tutorial #react',
    channelName: 'CodeSnippets',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=CodeSnippets',
    channelId: 'ch1',
    isSubscribed: false,
    likeCount: 45200,
    commentCount: 892,
    shareCount: 2340,
    soundName: 'Lo-fi Coding Beats',
    soundArtist: 'ChillHop',
    soundId: 'snd1',
    description: 'Learn React hooks in 60 seconds! #coding #react #tutorial',
    tags: ['coding', 'react', 'tutorial'],
    createdAt: '2024-01-14T10:00:00Z',
    duration: 58,
    isSample: true,
  },
  {
    id: 'sh2',
    videoUrl: `${BUCKET}/WeAreGoingOnBullrun.mp4`,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=600&auto=format&fit=crop&q=80',
    title: 'Insane basketball trick shot',
    channelName: 'TrickShots',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=TrickShots',
    channelId: 'ch2',
    isSubscribed: true,
    likeCount: 128000,
    commentCount: 3400,
    shareCount: 15600,
    soundName: 'Original Sound',
    soundArtist: 'TrickShots',
    soundId: 'snd2',
    description: 'You wont believe this shot! #basketball #trickshot',
    tags: ['basketball', 'trickshot', 'sports'],
    createdAt: '2024-01-13T15:30:00Z',
    duration: 32,
    isSample: true,
  },
  {
    id: 'sh3',
    videoUrl: `${BUCKET}/ForBiggerFun.mp4`,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=600&auto=format&fit=crop&q=80',
    title: 'Making the perfect latte art',
    channelName: 'CoffeeArtist',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=CoffeeArtist',
    channelId: 'ch3',
    isSubscribed: false,
    likeCount: 67300,
    commentCount: 1200,
    shareCount: 8900,
    soundName: 'Morning Vibes',
    soundArtist: 'LoFi Records',
    soundId: 'snd3',
    description: 'Satisfying latte art pour #coffee #art #satisfying',
    tags: ['coffee', 'art', 'satisfying'],
    createdAt: '2024-01-12T08:00:00Z',
    duration: 45,
    isSample: true,
  },
  {
    id: 'sh4',
    videoUrl: `${BUCKET}/WhatCarCanYouGetForAGrand.mp4`,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=600&auto=format&fit=crop&q=80',
    title: 'Drone footage of Iceland glaciers',
    channelName: 'NatureViews',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=NatureViews',
    channelId: 'ch4',
    isSubscribed: true,
    likeCount: 234000,
    commentCount: 5600,
    shareCount: 42000,
    soundName: 'Epic Cinematic',
    soundArtist: 'SoundScapes',
    soundId: 'snd4',
    description: 'Iceland from above - breathtaking glaciers #travel #nature #iceland',
    tags: ['travel', 'nature', 'iceland', 'drone'],
    createdAt: '2024-01-11T12:00:00Z',
    duration: 55,
    isSample: true,
  },
  {
    id: 'sh5',
    videoUrl: `${BUCKET}/BigBuckBunny.mp4`,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&auto=format&fit=crop&q=80',
    title: 'Dog learns to open door',
    channelName: 'PetLife',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=PetLife',
    channelId: 'ch5',
    isSubscribed: false,
    likeCount: 890000,
    commentCount: 12000,
    shareCount: 67000,
    soundName: 'Funny Moments',
    soundArtist: 'Meme Sounds',
    soundId: 'snd5',
    description: 'My golden retriever figured out how to open the door! #dogs #funny #pets',
    tags: ['dogs', 'funny', 'pets'],
    createdAt: '2024-01-10T20:00:00Z',
    duration: 28,
    isSample: true,
  },
];
