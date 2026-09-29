// ============================================================================
// QuantEdit - Template Service
// ============================================================================
//
// A catalog of ready-to-edit project templates (the CapCut/Canva pattern):
// pick a template -> get a fully-formed project draft (canvas size, duration,
// preset layers) to start editing from. Pure in-memory catalog + a deterministic
// "apply" transform, so it is fully unit-testable with no I/O.

export type ProjectType = 'VIDEO' | 'PHOTO' | 'COLLAGE';
export type TemplateCategory = 'social' | 'youtube' | 'marketing' | 'story' | 'post';

export interface TemplateLayer {
  kind: 'text' | 'media' | 'shape' | 'audio';
  name: string;
  /** seconds from project start */
  start: number;
  /** seconds */
  duration: number;
}

export interface EditTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  type: ProjectType;
  aspectRatio: string;
  width: number;
  height: number;
  durationSec: number;
  thumbnailUrl: string;
  layers: TemplateLayer[];
}

/** A ready-to-create project derived from a template. */
export interface ProjectDraft {
  name: string;
  type: ProjectType;
  aspectRatio: string;
  width: number;
  height: number;
  durationSec: number;
  layers: TemplateLayer[];
  templateId: string;
}

export class TemplateNotFoundError extends Error {
  constructor() {
    super('Template not found');
    this.name = 'TemplateNotFoundError';
  }
}

const CATALOG: EditTemplate[] = [
  {
    id: 'reel-vertical',
    name: 'Vertical Reel',
    description: '9:16 short-form video with title and beat-synced cuts.',
    category: 'social',
    type: 'VIDEO',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    durationSec: 15,
    thumbnailUrl: '/templates/reel-vertical.jpg',
    layers: [
      { kind: 'media', name: 'Clip 1', start: 0, duration: 7 },
      { kind: 'media', name: 'Clip 2', start: 7, duration: 8 },
      { kind: 'text', name: 'Hook title', start: 0, duration: 3 },
      { kind: 'audio', name: 'Track', start: 0, duration: 15 },
    ],
  },
  {
    id: 'story-quick',
    name: 'Story Quick Post',
    description: '9:16 story with a single clip and sticker text.',
    category: 'story',
    type: 'VIDEO',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    durationSec: 7,
    thumbnailUrl: '/templates/story-quick.jpg',
    layers: [
      { kind: 'media', name: 'Clip', start: 0, duration: 7 },
      { kind: 'text', name: 'Sticker text', start: 1, duration: 5 },
    ],
  },
  {
    id: 'youtube-intro',
    name: 'YouTube Intro',
    description: '16:9 intro with logo reveal and lower-third.',
    category: 'youtube',
    type: 'VIDEO',
    aspectRatio: '16:9',
    width: 1920,
    height: 1080,
    durationSec: 10,
    thumbnailUrl: '/templates/youtube-intro.jpg',
    layers: [
      { kind: 'shape', name: 'Background', start: 0, duration: 10 },
      { kind: 'media', name: 'Logo', start: 1, duration: 4 },
      { kind: 'text', name: 'Channel name', start: 2, duration: 6 },
      { kind: 'audio', name: 'Stinger', start: 0, duration: 3 },
    ],
  },
  {
    id: 'square-post',
    name: 'Square Promo Post',
    description: '1:1 photo post with headline and CTA.',
    category: 'post',
    type: 'PHOTO',
    aspectRatio: '1:1',
    width: 1080,
    height: 1080,
    durationSec: 0,
    thumbnailUrl: '/templates/square-post.jpg',
    layers: [
      { kind: 'media', name: 'Photo', start: 0, duration: 0 },
      { kind: 'text', name: 'Headline', start: 0, duration: 0 },
      { kind: 'text', name: 'CTA', start: 0, duration: 0 },
    ],
  },
  {
    id: 'collage-3',
    name: '3-Photo Collage',
    description: '4:5 collage grid for three photos.',
    category: 'post',
    type: 'COLLAGE',
    aspectRatio: '4:5',
    width: 1080,
    height: 1350,
    durationSec: 0,
    thumbnailUrl: '/templates/collage-3.jpg',
    layers: [
      { kind: 'media', name: 'Photo 1', start: 0, duration: 0 },
      { kind: 'media', name: 'Photo 2', start: 0, duration: 0 },
      { kind: 'media', name: 'Photo 3', start: 0, duration: 0 },
    ],
  },
];

export class TemplateService {
  listTemplates(category?: TemplateCategory): EditTemplate[] {
    const all = CATALOG.map((t) => ({ ...t, layers: t.layers.map((l) => ({ ...l })) }));
    return category ? all.filter((t) => t.category === category) : all;
  }

  getTemplate(id: string): EditTemplate {
    const t = CATALOG.find((x) => x.id === id);
    if (!t) throw new TemplateNotFoundError();
    return { ...t, layers: t.layers.map((l) => ({ ...l })) };
  }

  /**
   * Produce a ready-to-create project draft from a template. (Persisting the
   * project is the caller's responsibility once the editor project store is
   * wired; this returns the fully-formed draft the client/editor starts from.)
   */
  applyTemplate(id: string, opts: { name?: string } = {}): ProjectDraft {
    const t = this.getTemplate(id);
    return {
      name: opts.name?.trim() || t.name,
      type: t.type,
      aspectRatio: t.aspectRatio,
      width: t.width,
      height: t.height,
      durationSec: t.durationSec,
      layers: t.layers,
      templateId: t.id,
    };
  }
}
