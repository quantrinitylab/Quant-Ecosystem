// ============================================================================
// QuantChat - AlienAvatar (reusable avatar component)
//
// Task 5.5: a single reusable component that renders a user's selected alien
// avatar. Reads the avatar via the shared useAvatar(userId) hook so it stays in
// sync across the whole app.
//
// Task 5.6: usable on every surface via the `surface` prop —
//   chat_bubble | profile_header | story_ring | reaction_animation |
//   friend_list | map_pin — each surface applies its own framing (ring, pin
//   tail, square crop, etc.) while sharing the same image source.
// ============================================================================
'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useAvatar } from '../../hooks/useAvatar';
import type { AvatarSurface, ReactionEmotion } from '../../types/avatar';
import { AvatarReaction } from './AvatarReaction';

export interface AlienAvatarProps {
  /** User whose avatar to display. */
  userId: string;
  /** Pixel diameter of the avatar. Defaults to 48. */
  size?: number;
  /** Surface the avatar is rendered on — adjusts framing. Defaults to chat_bubble. */
  surface?: AvatarSurface;
  /** When set, plays the matching reaction animation (used on reaction_animation surface). */
  emotion?: ReactionEmotion;
  /** Show an unviewed-story FOMO ring (story_ring surface). */
  hasUnviewedStory?: boolean;
  /** Online indicator dot (friend_list surface). */
  isOnline?: boolean;
  /** Fallback image used while loading or when the user has no avatar yet. */
  fallbackUrl?: string;
  /** Accessible label override. */
  alt?: string;
  className?: string;
  onClick?: () => void;
}

const DEFAULT_FALLBACK =
  'data:image/svg+xml;base64,' +
  // Neutral alien silhouette so surfaces never render an empty box.
  btoaSafe(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><defs><radialGradient id="f" cx="50%" cy="40%" r="75%"><stop offset="0%" stop-color="#2a2150"/><stop offset="100%" stop-color="#0b0820"/></radialGradient></defs><rect width="256" height="256" fill="url(#f)"/><path d="M128 44 C72 52 66 150 128 216 C190 150 184 52 128 44 Z" fill="#5b4b9a" opacity="0.8"/><ellipse cx="104" cy="118" rx="12" ry="18" fill="#b9f5ff"/><ellipse cx="152" cy="118" rx="12" ry="18" fill="#b9f5ff"/></svg>`,
  );

/** SSR-safe base64 for the inline fallback SVG (btoa is browser-only). */
function btoaSafe(input: string): string {
  if (typeof btoa === 'function') return btoa(input);
  // Node/SSR path
  return Buffer.from(input, 'utf-8').toString('base64');
}

/** Per-surface frame styling. */
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

export function AlienAvatar({
  userId,
  size = 48,
  surface = 'chat_bubble',
  emotion,
  hasUnviewedStory = false,
  isOnline,
  fallbackUrl,
  alt,
  className = '',
  onClick,
}: AlienAvatarProps) {
  const { avatar, isLoading } = useAvatar(userId);
  const src = avatar?.imageUrl ?? fallbackUrl ?? DEFAULT_FALLBACK;
  const frame = surfaceClasses(surface);
  const label = alt ?? `${userId} alien avatar`;

  const showFomoRing = surface === 'story_ring' && hasUnviewedStory;

  const img = (
    <img
      src={src}
      alt={label}
      width={size}
      height={size}
      draggable={false}
      className={`block h-full w-full object-cover ${frame.image} ${
        isLoading ? 'animate-pulse opacity-70' : ''
      }`}
    />
  );

  // Reaction surface delegates the motion to AvatarReaction (Task 5.7).
  const content =
    surface === 'reaction_animation' && emotion ? (
      <AvatarReaction emotion={emotion} size={size}>
        {img}
      </AvatarReaction>
    ) : (
      img
    );

  return (
    <motion.div
      role="img"
      aria-label={label}
      onClick={onClick}
      whileTap={onClick ? { scale: 0.95 } : undefined}
      className={`relative inline-flex items-center justify-center overflow-visible ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
      style={{ width: size, height: size }}
    >
      {/* FOMO gradient ring for unviewed stories */}
      {showFomoRing && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-gradient-to-tr from-fuchsia-500 via-cyan-400 to-purple-500"
        />
      )}
      <div
        className={`relative h-full w-full overflow-hidden ${frame.wrapper} ${
          showFomoRing ? 'bg-black' : ''
        }`}
        style={showFomoRing ? { margin: 3, width: size - 6, height: size - 6 } : undefined}
      >
        {content}
      </div>

      {/* Map pin tail */}
      {surface === 'map_pin' && (
        <span
          aria-hidden
          className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-white"
        />
      )}

      {/* Online dot for friend list */}
      {surface === 'friend_list' && typeof isOnline === 'boolean' && (
        <span
          aria-hidden
          className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${
            isOnline ? 'bg-green-400' : 'bg-gray-400'
          }`}
        />
      )}
    </motion.div>
  );
}

export default AlienAvatar;
