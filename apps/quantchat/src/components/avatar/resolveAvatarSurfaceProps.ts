// ============================================================================
// QuantChat - resolveAvatarSurfaceProps (Task 5.6 / Property 12)
//
// Pure, React-free helper that resolves the render props for an AlienAvatar on
// any defined surface. AlienAvatar.tsx keeps its `surfaceClasses` logic private
// and tied to JSX; this helper extracts the surface-resolution logic into a
// testable pure function so Property 12 (avatar renders on all defined
// surfaces) can be asserted without rendering React.
//
// For every AvatarSurface value the helper returns:
//   - a non-empty `src` (the user's avatar image, or a neutral fallback so a
//     surface never renders an empty box)
//   - non-empty wrapper/image framing classes
//   - surface-specific decoration flags (FOMO ring, online dot, pin tail, …)
// ============================================================================

import type { AvatarSurface, UserAvatar } from '../../types/avatar';

/** All avatar surfaces the app renders to (Requirement 5.5, Task 5.6). */
export const AVATAR_SURFACES: readonly AvatarSurface[] = [
  'chat_bubble',
  'profile_header',
  'story_ring',
  'reaction_animation',
  'friend_list',
  'map_pin',
] as const;

/** Neutral alien silhouette used when a user has no avatar yet. */
export const DEFAULT_AVATAR_FALLBACK =
  'data:image/svg+xml;base64,' +
  // SSR-safe base64 (no btoa dependency).
  toBase64(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><defs><radialGradient id="f" cx="50%" cy="40%" r="75%"><stop offset="0%" stop-color="#2a2150"/><stop offset="100%" stop-color="#0b0820"/></radialGradient></defs><rect width="256" height="256" fill="url(#f)"/><path d="M128 44 C72 52 66 150 128 216 C190 150 184 52 128 44 Z" fill="#5b4b9a" opacity="0.8"/><ellipse cx="104" cy="118" rx="12" ry="18" fill="#b9f5ff"/><ellipse cx="152" cy="118" rx="12" ry="18" fill="#b9f5ff"/></svg>`,
  );

function toBase64(input: string): string {
  if (typeof btoa === 'function') return btoa(input);
  return Buffer.from(input, 'utf-8').toString('base64');
}

export interface ResolveAvatarSurfaceOptions {
  /** Override fallback image used when the user has no avatar. */
  fallbackUrl?: string;
  /** Whether the user has an unviewed story (story_ring decoration). */
  hasUnviewedStory?: boolean;
  /** Online indicator (friend_list decoration). */
  isOnline?: boolean;
}

export interface ResolvedAvatarSurfaceProps {
  surface: AvatarSurface;
  /** Resolved image source — always a non-empty string. */
  src: string;
  /** Framing classes for the wrapper element — always non-empty. */
  wrapperClass: string;
  /** Framing classes for the <img> element — always non-empty. */
  imageClass: string;
  /** Surface plays a reaction animation. */
  isReaction: boolean;
  /** Render the unviewed-story FOMO ring. */
  showFomoRing: boolean;
  /** Render the friend-list online dot. */
  showOnlineDot: boolean;
  /** Render the map-pin tail. */
  showPinTail: boolean;
}

/** Per-surface frame styling (mirrors AlienAvatar.surfaceClasses). */
function surfaceClasses(surface: AvatarSurface): { wrapper: string; image: string } {
  switch (surface) {
    case 'story_ring':
      return { wrapper: 'rounded-full p-[3px]', image: 'rounded-full' };
    case 'map_pin':
      return {
        wrapper: 'rounded-full ring-2 ring-white shadow-lg drop-shadow-md',
        image: 'rounded-full',
      };
    case 'profile_header':
      return { wrapper: 'rounded-2xl ring-2 ring-purple-400/40', image: 'rounded-2xl' };
    case 'friend_list':
      return { wrapper: 'rounded-full', image: 'rounded-full' };
    case 'reaction_animation':
      return { wrapper: 'rounded-full', image: 'rounded-full' };
    case 'chat_bubble':
    default:
      return { wrapper: 'rounded-full', image: 'rounded-full' };
  }
}

/**
 * Resolve the render props for an avatar on a given surface. Pure and
 * deterministic: the same inputs always yield the same props. The returned
 * `src` is guaranteed non-empty so every surface renders an image.
 */
export function resolveAvatarSurfaceProps(
  surface: AvatarSurface,
  avatar: UserAvatar | null | undefined,
  options: ResolveAvatarSurfaceOptions = {},
): ResolvedAvatarSurfaceProps {
  const { fallbackUrl, hasUnviewedStory = false, isOnline } = options;
  const src = avatar?.imageUrl || fallbackUrl || DEFAULT_AVATAR_FALLBACK;
  const frame = surfaceClasses(surface);

  return {
    surface,
    src,
    wrapperClass: frame.wrapper,
    imageClass: frame.image,
    isReaction: surface === 'reaction_animation',
    showFomoRing: surface === 'story_ring' && hasUnviewedStory,
    showOnlineDot: surface === 'friend_list' && typeof isOnline === 'boolean',
    showPinTail: surface === 'map_pin',
  };
}
