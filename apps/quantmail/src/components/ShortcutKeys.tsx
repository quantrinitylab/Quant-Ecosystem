/**
 * One binding, rendered as `kbd` pills.
 *
 * Sequences read as `G` then `I` rather than a single opaque "GI", because they
 * are pressed in turn. Extracted from the `?` sheet so Settings › Keyboard can
 * render the *same* pills from the *same* binding strings the engine matches
 * against, instead of the hand-typed `'Ctrl/Cmd + K'` strings it used to carry.
 *
 * The `↑`/`↓` glyphs come out of `chords.ts`'s `SYMBOL_LABELS`, so the arrow
 * reading the old table spelled by hand survives the table's deletion.
 */

import { chordToLabelParts, parseSequence } from '../lib/keyboard/chords';

interface ShortcutKeysProps {
  keys: string | string[];
  /**
   * Render every alias, not just the primary binding.
   *
   * The sheet is a dense three-column modal and shows one binding per row —
   * aliases would double its length without saying anything new. A settings page
   * has the room, and `j` / `↓` being the same command is worth knowing there.
   */
  aliases?: boolean;
}

export function ShortcutKeys({ keys, aliases = false }: ShortcutKeysProps) {
  const list = Array.isArray(keys) ? keys : [keys];
  const shown = aliases ? list : list.slice(0, 1);

  return (
    <>
      {shown.map((binding, bindingIndex) => (
        <span key={`${binding}-${bindingIndex}`} className="inline-flex items-center gap-1">
          {bindingIndex > 0 && (
            <span aria-hidden="true" className="px-0.5 text-[10px] text-[#6B6E76]">
              /
            </span>
          )}
          {parseSequence(binding).map((chord, chordIndex) => (
            <span key={`${chord}-${chordIndex}`} className="inline-flex items-center gap-1">
              {chordIndex > 0 && <span className="px-0.5 text-[10px] text-[#A1A4AC]">then</span>}
              {chordToLabelParts(chord).map((part, partIndex) => (
                <kbd key={`${part}-${partIndex}`}>{part}</kbd>
              ))}
            </span>
          ))}
        </span>
      ))}
    </>
  );
}
