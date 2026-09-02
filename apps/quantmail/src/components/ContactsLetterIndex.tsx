'use client';

/**
 * The address book's shape, in the sidebar.
 *
 * Contacts already had a right-edge scrub rail — an iOS-style strip you drag
 * with a thumb, 27 slots wide whether or not a letter has anyone in it. That is
 * the right control for a phone and the wrong one for a mouse: it sits at the
 * far edge of a wide screen, away from the reading column, it asks for a drag
 * where a click would do, and twenty of its twenty-seven targets usually lead
 * nowhere in particular.
 *
 * This is the pointer answer, and it is deliberately not the same control. It
 * lists only the letters that actually have someone under them, so the grid
 * *is* a summary of the address book rather than a fixed alphabet. Clicking a
 * chip scrolls the stream; the chip under the current reading position stays
 * lit, so the index doubles as a position readout.
 */

const CHIP =
  'flex aspect-square items-center justify-center rounded-lg text-[11px] font-bold leading-none tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]';

export interface LetterGroup {
  letter: string;
  count: number;
}

export interface ContactsLetterIndexProps {
  groups: LetterGroup[];
  /** The letter the stream is currently showing, lit in the grid. */
  activeLetter: string | null;
  onJump: (letter: string) => void;
}

export function ContactsLetterIndex({ groups, activeLetter, onJump }: ContactsLetterIndexProps) {
  /*
   * One letter means the whole list is one section, and an index with a single
   * entry is furniture. Nothing to jump between, so nothing to render.
   */
  if (groups.length < 2) return null;

  return (
    <section className="sidebar-group mt-3 border-t border-[var(--quant-border-subtle)] pt-3">
      {/*
       * No `id` on the heading. `AppShell` renders `{sidebar}` twice — once as the
       * pinned rail, once as the overlay drawer — so anything given an id here
       * ships as a duplicate, and nothing needs to reference this one anyway.
       */}
      <h2>Contacts A–Z</h2>
      {/*
       * Four columns under a finger, six under a pointer. Sizing the chip from
       * the column with `aspect-square` is what lets one grid serve both without
       * a second set of size classes — measured, the coarse branch gives 57.6px
       * squares in the 277px drawer and the fine branch 35.4px in the same rail,
       * so the tap target clears 44px on the device that needs it and the
       * pointer grid stays dense.
       */}
      <div className="grid grid-cols-6 gap-1 px-1.5 [@media(pointer:coarse)]:grid-cols-4">
        {groups.map((group) => {
          const active = group.letter === activeLetter;
          return (
            <button
              key={group.letter}
              type="button"
              data-letter={group.letter}
              onClick={() => onJump(group.letter)}
              aria-current={active ? 'true' : undefined}
              title={`${group.count} ${group.count === 1 ? 'contact' : 'contacts'}`}
              aria-label={`Jump to ${group.letter === '#' ? 'other' : group.letter} — ${
                group.count
              } ${group.count === 1 ? 'contact' : 'contacts'}`}
              className={`${CHIP} ${
                active
                  ? 'bg-[#2B1A11] text-[#FFB875] shadow-[inset_0_0_0_1px_#5C3016]'
                  : 'bg-[#16181D] text-[#A1A4AC] hover:bg-[#282C35]/80 hover:text-[#F5F5F5]'
              }`}
            >
              {group.letter}
            </button>
          );
        })}
      </div>
    </section>
  );
}
