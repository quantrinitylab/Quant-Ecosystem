'use client';

// ============================================================================
// CustomEmojiText — QC-F-336 Slice 1 renderer
// ============================================================================
//
// Renders message text with first-party custom-emoji tokens
// (`:ce:<pack>:<name>:`) as inline images, via the pure parser in
// lib/custom-emoji.ts. Anything the parser does not resolve stays exactly
// the literal text the sender typed — no placeholder, no broken image.
// Text segments are rendered as ordinary React text (React escaping), never
// as an HTML string.

import React from 'react';
import { parseCustomEmoji } from '../lib/custom-emoji';

export interface CustomEmojiTextProps {
  text: string;
  /**
   * Sizing classes for the inline emoji image. Defaults to the thread
   * size (1.3em, sits on the text line without changing line height);
   * reaction displays pass a 1em size.
   */
  emojiClassName?: string;
}

const DEFAULT_EMOJI_CLASS =
  'inline-block h-[1.3em] w-[1.3em] align-[-0.25em] mx-[0.05em]';

export function CustomEmojiText({ text, emojiClassName }: CustomEmojiTextProps) {
  const segments = parseCustomEmoji(text);
  return (
    <>
      {segments.map((segment, index) =>
        segment.type === 'text' ? (
          <span key={index}>{segment.text}</span>
        ) : (
          <img
            key={index}
            src={segment.assetUrl}
            alt={segment.alt}
            data-custom-emoji={segment.raw}
            className={emojiClassName ?? DEFAULT_EMOJI_CLASS}
            loading="lazy"
          />
        ),
      )}
    </>
  );
}

export default CustomEmojiText;
