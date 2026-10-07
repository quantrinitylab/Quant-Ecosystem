export type PostcardPaperTexture =
  | 'vintage-parchment'
  | 'antique-map'
  | 'botanical-linen'
  | 'obsidian-matte'
  | 'clean-ivory';

export type PostcardStampType =
  | 'mascot'
  | 'vintage-seal'
  | 'botanical-flower'
  | 'travel-scenic'
  | 'custom';

export type PostcardFont = 'typewriter' | 'handwriting' | 'serif' | 'classic';

export interface PostcardSticker {
  id: string;
  src: string;
  x: number; // percentage (0 - 100)
  y: number; // percentage (0 - 100)
  scale: number; // 0.5 - 2.0
  rotation: number; // degrees (-180 to 180)
  alt?: string;
}

export interface PostcardStampConfig {
  type: PostcardStampType;
  customImageUrl?: string;
  postmarkText: string;
  postmarkCity?: string;
  value: string;
  accentColor?: string;
}

export interface PostcardTemplate {
  id: string;
  name: string;
  description: string;
  category: 'vintage' | 'botanical' | 'luxury' | 'travel' | 'custom';
  paperTexture: PostcardPaperTexture;
  hasFiligree: boolean;
  frontImageUrl?: string; // For 2-sided postcards
  stamp: PostcardStampConfig;
  stickers: PostcardSticker[];
  fontFamily: PostcardFont;
  inkColor: string;
  createdAt?: string;
  isCustom?: boolean;
}

export interface PostcardPayload {
  template: PostcardTemplate;
  message: string;
  recipientName?: string;
  recipientEmail?: string;
  senderName?: string;
  senderEmail?: string;
  dateString?: string;
  locationString?: string;
}

export const DEFAULT_VINTAGE_PRESETS: PostcardTemplate[] = [
  {
    id: 'vintage-wanderlust',
    name: 'Wanderlust Explorer',
    description:
      'Aged parchment paper with subtle antique world map watermark, flight heart trail, and classic postmark.',
    category: 'vintage',
    paperTexture: 'antique-map',
    hasFiligree: true,
    fontFamily: 'typewriter',
    inkColor: '#2C1D11',
    stamp: {
      type: 'mascot',
      postmarkText: 'QUANTMAIL · TRANSIT',
      postmarkCity: 'WORLDWIDE',
      value: '25¢',
      accentColor: '#D97706',
    },
    stickers: [],
  },
  {
    id: 'victorian-elegance',
    name: 'Victorian Letterpress',
    description:
      'Warm antique parchment with ornate Victorian corner filigrees, engraved Post Card header, and walnut ink.',
    category: 'vintage',
    paperTexture: 'vintage-parchment',
    hasFiligree: true,
    fontFamily: 'serif',
    inkColor: '#1F1610',
    stamp: {
      type: 'vintage-seal',
      postmarkText: 'POSTAL CORRESPONDENCE',
      postmarkCity: 'LONDON / NY',
      value: '50¢',
      accentColor: '#B45309',
    },
    stickers: [],
  },
  {
    id: 'botanical-blossom',
    name: 'Botanical Watercolor',
    description:
      'Soft textured linen paper with delicate watercolor wildflower accents and heart cancellation stamps.',
    category: 'botanical',
    paperTexture: 'botanical-linen',
    hasFiligree: false,
    fontFamily: 'handwriting',
    inkColor: '#2D2824',
    stamp: {
      type: 'botanical-flower',
      postmarkText: 'WITH LOVE · POSTAL',
      postmarkCity: 'BOTANICAL ARCHIVES',
      value: '💌',
      accentColor: '#059669',
    },
    stickers: [],
  },
  {
    id: 'kyoto-scenic',
    name: 'Greetings from Kyoto',
    description:
      'Double-sided postcard featuring Mount Fuji & Cherry Blossoms on front, and vintage stamp back.',
    category: 'travel',
    paperTexture: 'clean-ivory',
    hasFiligree: true,
    frontImageUrl:
      'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800&auto=format&fit=crop&q=80',
    fontFamily: 'handwriting',
    inkColor: '#1A1815',
    stamp: {
      type: 'travel-scenic',
      postmarkText: 'KYOTO · JAPAN · AIR POST',
      postmarkCity: 'KYOTO',
      value: '¥80',
      accentColor: '#DC2626',
    },
    stickers: [],
  },
  {
    id: 'obsidian-gold-luxury',
    name: 'Obsidian 24K Gold',
    description: 'Charcoal matte luxury cardstock with glowing gold foil filigree and amber seal.',
    category: 'luxury',
    paperTexture: 'obsidian-matte',
    hasFiligree: true,
    fontFamily: 'classic',
    inkColor: '#F59E0B',
    stamp: {
      type: 'mascot',
      postmarkText: 'QUANTMAIL · OBSIDIAN',
      postmarkCity: 'QUANTUM ENCRYPTED',
      value: '⚡',
      accentColor: '#F59E0B',
    },
    stickers: [],
  },
];
