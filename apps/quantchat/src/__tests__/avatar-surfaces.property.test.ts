// ============================================================================
// Property test — Avatar renders on all defined surfaces
// Spec: quantchat-mega-upgrade, Task 5.9
//
//   Property 12 — avatar renders on all defined surfaces
//
// The surface framing logic in AlienAvatar.tsx is React-only, so a pure helper
// `resolveAvatarSurfaceProps(surface, avatar)` extracts the surface-resolution
// logic (see src/components/avatar/resolveAvatarSurfaceProps.ts). This test
// asserts that for every AvatarSurface the helper resolves valid render props
// with a non-empty image source — i.e. the avatar renders on every surface.
//
// Convention: fast-check is NOT a quantchat dependency. This follows the repo's
// seeded deterministic mulberry32 RNG loop convention (>=100 samples).
// ============================================================================

import { describe, it, expect } from 'vitest';
import type { AlienStyle, UserAvatar } from '../types/avatar';
import { ALIEN_STYLES } from '../types/avatar';
import {
  AVATAR_SURFACES,
  DEFAULT_AVATAR_FALLBACK,
  resolveAvatarSurfaceProps,
} from '../components/avatar/resolveAvatarSurfaceProps';

// Deterministic seeded RNG (mulberry32) — mirrors the repo PBT convention.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLES = 120; // >= 100 cases

function randomAvatar(rand: () => number, idx: number): UserAvatar {
  const style: AlienStyle = ALIEN_STYLES[Math.floor(rand() * ALIEN_STYLES.length)]!;
  const url = `data:image/svg+xml;base64,QVZBVEFS${idx}-${Math.floor(rand() * 1e9)}`;
  return {
    userId: `user-${idx}`,
    style,
    imageUrl: url,
    thumbnailUrl: url,
  };
}

// Feature: quantchat-mega-upgrade, Property 12: avatar renders on all defined surfaces
// **Validates: Requirements 5.5**
describe('Property 12: avatar renders on all defined surfaces', () => {
  it('exposes exactly the 6 defined surfaces', () => {
    expect([...AVATAR_SURFACES].sort()).toEqual(
      [
        'chat_bubble',
        'friend_list',
        'map_pin',
        'profile_header',
        'reaction_animation',
        'story_ring',
      ].sort(),
    );
  });

  it('resolves valid render props (non-empty image src) for every surface across >=100 random avatars', () => {
    const rand = mulberry32(0x4156_3132); // "AV12"
    let surfacesExercised = new Set<string>();

    for (let s = 0; s < SAMPLES; s += 1) {
      const avatar = randomAvatar(rand, s);

      for (const surface of AVATAR_SURFACES) {
        const props = resolveAvatarSurfaceProps(surface, avatar, {
          hasUnviewedStory: rand() > 0.5,
          isOnline: rand() > 0.5,
        });
        surfacesExercised.add(surface);

        // The user's avatar image is rendered on this surface.
        expect(props.src).toBe(avatar.imageUrl);
        expect(props.src.length).toBeGreaterThan(0);

        // Framing classes are always present so the surface renders a frame.
        expect(props.wrapperClass.length).toBeGreaterThan(0);
        expect(props.imageClass.length).toBeGreaterThan(0);
        expect(props.surface).toBe(surface);
      }
    }

    // Every defined surface was exercised.
    expect([...surfacesExercised].sort()).toEqual([...AVATAR_SURFACES].sort());
  });

  it('falls back to a non-empty neutral image when the user has no avatar (every surface)', () => {
    for (const surface of AVATAR_SURFACES) {
      const props = resolveAvatarSurfaceProps(surface, null);
      expect(props.src).toBe(DEFAULT_AVATAR_FALLBACK);
      expect(props.src.length).toBeGreaterThan(0);
      expect(props.wrapperClass.length).toBeGreaterThan(0);
      expect(props.imageClass.length).toBeGreaterThan(0);
    }
  });

  it('activates the correct surface-specific decoration for each surface', () => {
    const avatar = randomAvatar(mulberry32(1), 1);
    expect(resolveAvatarSurfaceProps('reaction_animation', avatar).isReaction).toBe(true);
    expect(
      resolveAvatarSurfaceProps('story_ring', avatar, { hasUnviewedStory: true }).showFomoRing,
    ).toBe(true);
    expect(resolveAvatarSurfaceProps('map_pin', avatar).showPinTail).toBe(true);
    expect(resolveAvatarSurfaceProps('friend_list', avatar, { isOnline: true }).showOnlineDot).toBe(
      true,
    );
  });
});
