'use client';
// ============================================================================
// @quant/shared-ui - AlienAvatar (now the Bubble Intelligence avatar)
// ============================================================================
//
// Historical name kept deliberately: `AlienAvatar` is exported from the
// package index and imported by QuantSidekick and app surfaces across the
// ecosystem, so the identifier survives while the *character* changes. The
// green alien (helmet, antennae, SVG) retired in favour of the liquid amber
// bubble — one body, one satellite bead, thirty-five meaningful states —
// painted on canvas in `BubbleAvatar.tsx`.
//
// This file is now the compatibility seam: same export name, same props, same
// `data-testid` (via BubbleAvatar) and the same five-status union the
// QuantSidekick provider speaks. New code should import `BubbleAvatar` and the
// full 35-state sheet; existing call sites keep compiling and rendering
// unchanged — they simply wake up as the new character.

import React from 'react';
import {
  BubbleAvatar,
  STATUS_TO_BUBBLE,
  type QuantSidekickStatus as BubbleStatus,
} from './BubbleAvatar';

/** The five QuantSidekick motion statuses, unchanged from the alien era. */
export type QuantSidekickStatus = BubbleStatus;

export interface AlienAvatarProps {
  /** Current motion state the avatar reflects. */
  state?: QuantSidekickStatus;
  /** Rendered square size in px. */
  size?: number;
  /** Accessible label override; a state-aware default is used otherwise. */
  label?: string;
  className?: string;
}

/**
 * The QuantAI presence for every surface that used to mount the alien.
 * Pure delegation — state mapping (`speaking` → the explaining face, `acting`
 * → the working face) lives in {@link STATUS_TO_BUBBLE} inside BubbleAvatar.
 */
export const AlienAvatar: React.FC<AlienAvatarProps> = (props) => <BubbleAvatar {...props} />;

AlienAvatar.displayName = 'AlienAvatar';
