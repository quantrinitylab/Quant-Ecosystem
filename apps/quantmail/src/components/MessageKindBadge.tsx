'use client';

import { IconChat, IconMail } from './icons';
import type { MessageKind } from '../types';
import type { ThreadKindMix } from '../lib/threading';

/**
 * The mark that says whether a message is a letter or a line typed into the
 * conversation.
 *
 * One component for both the inbox row and the thread view, because the whole
 * point of the mark is that the same message reads the same way wherever you meet
 * it. The two palettes are the design system's own: a letter takes the brand-soft
 * fill it already uses for anything the user acted on deliberately, and a chat
 * message takes the neutral card surface, so the busier of the two kinds is the
 * quieter one on screen.
 */

const TONE: Record<MessageKind, { label: string; className: string }> = {
  mail: {
    label: 'Mail',
    className: 'bg-[#2B1A11] border-[#5C3016] text-[#FF8C42]',
  },
  chat: {
    label: 'Chat',
    className: 'bg-[#16181D] border-[#282C35] text-[#A1A4AC]',
  },
};

export interface MessageKindBadgeProps {
  kind: MessageKind;
  /** Hide the word and keep the glyph, for the tightest rows. */
  compact?: boolean;
  className?: string;
}

export function MessageKindBadge({ kind, compact = false, className = '' }: MessageKindBadgeProps) {
  const tone = TONE[kind];
  const Glyph = kind === 'chat' ? IconChat : IconMail;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-tight ${tone.className} ${className}`}
      // The word is the label when it is shown, so the glyph is decorative. When it
      // is hidden the title carries it, and the text stays in the tree for a screen
      // reader rather than being dropped along with the pixels.
      title={compact ? `${tone.label} message` : undefined}
    >
      <Glyph size={compact ? 11 : 10} aria-hidden="true" />
      <span className={compact ? 'sr-only' : undefined}>{tone.label}</span>
    </span>
  );
}

export interface ThreadKindBadgeProps {
  mix: ThreadKindMix;
  className?: string;
}

/**
 * The mark for a whole conversation.
 *
 * A thread holding both kinds gets both glyphs under one border rather than two
 * separate pills — a conversation that is *both* is one fact about it, not two,
 * and two pills in a row that already carries a count, a priority and a timestamp
 * is where a row stops being scannable.
 */
export function ThreadKindBadge({ mix, className = '' }: ThreadKindBadgeProps) {
  if (mix !== 'mixed') return <MessageKindBadge kind={mix} compact className={className} />;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded border border-[#5C3016] bg-[#2B1A11] px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-[#FF8C42] ${className}`}
      title="Mail and chat in this conversation"
    >
      <IconMail size={11} aria-hidden="true" />
      <IconChat size={11} aria-hidden="true" />
      <span className="sr-only">Mail and chat</span>
    </span>
  );
}
