// ============================================================================
// QuantEdits - Effects Service
// ============================================================================
//
// Server-side catalog of editor effects (transitions / filters / overlays /
// text / sound) — the single source of truth behind the (previously dead)
// /effects proxy. The frontend EffectsLibrary hard-coded this list in local
// state; this moves it server-side so the catalog is consistent, filterable,
// and can later be personalized (favorites / usage) per user.
//
// Pure + in-memory (no DB); every getter returns defensive copies so callers
// can never mutate the shared catalog.

export type EffectCategory = 'transitions' | 'filters' | 'overlays' | 'text' | 'sound';

export const EFFECT_CATEGORIES: EffectCategory[] = [
  'transitions',
  'filters',
  'overlays',
  'text',
  'sound',
];

export interface EffectParameter {
  name: string;
  type: 'number' | 'color' | 'select' | 'boolean';
  default: number | string | boolean;
  min?: number;
  max?: number;
  options?: string[];
}

export interface Effect {
  id: string;
  name: string;
  category: EffectCategory;
  thumbnail: string;
  previewUrl: string;
  duration: number;
  isPremium: boolean;
  parameters: EffectParameter[];
  tags: string[];
  usageCount: number;
}

export interface ListEffectsOptions {
  category?: EffectCategory;
  search?: string;
  premiumOnly?: boolean;
  freeOnly?: boolean;
}

export class EffectNotFoundError extends Error {
  constructor(id: string) {
    super(`Effect not found: ${id}`);
    this.name = 'EffectNotFoundError';
  }
}

const CATALOG: Effect[] = [
  // ---- Transitions ----
  num(
    'tr-fade',
    'Fade',
    'transitions',
    0.5,
    false,
    ['smooth', 'basic'],
    1245,
    'Duration',
    0.5,
    0.1,
    3,
  ),
  num(
    'tr-dissolve',
    'Dissolve',
    'transitions',
    0.8,
    false,
    ['smooth', 'classic'],
    987,
    'Duration',
    0.8,
    0.2,
    3,
  ),
  num(
    'tr-slide-left',
    'Slide Left',
    'transitions',
    0.6,
    false,
    ['motion', 'slide'],
    756,
    'Duration',
    0.6,
    0.1,
    2,
  ),
  num(
    'tr-zoom',
    'Zoom In',
    'transitions',
    0.5,
    false,
    ['zoom', 'dynamic'],
    1123,
    'Scale',
    2,
    1.2,
    5,
  ),
  {
    id: 'tr-wipe',
    name: 'Wipe Right',
    category: 'transitions',
    thumbnail: '/fx/wipe.jpg',
    previewUrl: '/fx/wipe.mp4',
    duration: 0.7,
    isPremium: false,
    parameters: [],
    tags: ['wipe', 'clean'],
    usageCount: 543,
  },
  num(
    'tr-glitch',
    'Glitch',
    'transitions',
    0.3,
    true,
    ['glitch', 'modern', 'edgy'],
    892,
    'Intensity',
    50,
    10,
    100,
  ),

  // ---- Filters ----
  num(
    'fl-vintage',
    'Vintage',
    'filters',
    0,
    false,
    ['retro', 'warm'],
    2341,
    'Intensity',
    75,
    0,
    100,
  ),
  num(
    'fl-bw',
    'Black & White',
    'filters',
    0,
    false,
    ['mono', 'classic'],
    1876,
    'Contrast',
    20,
    -100,
    100,
  ),
  num(
    'fl-cinematic',
    'Cinematic',
    'filters',
    0,
    true,
    ['film', 'moody', 'teal-orange'],
    3456,
    'Teal',
    30,
    0,
    100,
  ),
  num(
    'fl-warm',
    'Warm Glow',
    'filters',
    0,
    false,
    ['warm', 'cozy'],
    1234,
    'Temperature',
    40,
    0,
    100,
  ),
  num(
    'fl-cool',
    'Cool Blue',
    'filters',
    0,
    false,
    ['cool', 'modern'],
    987,
    'Temperature',
    -30,
    -100,
    0,
  ),

  // ---- Overlays ----
  num(
    'ov-light-leak',
    'Light Leak',
    'overlays',
    2,
    false,
    ['light', 'warm', 'retro'],
    1567,
    'Opacity',
    50,
    10,
    100,
  ),
  num('ov-bokeh', 'Bokeh', 'overlays', 3, false, ['bokeh', 'dreamy'], 1234, 'Density', 50, 10, 100),
  num(
    'ov-particles',
    'Particles',
    'overlays',
    5,
    true,
    ['particles', 'magic', 'sparkle'],
    2345,
    'Count',
    50,
    10,
    200,
  ),

  // ---- Text ----
  num(
    'tx-typewriter',
    'Typewriter',
    'text',
    2,
    false,
    ['type', 'reveal'],
    2134,
    'Speed',
    50,
    10,
    200,
  ),
  {
    id: 'tx-bounce',
    name: 'Bounce In',
    category: 'text',
    thumbnail: '/fx/bounce-text.jpg',
    previewUrl: '/fx/bounce-text.mp4',
    duration: 0.5,
    isPremium: false,
    parameters: [],
    tags: ['bounce', 'fun'],
    usageCount: 1654,
  },
  num(
    'tx-glitch',
    'Glitch Text',
    'text',
    1,
    true,
    ['glitch', 'cyber'],
    1234,
    'Intensity',
    50,
    10,
    100,
  ),

  // ---- Sound ----
  num(
    'sf-whoosh',
    'Whoosh',
    'sound',
    0.5,
    false,
    ['transition', 'motion'],
    3456,
    'Volume',
    80,
    0,
    100,
  ),
  num('sf-impact', 'Impact', 'sound', 0.4, false, ['hit', 'bass'], 2876, 'Volume', 85, 0, 100),
  num('sf-riser', 'Riser', 'sound', 2, true, ['build', 'tension'], 1543, 'Volume', 75, 0, 100),
];

function num(
  id: string,
  name: string,
  category: EffectCategory,
  duration: number,
  isPremium: boolean,
  tags: string[],
  usageCount: number,
  paramName: string,
  def: number,
  min: number,
  max: number,
): Effect {
  const base = id.split('-')[1] ?? id;
  const ext = category === 'sound' ? 'mp3' : 'mp4';
  return {
    id,
    name,
    category,
    thumbnail: `/fx/${base}.jpg`,
    previewUrl: `/fx/${base}.${ext}`,
    duration,
    isPremium,
    parameters: [{ name: paramName, type: 'number', default: def, min, max }],
    tags,
    usageCount,
  };
}

function clone(effect: Effect): Effect {
  return {
    ...effect,
    parameters: effect.parameters.map((p) => ({
      ...p,
      options: p.options ? [...p.options] : undefined,
    })),
    tags: [...effect.tags],
  };
}

export class EffectsService {
  private readonly catalog: Effect[] = CATALOG;

  listEffects(options: ListEffectsOptions = {}): Effect[] {
    let results = this.catalog;

    if (options.category) {
      results = results.filter((e) => e.category === options.category);
    }
    if (options.premiumOnly) {
      results = results.filter((e) => e.isPremium);
    }
    if (options.freeOnly) {
      results = results.filter((e) => !e.isPremium);
    }
    const q = options.search?.trim().toLowerCase();
    if (q) {
      results = results.filter(
        (e) => e.name.toLowerCase().includes(q) || e.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    return results.map(clone);
  }

  getEffect(id: string): Effect {
    const found = this.catalog.find((e) => e.id === id);
    if (!found) {
      throw new EffectNotFoundError(id);
    }
    return clone(found);
  }

  getCategories(): { id: EffectCategory; count: number }[] {
    return EFFECT_CATEGORIES.map((id) => ({
      id,
      count: this.catalog.filter((e) => e.category === id).length,
    }));
  }
}
