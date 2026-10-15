// ============================================================================
// Custom emoji — QC-F-336 Slice 1 (first-party pack + inline token render)
// ============================================================================
//
// Before this module, QuantChat had NO custom/animated emoji system at all:
// expression was stock unicode only, and the reaction picker offered just 6
// hardcoded unicode emoji. Slice 1 adds exactly one first-party pack
// ("Quant Originals", assets drawn for this build — see
// public/emoji/quant/SOURCE.md) and an honest inline token that travels
// inside ordinary message content:
//
//     :ce:<pack>:<name>:        e.g.  :ce:quant:wave:
//
// Design rules (brief specialist-qc-f-336-buildprep.md, closed decisions):
//  - The token is plain text inside `content`. No new message type, no
//    metadata side-channel, no backend/schema change — the server never
//    parses tokens; rendering happens only on the client, on the exact
//    display string the client already legitimately holds (so no E2EE
//    bypass is created by construction).
//  - The parser is a pure function: no React, no DOM, no network, and it
//    NEVER builds an asset URL out of token pieces — a segment is produced
//    only when the (pack, name) pair resolves in the manifest below.
//  - Unknown / malformed / escaped tokens render as the literal text the
//    sender typed — no broken image, no placeholder, no fake label. The
//    same literal text is what older clients without the pack will show.
//  - A bare shortcode (`:wave:` without the `ce:` namespace) is NEVER
//    parsed, so ordinary shortcode-style writing and the (dead, QC-F-310)
//    sticker shortcode grammar can never be hijacked by this parser.

export interface CustomEmojiEntry {
  name: string;
  assetUrl: string;
  animated: boolean;
  /** Human-readable description — screen-reader text and honest fallback. */
  alt: string;
}

export interface CustomEmojiPack {
  id: string;
  name: string;
  entries: CustomEmojiEntry[];
}

export const CUSTOM_EMOJI_PACKS: CustomEmojiPack[] = [
  {
    id: 'quant',
    name: 'Quant Originals',
    entries: [
      {
        name: 'wave',
        assetUrl: '/emoji/quant/wave.webp',
        animated: true,
        alt: 'Quant Originals wave — expanding emerald ripple rings',
      },
      {
        name: 'pulse-heart',
        assetUrl: '/emoji/quant/pulse-heart.webp',
        animated: true,
        alt: 'Quant Originals pulse heart — a rose heart that swells and settles',
      },
      {
        name: 'star-burst',
        assetUrl: '/emoji/quant/star-burst.webp',
        animated: true,
        alt: 'Quant Originals star burst — a gold eight-point star, slowly turning',
      },
      {
        name: 'flame',
        assetUrl: '/emoji/quant/flame.webp',
        animated: true,
        alt: 'Quant Originals flame — an orange and gold flame flickering',
      },
      {
        name: 'smile-sun',
        assetUrl: '/emoji/quant/smile-sun.webp',
        animated: false,
        alt: 'Quant Originals smile sun — a smiling gold sun with short rays',
      },
      {
        name: 'moon-star',
        assetUrl: '/emoji/quant/moon-star.webp',
        animated: false,
        alt: 'Quant Originals moon star — a gold crescent moon with a violet star',
      },
      {
        name: 'rocket',
        assetUrl: '/emoji/quant/rocket.webp',
        animated: false,
        alt: 'Quant Originals rocket — a white and emerald rocket with an orange flame',
      },
      {
        name: 'gem',
        assetUrl: '/emoji/quant/gem.webp',
        animated: false,
        alt: 'Quant Originals gem — a faceted emerald gemstone',
      },
      {
        name: 'bolt',
        assetUrl: '/emoji/quant/bolt.webp',
        animated: false,
        alt: 'Quant Originals bolt — a gold lightning bolt',
      },
      {
        name: 'confetti-pop',
        assetUrl: '/emoji/quant/confetti-pop.webp',
        animated: true,
        alt: 'Quant Originals confetti pop — colourful confetti bursting outward',
      },
      {
        name: 'music-note',
        assetUrl: '/emoji/quant/music-note.webp',
        animated: false,
        alt: 'Quant Originals music note — a violet double music note',
      },
      {
        name: 'check-badge',
        assetUrl: '/emoji/quant/check-badge.webp',
        animated: false,
        alt: 'Quant Originals check badge — a white tick on an emerald badge',
      },
    ],
  },
];

const entryIndex = new Map<string, CustomEmojiEntry>();
for (const pack of CUSTOM_EMOJI_PACKS) {
  for (const entry of pack.entries) {
    entryIndex.set(`${pack.id}:${entry.name}`, entry);
  }
}

/** Manifest-only lookup. Never derives an asset URL from raw token text. */
export function resolveCustomEmoji(
  pack: string,
  name: string,
): CustomEmojiEntry | undefined {
  return entryIndex.get(`${pack}:${name}`);
}

/** The one place a token string is built — pickers use this, never hand-join. */
export function customEmojiToken(pack: string, name: string): string {
  return `:ce:${pack}:${name}:`;
}

export type CustomEmojiSegment =
  | { type: 'text'; text: string }
  | {
      type: 'custom-emoji';
      pack: string;
      name: string;
      assetUrl: string;
      alt: string;
      raw: string;
    };

/** Per-message render cap — beyond this, tokens stay literal text. */
export const MAX_CUSTOM_EMOJI_PER_MESSAGE = 32;

const NAME_GRAMMAR = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_PACK_LENGTH = 24;
const MAX_NAME_LENGTH = 32;
// Characters that may legitimately follow a token: whitespace, end of
// string, or sentence punctuation. Anything letter/digit/`/`/`:`-adjacent
// (e.g. inside a URL or a word) means the colon run was never a token.
const TRAILING_PUNCTUATION = new Set([
  '.',
  ',',
  '!',
  '?',
  ';',
  "'",
  '"',
  ')',
  ']',
  '}',
  '>',
]);

interface TokenMatch {
  raw: string;
  pack: string;
  name: string;
  end: number; // index just past the closing colon
}

/**
 * Try to read a `:ce:<pack>:<name>:` token starting exactly at `start`
 * (content[start] must be ':'). Grammar only — manifest resolution is the
 * caller's step. Returns null for anything malformed.
 */
function matchTokenAt(content: string, start: number): TokenMatch | null {
  if (!content.startsWith(':ce:', start)) return null;
  const packStart = start + 4;
  const packEnd = content.indexOf(':', packStart);
  if (packEnd === -1) return null;
  const nameEnd = content.indexOf(':', packEnd + 1);
  if (nameEnd === -1) return null;
  const pack = content.slice(packStart, packEnd);
  const name = content.slice(packEnd + 1, nameEnd);
  if (pack.length === 0 || pack.length > MAX_PACK_LENGTH) return null;
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return null;
  if (!NAME_GRAMMAR.test(pack) || !NAME_GRAMMAR.test(name)) return null;
  return { raw: content.slice(start, nameEnd + 1), pack, name, end: nameEnd + 1 };
}

function hasTokenBoundaryBefore(content: string, start: number): boolean {
  return start === 0 || /\s/.test(content[start - 1]);
}

function hasTokenBoundaryAfter(content: string, end: number): boolean {
  if (end >= content.length) return true;
  const ch = content[end];
  return /\s/.test(ch) || TRAILING_PUNCTUATION.has(ch);
}

/**
 * Split message content into text and custom-emoji segments, in order.
 * Anything that is not a manifest-resolved token at a word boundary is
 * preserved character-for-character as text.
 */
export function parseCustomEmoji(content: string): CustomEmojiSegment[] {
  // Ciphertext envelopes are never token-scanned: the parser only ever runs
  // on display text, and an encrypted payload must pass through untouched.
  if (content.startsWith('{"ciphertext"')) {
    return [{ type: 'text', text: content }];
  }

  const segments: CustomEmojiSegment[] = [];
  let textBuffer = '';
  let rendered = 0;
  let i = 0;

  const flushText = () => {
    if (textBuffer.length > 0) {
      segments.push({ type: 'text', text: textBuffer });
      textBuffer = '';
    }
  };

  while (i < content.length) {
    const ch = content[i];

    // Escape: a backslash immediately before a token makes the token
    // literal; the backslash itself is consumed. A backslash anywhere
    // else is ordinary text and passes through untouched.
    if (ch === '\\') {
      const escaped = matchTokenAt(content, i + 1);
      if (escaped) {
        textBuffer += escaped.raw;
        i = escaped.end;
        continue;
      }
      textBuffer += ch;
      i += 1;
      continue;
    }

    if (ch === ':' && hasTokenBoundaryBefore(content, i)) {
      const match = matchTokenAt(content, i);
      if (match && hasTokenBoundaryAfter(content, match.end)) {
        const entry =
          rendered < MAX_CUSTOM_EMOJI_PER_MESSAGE
            ? resolveCustomEmoji(match.pack, match.name)
            : undefined;
        if (entry) {
          flushText();
          segments.push({
            type: 'custom-emoji',
            pack: match.pack,
            name: match.name,
            assetUrl: entry.assetUrl,
            alt: entry.alt,
            raw: match.raw,
          });
          rendered += 1;
          i = match.end;
          continue;
        }
      }
      // Grammar-shaped but unknown / over-cap / badly bounded: literal.
      textBuffer += ch;
      i += 1;
      continue;
    }

    textBuffer += ch;
    i += 1;
  }

  flushText();
  return segments;
}
