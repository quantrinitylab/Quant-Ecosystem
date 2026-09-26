// ============================================================================
// QuantGram - Public Featured Reels & Explore Posts
// Curated public content for unauthenticated guests to ensure zero blank screens
// and seamless guest exploration matching Instagram / TikTok experience.
// ============================================================================

export interface PublicReelItem {
  id: string;
  userId: string;
  creator: string;
  creatorAvatar: string;
  username: string;
  userAvatar: string;
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  soundName: string;
  soundId: string;
  duration: number;
  likeCount: number;
  likes: number;
  commentCount: number;
  comments: number;
  shareCount: number;
  shares: number;
  plays: number;
  isLiked: boolean;
  isSaved: boolean;
  isFeatured: boolean;
}

export interface PublicExplorePostItem {
  id: string;
  userId: string;
  username: string;
  userAvatar: string;
  authorUsername?: string;
  authorAvatar?: string;
  type: 'photo' | 'video' | 'carousel';
  mediaUrls: string[];
  media: Array<{
    id: string;
    type: 'image' | 'video';
    url: string;
    width: number;
    height: number;
  }>;
  caption: string;
  hashtags: string[];
  mentions: string[];
  likes: number;
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  isSaved: boolean;
  isPinned: boolean;
  collaborators: string[];
  createdAt: string;
}

export const PUBLIC_FEATURED_REELS: PublicReelItem[] = [
  {
    id: 'guest-reel-1',
    userId: 'user-nature-zen',
    creator: 'swissalps_explorer',
    creatorAvatar:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
    username: 'swissalps_explorer',
    userAvatar:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
    videoUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&auto=format&fit=crop&q=80',
    caption:
      'Golden hour mist over the peaks 🏔️ Where would you rather wake up? #mountains #nature #travel #reels',
    soundName: 'Original Audio - Alpine Dreams',
    soundId: 'snd-alpine-1',
    duration: 15,
    likeCount: 48920,
    likes: 48920,
    commentCount: 684,
    comments: 684,
    shareCount: 3120,
    shares: 3120,
    plays: 284000,
    isLiked: false,
    isSaved: false,
    isFeatured: true,
  },
  {
    id: 'guest-reel-2',
    userId: 'user-cyber-tokyo',
    creator: 'tokyo_nightwalk',
    creatorAvatar:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
    username: 'tokyo_nightwalk',
    userAvatar:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
    videoUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=800&auto=format&fit=crop&q=80',
    caption:
      'Rainy Shibuya crossings in neon cyberpunk glow 🌧️✨ Headphones recommended #tokyo #cyberpunk #aesthetic #cityvibes',
    soundName: 'Synthwave Nightfall - QuantRecords',
    soundId: 'snd-synth-2',
    duration: 15,
    likeCount: 92400,
    likes: 92400,
    commentCount: 1450,
    comments: 1450,
    shareCount: 6400,
    shares: 6400,
    plays: 512000,
    isLiked: false,
    isSaved: false,
    isFeatured: true,
  },
  {
    id: 'guest-reel-3',
    userId: 'user-quant-dev',
    creator: 'quant_builds',
    creatorAvatar:
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&auto=format&fit=crop&q=80',
    username: 'quant_builds',
    userAvatar:
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&auto=format&fit=crop&q=80',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
    caption:
      'Building a full-stack real-time collaboration canvas in 60 seconds with QuantAI ⚡️🤖 #coding #dev #developer #ai',
    soundName: 'Focus Beats Vol. 4',
    soundId: 'snd-focus-3',
    duration: 15,
    likeCount: 67100,
    likes: 67100,
    commentCount: 890,
    comments: 890,
    shareCount: 4200,
    shares: 4200,
    plays: 389000,
    isLiked: false,
    isSaved: false,
    isFeatured: true,
  },
  {
    id: 'guest-reel-4',
    userId: 'user-coffee-art',
    creator: 'aesthetic_roastery',
    creatorAvatar:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
    username: 'aesthetic_roastery',
    userAvatar:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
    videoUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800&auto=format&fit=crop&q=80',
    caption:
      'Sunday morning pour-over ritual ☕️ Take a breath and slow down today. #coffee #morningroutine #slowliving #cozy',
    soundName: 'Morning Breeze - Acoustic Guitar',
    soundId: 'snd-coffee-4',
    duration: 15,
    likeCount: 38700,
    likes: 38700,
    commentCount: 425,
    comments: 425,
    shareCount: 1540,
    shares: 1540,
    plays: 198000,
    isLiked: false,
    isSaved: false,
    isFeatured: true,
  },
];

export const PUBLIC_FEATURED_POSTS: PublicExplorePostItem[] = [
  {
    id: 'explore-post-1',
    userId: 'user-art-gallery',
    username: 'contemporary_spaces',
    userAvatar:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
    type: 'photo',
    mediaUrls: [
      'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800&auto=format&fit=crop&q=80',
    ],
    media: [
      {
        id: 'med-1',
        type: 'image',
        url: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800&auto=format&fit=crop&q=80',
        width: 800,
        height: 1000,
      },
    ],
    caption:
      'Geometry and shadow play in modern architectural installations #Art #Architecture #Minimal',
    hashtags: ['#Art', '#Architecture', '#Minimal', '#ArtOfTheDay'],
    mentions: [],
    likes: 12400,
    likeCount: 12400,
    commentCount: 142,
    isLiked: false,
    isSaved: false,
    isPinned: false,
    collaborators: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'explore-post-2',
    userId: 'user-travel-lens',
    username: 'wanderlust_nomad',
    userAvatar:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
    type: 'photo',
    mediaUrls: [
      'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&auto=format&fit=crop&q=80',
    ],
    media: [
      {
        id: 'med-2',
        type: 'image',
        url: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&auto=format&fit=crop&q=80',
        width: 800,
        height: 600,
      },
    ],
    caption: 'Lost in the cobbled streets of Southern Europe #Travel #TravelGram #Photography',
    hashtags: ['#Travel', '#TravelGram', '#Photography', '#Sunset'],
    mentions: [],
    likes: 24800,
    likeCount: 24800,
    commentCount: 389,
    isLiked: false,
    isSaved: false,
    isPinned: false,
    collaborators: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'explore-post-3',
    userId: 'user-gourmet-plate',
    username: 'chef_artistry',
    userAvatar:
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&auto=format&fit=crop&q=80',
    type: 'photo',
    mediaUrls: [
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&auto=format&fit=crop&q=80',
    ],
    media: [
      {
        id: 'med-3',
        type: 'image',
        url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&auto=format&fit=crop&q=80',
        width: 800,
        height: 800,
      },
    ],
    caption:
      'Handcrafted seasonal pasta with herb-infused butter emulsion #Food #FoodPorn #Culinary',
    hashtags: ['#Food', '#FoodPorn', '#Culinary', '#Chef'],
    mentions: [],
    likes: 18900,
    likeCount: 18900,
    commentCount: 230,
    isLiked: false,
    isSaved: false,
    isPinned: false,
    collaborators: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'explore-post-4',
    userId: 'user-style-runway',
    username: 'monochrome_fashion',
    userAvatar:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
    type: 'photo',
    mediaUrls: [
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&auto=format&fit=crop&q=80',
    ],
    media: [
      {
        id: 'med-4',
        type: 'image',
        url: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&auto=format&fit=crop&q=80',
        width: 800,
        height: 1100,
      },
    ],
    caption: 'Autumn wool silhouettes and tailored lines #Fashion #OOTD #Style',
    hashtags: ['#Fashion', '#OOTD', '#Minimal', '#Style'],
    mentions: [],
    likes: 31200,
    likeCount: 31200,
    commentCount: 412,
    isLiked: false,
    isSaved: false,
    isPinned: false,
    collaborators: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'explore-post-5',
    userId: 'user-fitness-forge',
    username: 'peak_performance',
    userAvatar:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
    type: 'photo',
    mediaUrls: [
      'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=800&auto=format&fit=crop&q=80',
    ],
    media: [
      {
        id: 'med-5',
        type: 'image',
        url: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=800&auto=format&fit=crop&q=80',
        width: 800,
        height: 800,
      },
    ],
    caption: 'Early morning sprints — consistency always compounds #Sports #FitnessMotivation #Run',
    hashtags: ['#Sports', '#FitnessMotivation', '#Fitness', '#Workout'],
    mentions: [],
    likes: 15400,
    likeCount: 15400,
    commentCount: 180,
    isLiked: false,
    isSaved: false,
    isPinned: false,
    collaborators: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'explore-post-6',
    userId: 'user-acoustic-lab',
    username: 'quant_soundscapes',
    userAvatar:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
    type: 'video',
    mediaUrls: [
      'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=80',
    ],
    media: [
      {
        id: 'med-6',
        type: 'video',
        url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=80',
        width: 800,
        height: 800,
      },
    ],
    caption: 'Analog synthesizer modular jam sessions 🎹 #Music #Acoustic #LoFi',
    hashtags: ['#Music', '#Soundscapes', '#ArtOfTheDay'],
    mentions: [],
    likes: 27900,
    likeCount: 27900,
    commentCount: 360,
    isLiked: false,
    isSaved: false,
    isPinned: false,
    collaborators: [],
    createdAt: new Date().toISOString(),
  },
];

export function getGuestFeaturedReels(): PublicReelItem[] {
  return [...PUBLIC_FEATURED_REELS];
}

export function getGuestFeaturedPosts(): PublicExplorePostItem[] {
  return [...PUBLIC_FEATURED_POSTS];
}
