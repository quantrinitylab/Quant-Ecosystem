// ============================================================================
// QuantCooks Studio — preset catalogue (Explore home feed data)
//
// The front door is a preset feed, not a blank canvas (spec §1.2). This is a
// TEMPLATE catalogue: original QuantCooks names and plain-language recipes
// from the Phase 2 spec (§1.3, §3.3) — labelled as presets everywhere, never
// presented as user or community content. When the real list_presets /
// list_camera_presets endpoints land (CP-1), this module's data source is
// the one thing that changes; the shapes stay.
// ============================================================================

export type PresetCategory = 'Trending Food Reels' | 'Dish Heroes' | 'Ads' | 'Camera Moves' | 'Seasonal';

export interface StudioPreset {
  id: string;
  /** Original QuantCooks preset name (spec §1.3 / §3.3 vocabulary). */
  name: string;
  /** One line of plain language: what this preset does to the shot. */
  description: string;
  category: PresetCategory;
  /** Credits for a typical run of this preset (spec: cost on the card). */
  typicalCredits: number;
  /** Default ratio the preset opens with. */
  ratio: '16:9' | '1:1' | '9:16';
  /** What the user brings: a dish photo is the usual starting point. */
  needsPhoto: boolean;
}

export const PRESET_CATEGORIES: Array<'All' | PresetCategory> = [
  'All',
  'Trending Food Reels',
  'Dish Heroes',
  'Ads',
  'Camera Moves',
  'Seasonal',
];

export const STUDIO_PRESETS: StudioPreset[] = [
  // Camera moves for food (spec §3.3 — original names on generic move families)
  { id: 'steam-reveal', name: 'Steam Reveal', description: 'A slow push-in as steam lifts off the dish, saving the hero moment for last.', category: 'Dish Heroes', typicalCredits: 9, ratio: '9:16', needsPhoto: true },
  { id: 'cheese-pull-crash-zoom', name: 'Cheese-Pull Crash Zoom', description: 'A fast crash zoom straight into the cheese pull at its stretchiest second.', category: 'Camera Moves', typicalCredits: 10, ratio: '9:16', needsPhoto: true },
  { id: 'thali-top-down-drop', name: 'Thali Top-Down Drop', description: 'The camera settles from above until the whole thali fills the frame, bowl by bowl.', category: 'Camera Moves', typicalCredits: 9, ratio: '1:1', needsPhoto: true },
  { id: 'cake-orbit', name: 'Cake Orbit', description: 'A full, unhurried circle around the cake so every side gets its moment.', category: 'Camera Moves', typicalCredits: 10, ratio: '1:1', needsPhoto: true },
  { id: 'plate-push-in', name: 'Plate Push-In', description: 'A gentle dolly forward that ends on the plated hero, nothing else competing.', category: 'Camera Moves', typicalCredits: 8, ratio: '16:9', needsPhoto: true },
  { id: 'pack-spin', name: 'Pack Spin', description: 'The pack turns on a lazy-Susan spin while the background stays perfectly still.', category: 'Ads', typicalCredits: 8, ratio: '1:1', needsPhoto: true },
  { id: 'buffet-fly-over', name: 'Buffet Fly-Over', description: 'A swooping pass along the whole spread, like a drone drifting over the counter.', category: 'Camera Moves', typicalCredits: 12, ratio: '16:9', needsPhoto: true },
  { id: 'rise-and-bake-timelapse', name: 'Rise & Bake Timelapse', description: 'Minutes of rising and browning compressed into a few satisfying seconds.', category: 'Trending Food Reels', typicalCredits: 11, ratio: '9:16', needsPhoto: true },
  { id: 'home-kitchen-handheld', name: 'Home-Kitchen Handheld', description: 'A warm, slightly unsteady handheld feel — like a friend filming your cooking.', category: 'Trending Food Reels', typicalCredits: 8, ratio: '9:16', needsPhoto: true },
  { id: 'flat-lay-lock', name: 'Flat-Lay Lock', description: 'A locked overhead shot; hands and ingredients move, the frame never does.', category: 'Dish Heroes', typicalCredits: 7, ratio: '1:1', needsPhoto: true },
  { id: 'spread-reveal-pullback', name: 'Spread Reveal Pullback', description: 'Starts tight on one dish, then pulls back to reveal the full table spread.', category: 'Dish Heroes', typicalCredits: 11, ratio: '16:9', needsPhoto: true },
  { id: 'counter-whip', name: 'Counter Whip', description: 'A quick whip pan across the kitchen counter, landing on the finished plate.', category: 'Trending Food Reels', typicalCredits: 9, ratio: '9:16', needsPhoto: true },
  { id: 'sizzle-vertigo', name: 'Sizzle Vertigo', description: 'A dolly-zoom over the sizzler — the dish rushes closer while the room stretches.', category: 'Camera Moves', typicalCredits: 12, ratio: '9:16', needsPhoto: true },
  // One-tap ads and seasonal starters
  { id: 'one-bite-hook', name: 'One Bite Hook', description: 'Opens on the first bite reaction, then rewinds to how the dish was made.', category: 'Ads', typicalCredits: 10, ratio: '9:16', needsPhoto: true },
  { id: 'festival-thali-glow', name: 'Festival Thali Glow', description: 'Warm festive light and a slow reveal made for celebration menus and offers.', category: 'Seasonal', typicalCredits: 10, ratio: '9:16', needsPhoto: true },
];

/** Explore rows, in spec §1.2 order; empty rows are dropped by the filter. */
export const EXPLORE_ROW_TITLES = ['Trending Food Presets', 'Camera Moves for Food', 'One-Tap Ads'] as const;

export function presetsForRow(rowTitle: (typeof EXPLORE_ROW_TITLES)[number]): StudioPreset[] {
  switch (rowTitle) {
    case 'Trending Food Presets':
      return STUDIO_PRESETS.filter((p) => p.category === 'Trending Food Reels' || p.category === 'Seasonal');
    case 'Camera Moves for Food':
      return STUDIO_PRESETS.filter((p) => p.category === 'Camera Moves');
    case 'One-Tap Ads':
      return STUDIO_PRESETS.filter((p) => p.category === 'Ads');
    default:
      return [];
  }
}

export interface PresetFilter {
  query?: string;
  category?: 'All' | PresetCategory;
}

/** Search + category filter over the catalogue (pure; the feed renders this). */
export function filterPresets(presets: StudioPreset[], filter: PresetFilter): StudioPreset[] {
  const query = (filter.query ?? '').trim().toLowerCase();
  return presets.filter((preset) => {
    if (filter.category && filter.category !== 'All' && preset.category !== filter.category) return false;
    if (!query) return true;
    const haystack = `${preset.name} ${preset.description} ${preset.category}`.toLowerCase();
    return query.split(/\s+/).every((word) => haystack.includes(word));
  });
}

export function featuredPreset(presets: StudioPreset[]): StudioPreset | null {
  return presets.find((p) => p.id === 'steam-reveal') ?? presets[0] ?? null;
}
