/**
 * AR lens catalog — pure data, no React.
 *
 * Extracted from `ARLensCarousel.tsx` so the lens configurations and type can
 * be imported by non-React modules (e.g. `LensRenderer.ts`) and by unit/property
 * tests without pulling a `.tsx` (JSX) module into the import graph.
 *
 * `ARLensCarousel.tsx` re-exports these for backwards compatibility.
 */

/**
 * AR Lens configuration type.
 * Each lens has an id, name, display info, and rendering metadata.
 */
export interface ARLensConfig {
  id: string;
  name: string;
  type: 'face_distortion' | 'color_overlay' | 'particle' | 'alien_theme' | 'beauty';
  emoji: string;
  color: string;
  requiresFaceTracking: boolean;
  fallbackPosition: { x: number; y: number; scale: number };
}

/**
 * The 7 built-in AR lenses available in QuantChat.
 */
export const AR_LENSES: ARLensConfig[] = [
  {
    id: 'face-warp',
    name: 'Face Warp',
    type: 'face_distortion',
    emoji: '\uD83E\uDD2A',
    color: '#FF6B6B',
    requiresFaceTracking: true,
    fallbackPosition: { x: 0.5, y: 0.4, scale: 0.6 },
  },
  {
    id: 'color-pop',
    name: 'Color Pop',
    type: 'color_overlay',
    emoji: '\uD83C\uDF08',
    color: '#FF9F43',
    requiresFaceTracking: false,
    fallbackPosition: { x: 0.5, y: 0.5, scale: 1.0 },
  },
  {
    id: 'alien-glow',
    name: 'Alien Glow',
    type: 'alien_theme',
    emoji: '\uD83D\uDC7D',
    color: '#2ED573',
    requiresFaceTracking: true,
    fallbackPosition: { x: 0.5, y: 0.4, scale: 0.6 },
  },
  {
    id: 'particle-stars',
    name: 'Particle Stars',
    type: 'particle',
    emoji: '\u2728',
    color: '#FFD700',
    requiresFaceTracking: false,
    fallbackPosition: { x: 0.5, y: 0.5, scale: 1.0 },
  },
  {
    id: 'beauty',
    name: 'Beauty',
    type: 'beauty',
    emoji: '\uD83D\uDC8E',
    color: '#FF6EB4',
    requiresFaceTracking: true,
    fallbackPosition: { x: 0.5, y: 0.4, scale: 0.6 },
  },
  {
    id: 'neon-outline',
    name: 'Neon Outline',
    type: 'color_overlay',
    emoji: '\uD83D\uDD25',
    color: '#00D2FF',
    requiresFaceTracking: true,
    fallbackPosition: { x: 0.5, y: 0.4, scale: 0.6 },
  },
  {
    id: 'cybernetic-mask',
    name: 'Cybernetic Mask',
    type: 'alien_theme',
    emoji: '\uD83E\uDD16',
    color: '#A855F7',
    requiresFaceTracking: true,
    fallbackPosition: { x: 0.5, y: 0.4, scale: 0.6 },
  },
];
