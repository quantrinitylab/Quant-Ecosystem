'use client';

/**
 * The ✕ that empties a search field.
 *
 * WHY THIS IS A COMPONENT. There are eleven `<input type="search">` fields in
 * this app. Three had drawn their own clear button, by hand, three times over;
 * the other eight had none and were silently relying on Chrome's
 * `::-webkit-search-cancel-button` — which is why those three showed TWO ✕s
 * side by side, and why suppressing the native one in `globals.css` would have
 * left the other eight with no way to clear at all. One primitive fixes both
 * halves of that, and §18 says a pattern repeated three times is a component.
 *
 * WHY THE HIT AREA IS A PSEUDO-ELEMENT. The icon is 14px and the field it sits
 * in is 38–44px tall, so a 44px button would either overflow the field or
 * stretch it. `before:-inset-[15px]` expands the *pointer* target to 44×44
 * without touching layout — the glyph stays 14px and visually quiet, the thumb
 * gets a full target. This is the technique the inbox's mobile field had already
 * arrived at independently; it is now the only copy of it.
 *
 * The icon is an inline SVG rather than `MailIcon` so that a component which
 * does not already import the 1300-line icon module does not start to.
 *
 * WHY THERE ARE TWO VARIANTS. Two honestly different fields exist, and flattening
 * them into one would make one of them worse. A dense filter field (a dropdown,
 * a tree filter, a snippet list) wants the glyph to disappear into the row —
 * that is `bare`. A large rounded pill (the search page's `h-11 rounded-full`)
 * has room for a real target, and there a bare glyph floating in whitespace
 * reads as debris — that is `ghost`, a 28px disc that lights up on hover.
 * Same icon, same label contract, same focus ring; one named difference instead
 * of a second hand-rolled copy.
 */
export function SearchClearButton({
  onClear,
  label = 'Clear search',
  variant = 'bare',
  className = '',
}: {
  /** Empty the field. The caller owns the state; this only asks. */
  onClear: () => void;
  /** Override when "search" is the wrong noun — "Clear filter", "Clear query". */
  label?: string;
  /** `bare` for dense filter rows, `ghost` for large pill fields. */
  variant?: 'bare' | 'ghost';
  className?: string;
}) {
  // `ghost` is 28px, so `-inset-2` (8px a side) is what reaches 44. `bare` is
  // 14px, so it needs 15. Both land on the same target; neither changes layout.
  //
  // The position utility belongs to the variant, not to the caller: `bare` sits
  // in flow (its field is a flex row), `ghost` pins itself to the right edge of
  // the pill it belongs to. Leaving that to `className` would not work anyway —
  // Tailwind emits `.relative` after `.absolute`, so a caller passing `absolute`
  // to a component that already says `relative` silently loses.
  const shape =
    variant === 'ghost'
      ? 'absolute right-2.5 top-1/2 -translate-y-1/2 grid size-7 place-items-center rounded-full before:-inset-2 hover:bg-[#282C35] hover:text-[#F5F5F5]'
      : 'relative rounded before:-inset-[15px] hover:text-white';

  return (
    <button
      type="button"
      onClick={onClear}
      title={label}
      aria-label={label}
      className={`shrink-0 text-[#A1A4AC] transition-colors before:absolute before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${shape} ${className}`}
    >
      <svg
        className="size-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}
