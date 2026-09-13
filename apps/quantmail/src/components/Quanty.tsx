'use client';
// ============================================================================
// Quanty — now Bubble Intelligence.
// ============================================================================
//
// What this file was: a 1,600-line canvas painter of an obsidian LED-face
// robot — competent, data-driven (35 faces in `lib/quanty/faces.ts`), and the
// wrong character. The brief replaced it: the family mascot is the **liquid
// amber bubble** — one glowing droplet, one satellite bead, thirty-five
// meaningful states — painted once, in `@quant/shared-ui`, and mounted by
// QuantSidekick in every app. QuantMail's mascot now *is* that character; two
// painters for one mascot is how the faces drift apart.
//
// What survives, unchanged:
//   - `QuantyProps` — every call site keeps its exact JSX.
//   - `QuantyExpression` — the product's event vocabulary, still defined in
//     `lib/quanty/faces.ts` and driven by `lib/quanty/reactions.ts` (the
//     `quantyReact` bus + `useQuantyMood`). Product events still say
//     `mail:sent`, `ai:thinking`; this adapter maps each vocabulary face onto
//     the bubble state that carries the same meaning.
//   - `figure`, `bob`, `title`, `className` — accepted. `figure`/`bob` are
//     honoured as far as the character allows (the bubble has no badge/full
//     split; its breathing is inherent) so old call sites compile and read
//     correctly without per-site edits.
//
// The accessible name keeps the old contract: `${title} — ${state words}`,
// because `role="img"` is the only channel a non-sighted user has for the
// state a sighted user reads off the face.

import { BubbleAvatar } from '@quant/shared-ui';
import type { BubbleState } from '@quant/shared-ui';
import type { QuantyExpression } from '../lib/quanty/faces';

export type { QuantyExpression };

export interface QuantyProps {
  expression?: QuantyExpression;
  /** Rendered edge in px. */
  size?: number;
  /** Accepted for call-site compatibility; the bubble always breathes. */
  bob?: boolean;
  /** Accepted for call-site compatibility; the bubble is one character. */
  figure?: 'auto' | 'badge' | 'full';
  className?: string;
  title?: string;
}

/**
 * The product's face vocabulary → the bubble's sheet.
 *
 * Group by meaning, not by shape: `sorry` and `sad` and `cry` all land on the
 * bubble's error face because the bubble says "something's wrong" one way —
 * with a downturned mouth and worry brows — no matter which product word
 * triggered it. The vocabulary has outgrown the bubble's sheet (the robot
 * sheet grew snake_case workflow faces that the bubble expresses through its
 * chips and rings), so workflow faces collapse onto the state whose *meaning*
 * they carry; a trigger never blanks the mascot.
 */
const FACE_TO_BUBBLE: Record<QuantyExpression, BubbleState> = {
  // resting and content
  idle: 'idle',
  calm: 'recognize',
  happy: 'recognize',
  grateful: 'recognize',
  joy: 'success',
  love: 'recognize',
  proud: 'improving',
  wink: 'recognize',
  greeting: 'wakeUp',
  relieved: 'goodbye',
  // working
  thinking: 'thinking',
  focused: 'thinkingDeep',
  working: 'working',
  listening: 'listening',
  curious: 'lookAround',
  determined: 'refactoring',
  // surprise, escalating
  surprised: 'wakeUp',
  shock: 'ideaSpark',
  wow: 'ideaSpark',
  alarm: 'error',
  // unsure
  confused: 'needInfo',
  nervous: 'rethinking',
  worried: 'rethinking',
  // low energy
  bored: 'idle',
  sleepy: 'goodbye',
  // sorrow / displeasure — the bubble reports trouble, it does not sulk
  sad: 'error',
  sorry: 'error',
  cry: 'error',
  annoyed: 'rethinking',
  angry: 'error',
  // outcomes
  success: 'success',
  celebrate: 'celebration',
  dizzy: 'syncing',
  error: 'error',
  offline: 'goodbye',
  // ---- robot-sheet workflow faces (snake_case), mapped by meaning ----
  wake_up: 'wakeUp',
  look_around: 'lookAround',
  recognize_you: 'recognize',
  thinking_deep: 'thinkingDeep',
  idea_spark: 'ideaSpark',
  understanding: 'understanding',
  reading: 'reading',
  analyzing: 'analyzing',
  coding: 'coding',
  refactoring: 'refactoring',
  debugging: 'debugging',
  fixing: 'fixing',
  explaining: 'explaining',
  planning: 'planning',
  organizing: 'organizing',
  creating: 'creating',
  improving: 'improving',
  suggesting: 'suggesting',
  multiple_options: 'options',
  almost_done: 'almostDone',
  completed: 'completed',
  thinking_again: 'rethinking',
  need_more_info: 'needInfo',
  typing: 'typing',
  searching: 'searching',
  syncing: 'syncing',
  saving: 'saving',
  celebration: 'celebration',
  goodbye: 'goodbye',
};

export function Quanty({
  expression = 'idle',
  size = 32,
  bob = false,
  figure = 'auto',
  className = '',
  title = 'Quanty',
}: QuantyProps) {
  // `bob`/`figure` are read (not silently dropped) so `noUnusedParameters`
  // stays clean and the call-site contract is documented in code, not just in
  // comments: the bubble breathes by itself and has no badge/full split.
  void bob;
  void figure;

  const bubble = FACE_TO_BUBBLE[expression] ?? 'idle';

  return (
    <BubbleAvatar
      state={bubble}
      size={size}
      label={title + ' — ' + bubble.replace(/([A-Z])/g, ' $1').toLowerCase()}
      title={title}
      className={className}
    />
  );
}

export default Quanty;
