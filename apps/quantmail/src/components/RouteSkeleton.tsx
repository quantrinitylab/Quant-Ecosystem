/**
 * The shape of a route while its chunk is still in flight.
 *
 * Every route used to fall back to the root `app/loading.tsx`, which is a
 * full-screen `BrandLoader variant="splash"`. So moving from Inbox to Sent tore
 * the entire workspace down to a centred logo and built it back — the app read
 * as slow even when the chunk arrived in 80ms, because a splash screen says
 * "starting up", not "fetching a list".
 *
 * This renders the chrome that AppShell renders anyway (a 56px header rail, and
 * on mobile the 56px bottom nav) plus a silhouette of the content that is coming.
 * Nothing moves when the real route mounts, so the transition reads as the list
 * filling in rather than the app restarting.
 *
 * Deliberately NOT a client component and deliberately not built on
 * `<Skeleton>` from `@quant/shared-ui`:
 *  - No `'use client'` means the loading UI is streamed HTML with zero JS. It has
 *    to paint while a chunk is downloading — shipping a bundle to draw it would
 *    defeat the point.
 *  - `<Skeleton>` pulls `useReducedMotion` from framer-motion (so, a client
 *    boundary and the animation runtime), and stamps `role="status"` on every
 *    bar. Thirty bars would be thirty live regions announcing "Loading content".
 *    Here the container is the single live region and everything inside it is
 *    `aria-hidden`.
 */

import type { ComponentType } from 'react';

type RouteSkeletonVariant = 'list' | 'thread' | 'board' | 'settings' | 'calendar' | 'compose';

export interface RouteSkeletonProps {
  /** Which content silhouette to draw. */
  variant?: RouteSkeletonVariant;
  /** Announced to assistive tech, e.g. "Loading Sent". */
  label?: string;
}

/** One shimmer bar. `motion-reduce` is honoured by Tailwind, not by a hook. */
const PULSE = 'bg-[#16181D] animate-pulse motion-reduce:animate-none';
const BAR = `rounded ${PULSE}`;
/** A filled placeholder that should read as a surface rather than as text. */
const SURFACE = 'rounded-xl bg-[#111318] shadow-[inset_0_0_0_1px_#282C35]';

/**
 * Fixed, not random: a `Math.random()` width would differ between the streamed
 * HTML and any client re-render, and staggered-but-stable widths already read as
 * real subject lines.
 */
const ROW_WIDTHS = ['72%', '54%', '81%', '46%', '66%', '77%', '58%', '69%', '50%', '74%'];

function HeaderRail() {
  return (
    <div className="flex min-h-14 flex-none items-center justify-between gap-3 border-b border-[#282C35] bg-[#090A0C] px-3 md:px-5">
      <div className="flex items-center gap-3">
        <div className={`size-9 ${BAR}`} />
        <div className={`size-7 rounded-lg ${PULSE}`} />
        <div className={`h-4 w-24 ${BAR}`} />
      </div>
      <div className={`hidden h-9 w-full max-w-md ${BAR} sm:block`} />
      <div className="flex items-center gap-2">
        <div className={`size-9 ${BAR}`} />
        <div className={`size-8 rounded-full ${PULSE}`} />
      </div>
    </div>
  );
}

function ListBody() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Folder title + toolbar, matching MailFolderPage's own header block. */}
      <div className="flex flex-none items-center justify-between gap-3 px-4 py-4 md:px-6">
        <div className={`h-6 w-40 ${BAR}`} />
        <div className="flex gap-2">
          <div className={`size-9 ${BAR}`} />
          <div className={`size-9 ${BAR}`} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 px-2 md:px-4">
        {ROW_WIDTHS.map((width) => (
          <div key={width} className="flex min-h-touch items-center gap-3 px-2 py-3">
            <div className={`size-9 flex-none rounded-full ${PULSE}`} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className={`h-3 w-28 ${BAR}`} />
              <div className={`h-3 ${BAR}`} style={{ width }} />
            </div>
            <div className={`h-3 w-10 flex-none ${BAR}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ThreadBody() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-5 md:px-8">
      <div className="flex flex-col gap-2">
        <div className={`h-6 w-3/5 max-w-lg ${BAR}`} />
        <div className={`h-3 w-32 ${BAR}`} />
      </div>
      {/* Alternating sides: the thread reads as a conversation, so its loading
          state has to as well, or the first paint jumps every bubble sideways. */}
      {['82%', '64%', '74%'].map((width, index) => (
        <div
          key={width}
          className={`flex w-full ${index % 2 === 1 ? 'justify-end' : 'justify-start'}`}
        >
          <div className={`${SURFACE} flex flex-col gap-2 p-4`} style={{ width }}>
            <div className={`h-3 w-24 ${BAR}`} />
            <div className={`h-3 w-full ${BAR}`} />
            <div className={`h-3 w-4/5 ${BAR}`} />
          </div>
        </div>
      ))}
      <div className={`mt-auto h-14 w-full flex-none ${SURFACE}`} />
    </div>
  );
}

function BoardBody() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-5 md:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className={`h-6 w-48 ${BAR}`} />
        <div className={`h-9 w-28 ${BAR}`} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className={`${SURFACE} flex flex-col gap-3 p-4`}>
            <div className="flex items-center gap-3">
              <div className={`size-10 flex-none rounded-lg ${PULSE}`} />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className={`h-3 w-2/3 ${BAR}`} />
                <div className={`h-3 w-1/3 ${BAR}`} />
              </div>
            </div>
            <div className={`h-3 w-full ${BAR}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsBody() {
  return (
    <div className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col gap-5 px-4 py-6 md:px-6">
      <div className={`h-6 w-36 ${BAR}`} />
      {Array.from({ length: 3 }, (_, section) => (
        <div key={section} className={`${SURFACE} flex flex-col gap-4 p-5`}>
          <div className={`h-4 w-40 ${BAR}`} />
          {Array.from({ length: 3 }, (_, row) => (
            <div key={row} className="flex min-h-touch items-center justify-between gap-4">
              <div className="flex flex-col gap-2">
                <div className={`h-3 w-32 ${BAR}`} />
                <div className={`h-2.5 w-48 ${BAR}`} />
              </div>
              <div className={`h-6 w-11 flex-none rounded-full ${PULSE}`} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CalendarBody() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 py-4 md:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className={`h-6 w-44 ${BAR}`} />
        <div className="flex gap-2">
          <div className={`size-9 ${BAR}`} />
          <div className={`size-9 ${BAR}`} />
          <div className={`h-9 w-24 ${BAR}`} />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={`dow-${index}`} className={`h-3 ${BAR}`} />
        ))}
      </div>
      {/* 35 cells: five weeks is what a month grid almost always resolves to, so
          the real grid lands on the same height instead of shoving content down. */}
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-5 gap-1">
        {Array.from({ length: 35 }, (_, index) => (
          <div
            key={`cell-${index}`}
            className="rounded-lg bg-[#111318] shadow-[inset_0_0_0_1px_#282C35] p-1.5"
          >
            <div className={`h-2.5 w-4 ${BAR}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ComposeBody() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-5 md:px-8">
      <div className={`h-6 w-32 ${BAR}`} />
      <div className={`${SURFACE} flex min-h-0 flex-1 flex-col gap-3 p-4`}>
        {['To', 'Subject'].map((field) => (
          <div key={field} className="flex items-center gap-3 border-b border-[#282C35] pb-3">
            <div className={`h-3 w-14 flex-none ${BAR}`} />
            <div className={`h-3 flex-1 ${BAR}`} />
          </div>
        ))}
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <div className={`h-3 w-full ${BAR}`} />
          <div className={`h-3 w-11/12 ${BAR}`} />
          <div className={`h-3 w-4/5 ${BAR}`} />
        </div>
        <div className="flex items-center gap-2 pt-2">
          <div className={`h-11 w-28 ${BAR}`} />
          <div className={`size-9 ${BAR}`} />
          <div className={`size-9 ${BAR}`} />
        </div>
      </div>
    </div>
  );
}

const BODIES: Record<RouteSkeletonVariant, ComponentType> = {
  list: ListBody,
  thread: ThreadBody,
  board: BoardBody,
  settings: SettingsBody,
  calendar: CalendarBody,
  compose: ComposeBody,
};

export function RouteSkeleton({ variant = 'list', label = 'page' }: RouteSkeletonProps) {
  const Body = BODIES[variant];
  /* The thread and compose routes hide the header on mobile (AppShell does the
     same via `pathname.startsWith`), so the skeleton has to match or the content
     starts 56px lower than it ends up. */
  const chromeless = variant === 'thread' || variant === 'compose';

  return (
    <section
      className="flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-[#090A0C]"
      role="status"
      aria-busy="true"
      aria-label={`Loading ${label}`}
    >
      <div aria-hidden="true" className="flex min-h-0 flex-1 flex-col">
        <div className={chromeless ? 'hidden md:flex md:flex-col' : 'flex flex-col'}>
          <HeaderRail />
        </div>
        <Body />
        {/* Mobile bottom nav: AppShell reserves it with `pb-14 md:pb-0`. */}
        {!chromeless && <div className="h-14 flex-none border-t border-[#282C35] md:hidden" />}
      </div>
    </section>
  );
}

export default RouteSkeleton;
