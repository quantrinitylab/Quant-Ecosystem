// ============================================================================
// QuanTube - Public & Guest Featured Videos
// Curated public fallback videos for unauthenticated guests, 401s, or offline states.
// ============================================================================

export interface PublicFeaturedVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  thumbnailUrl: string;
  videoUrl: string;
  url: string;
  channelId: string;
  channelName: string;
  channelAvatar: string;
  views: number;
  uploadedAt: string;
  duration: number;
  isLive?: boolean;
  category: string;
}

export const PUBLIC_FEATURED_VIDEOS: PublicFeaturedVideo[] = [
  {
    id: 'guest-vid-1',
    title: 'Building the Future of Sovereign Computing: Quant OS Keynote 2026',
    description:
      'An exclusive walkthrough of the distributed sovereign cloud, AI-orchestrated runtime, and zero-knowledge memory architecture powering the Quant Ecosystem.',
    thumbnail:
      'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=80',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=80',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    url: '/watch/guest-vid-1',
    channelId: 'chan-quant-labs',
    channelName: 'Quant Labs Official',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=QuantLabs',
    views: 482000,
    uploadedAt: '2 days ago',
    duration: 1845,
    category: 'tech',
  },
  {
    id: 'guest-vid-2',
    title: 'Quant Beats — Lo-Fi Chill Beats to Code / Relax to [24/7 Live Stream]',
    description:
      'Continuous generative lo-fi streams, ambient soundscapes, and chill beats for deep focus work, coding sessions, and study.',
    thumbnail:
      'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=80',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=80',
    videoUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    url: '/watch/guest-vid-2',
    channelId: 'chan-lofi-records',
    channelName: 'Sovereign Audio & LoFi',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=SovereignAudio',
    views: 1250000,
    uploadedAt: 'Live Now',
    duration: 0,
    isLive: true,
    category: 'music',
  },
  {
    id: 'guest-vid-3',
    title: 'Deep Dive into Distributed CRDTs and Multi-Master Databases',
    description:
      'Learn how conflict-free replicated data types synchronize document state in real time across tens of thousands of active peers without central locks.',
    thumbnail:
      'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&auto=format&fit=crop&q=80',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&auto=format&fit=crop&q=80',
    videoUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    url: '/watch/guest-vid-3',
    channelId: 'chan-systems-eng',
    channelName: 'Systems Engineering Academy',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=SystemsEngineering',
    views: 195000,
    uploadedAt: '5 days ago',
    duration: 2460,
    category: 'education',
  },
  {
    id: 'guest-vid-4',
    title: 'Championship Grand Finals — Global Esports Highlights 2026',
    description:
      'Relive the most intense clutch moments, tactical teamfights, and game-winning aces from the World Championship arena.',
    thumbnail:
      'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80',
    videoUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    url: '/watch/guest-vid-4',
    channelId: 'chan-esports-global',
    channelName: 'Esports Global Network',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=EsportsGlobal',
    views: 840000,
    uploadedAt: '1 week ago',
    duration: 1120,
    category: 'gaming',
  },
  {
    id: 'guest-vid-5',
    title: 'Global Tech & Market Round-up: The Rise of Sovereign AI',
    description:
      'Breaking down major developments in localized inference, sovereign cloud infrastructure, and private intelligence networks worldwide.',
    thumbnail:
      'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&auto=format&fit=crop&q=80',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&auto=format&fit=crop&q=80',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    url: '/watch/guest-vid-5',
    channelId: 'chan-techpulse',
    channelName: 'TechPulse Daily',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=TechPulse',
    views: 310000,
    uploadedAt: '3 days ago',
    duration: 890,
    category: 'news',
  },
  {
    id: 'guest-vid-6',
    title: 'Next-Gen Quantum GPU Architecture Explained: Parallel Qubits in Silicon',
    description:
      'How topological insulators and silicon photonics are redefining high-performance tensor computing for real-time autonomous swarms.',
    thumbnail:
      'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&auto=format&fit=crop&q=80',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&auto=format&fit=crop&q=80',
    videoUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4',
    url: '/watch/guest-vid-6',
    channelId: 'chan-quantum-insight',
    channelName: 'Quantum Insights',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=QuantumInsights',
    views: 620000,
    uploadedAt: '4 days ago',
    duration: 1540,
    category: 'tech',
  },
  {
    id: 'guest-vid-7',
    title: 'Electronic Music Festival Live Set — Soundwave 2026',
    description:
      'High-energy progressive house and synthwave set recorded live in 4K spatial audio at Soundwave Arena.',
    thumbnail:
      'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop&q=80',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop&q=80',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    url: '/watch/guest-vid-7',
    channelId: 'chan-soundwave',
    channelName: 'Soundwave Live',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=SoundwaveLive',
    views: 730000,
    uploadedAt: '6 days ago',
    duration: 3600,
    category: 'music',
  },
  {
    id: 'guest-vid-8',
    title: 'Formula 1 2026 Season Opener — Cinematic Race Highlights & Overtakes',
    description:
      'Experience wheel-to-wheel racing at 350 km/h with 4K cockpit telemetry and high-drama overtakes.',
    thumbnail:
      'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop&q=80',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop&q=80',
    videoUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
    url: '/watch/guest-vid-8',
    channelId: 'chan-speed-channel',
    channelName: 'Speed Network TV',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=SpeedNetwork',
    views: 950000,
    uploadedAt: '2 days ago',
    duration: 1240,
    category: 'sports',
  },
  {
    id: 'guest-vid-9',
    title: 'Autonomous Drone Racing Championship — 4K FPV Obstacle Course',
    description:
      'High-speed autonomous AI drones competing through neon-lit obstacles in record-breaking times.',
    thumbnail:
      'https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=800&auto=format&fit=crop&q=80',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=800&auto=format&fit=crop&q=80',
    videoUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WhatCarCanYouGetForAGrand.mp4',
    url: '/watch/guest-vid-9',
    channelId: 'chan-fpv-pulse',
    channelName: 'FPV Pulse Racing',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=FPVPulse',
    views: 412000,
    uploadedAt: '4 days ago',
    duration: 780,
    category: 'sports',
  },
  {
    id: 'guest-vid-10',
    title: 'Indie Game Developer Showcase 2026 — Top 10 Upcoming Masterpieces',
    description:
      'A curated showcase of the most creative indie games currently in development, featuring gameplay footage and developer insights.',
    thumbnail:
      'https://images.unsplash.com/photo-1552824744-f9037cfa9074?w=800&auto=format&fit=crop&q=80',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1552824744-f9037cfa9074?w=800&auto=format&fit=crop&q=80',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    url: '/watch/guest-vid-10',
    channelId: 'chan-indie-spotlight',
    channelName: 'Indie Game Spotlight',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=IndieSpotlight',
    views: 520000,
    uploadedAt: '1 week ago',
    duration: 1450,
    category: 'gaming',
  },
  {
    id: 'guest-vid-11',
    title: 'AI Agent Swarms in Production: Lessons from 100M Daily Events',
    description:
      'Architecture breakdown of how multi-agent swarms coordinate autonomous tasks, prevent race conditions, and self-heal in distributed production clusters.',
    thumbnail:
      'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&auto=format&fit=crop&q=80',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&auto=format&fit=crop&q=80',
    videoUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    url: '/watch/guest-vid-11',
    channelId: 'chan-quant-labs',
    channelName: 'Quant Labs Official',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=QuantLabs',
    views: 375000,
    uploadedAt: '3 days ago',
    duration: 1980,
    category: 'education',
  },
  {
    id: 'guest-vid-12',
    title: 'Cosmic Horizons: Ultra High Definition James Webb Deep Space Odyssey',
    description:
      'Travel through distant nebulae, gravitational lenses, and early galaxy formations captured by the James Webb Space Telescope in stunning detail.',
    thumbnail:
      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80',
    videoUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    url: '/watch/guest-vid-12',
    channelId: 'chan-cosmos-odyssey',
    channelName: 'Cosmos Odyssey 4K',
    channelAvatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=CosmosOdyssey',
    views: 890000,
    uploadedAt: '5 days ago',
    duration: 2100,
    category: 'entertainment',
  },
];

export function getGuestFeaturedVideos(category?: string): PublicFeaturedVideo[] {
  if (!category || category === 'all' || category === 'undefined') {
    return PUBLIC_FEATURED_VIDEOS;
  }
  const filtered = PUBLIC_FEATURED_VIDEOS.filter(
    (v) => v.category.toLowerCase() === category.toLowerCase(),
  );
  return filtered.length > 0 ? filtered : PUBLIC_FEATURED_VIDEOS;
}
