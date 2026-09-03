// ============================================================================
// MailIcon — the inbox route's glyph set
// ============================================================================
// Lifted out of `app/page.tsx`, where it was a route-local function, because the
// selection header now lives in its own component and needs the same archive,
// trash and pin glyphs the rows use. Two hand-drawn copies of the same path data
// drift; one module cannot.
//
// Deliberately not `icons/index.tsx`: that module is ~1,340 lines of `'use
// client'` covering the whole suite, and the inbox route has never pulled it in.
// These are the twelve glyphs this route actually draws, at the 1.8 stroke weight
// the mail rows are set in.

import type { ReactNode } from 'react';

export type MailIconName =
  | 'archive'
  | 'check'
  | 'clock'
  | 'close'
  | 'compose'
  | 'mail'
  | 'mail-unread'
  | 'more'
  | 'search'
  | 'star'
  | 'pin'
  | 'trash'
  | 'reply'
  | 'forward'
  | 'sparkles'
  | 'shield';

const PATHS: Record<MailIconName, ReactNode> = {
  archive: (
    <>
      <path d="M4 7h16" />
      <path d="M5 7l1-3h12l1 3v12H5z" />
      <path d="M9 11h6" />
    </>
  ),
  // A ticked checkbox rather than a bare tick: the menu row it labels stands in
  // for the row checkboxes, so it should look like one.
  check: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="m7.5 12 3 3 6-6" />
    </>
  ),
  // The dial is off-centre by a pixel so the two alarm ticks have room; this is
  // the same clock the hover bar and the snooze trigger draw.
  clock: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2 2" />
      <path d="M5 3 2 6" />
      <path d="m22 6-3-3" />
    </>
  ),
  close: <path d="m7 7 10 10M17 7 7 17" />,
  compose: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  // The unread envelope carries a brand dot rather than a second outline, so the
  // pair reads as one state change instead of two different envelopes. The fill is
  // literal because it is a status colour, not the button's `currentColor`.
  'mail-unread': (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
      <circle cx="18" cy="6" r="2.5" fill="#FF8C42" stroke="none" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  star: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  pin: (
    <>
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6a3 3 0 0 0-6 0v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24Z" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </>
  ),
  reply: <path d="M9 17 4 12l5-5M4 12h12a4 4 0 0 1 4 4v2" />,
  forward: <path d="m15 17 5-5-5-5M20 12H8a4 4 0 0 0-4 4v2" />,
  sparkles: (
    <>
      <path d="m12 3-1.9 4.8L5.3 9.7l4.8 1.9L12 16.4l1.9-4.8 4.8-1.9-4.8-1.9L12 3z" />
      <path d="m19 16-.9 2.1L16 19l2.1.9.9 2.1.9-2.1 2.1-.9-2.1-.9-.9-2.1z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
};

/**
 * One glyph from the inbox set, drawn in `currentColor` so it inherits the
 * colour and optical weight of whatever it sits beside.
 *
 * `aria-hidden`: every call site pairs the glyph with a real label or an
 * `aria-label` on the button around it.
 */
export function MailIcon({
  name,
  className = 'h-4 w-4',
}: {
  name: MailIconName;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
