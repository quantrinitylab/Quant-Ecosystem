'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useDeferredMount } from '../hooks/useDeferredMount';

/**
 * The way into Quanty, as one primitive instead of a pattern each route
 * re-types.
 *
 * Two routes had this: the inbox and the calendar, each with its own copy of the
 * same five parts — a `useState`, a `useDeferredMount`, a `dynamic()` import, a
 * trigger button, and the drawer. Twenty-one other surfaces that mount
 * `AppShell` had none, so on Drive, Contacts, Settings, Search, every mailbox
 * and all of QuantGit the assistant simply did not exist. The two copies had
 * already drifted: `size={22}` with `rounded-xl` and a `title` on one,
 * `size={24}` with `rounded-lg` and no `title` on the other, and only the inbox
 * ever told Quanty what page it was on.
 *
 * Quanty now enters through two pieces. The live-agent surface is the entry
 * point: `AppShell` keeps a `QuantyLiveAgent` handle and opens its mode
 * chooser ([Chat] [Voice Live Agent]) from the header Quanty button. The
 * copilot drawer hangs at the shell's top level next to `QuantFab`, because
 * `AppShell` swaps its whole header out for `customHeader` — which the inbox
 * does the moment a message is selected, and a drawer mounted inside the
 * header would be unmounted by that swap and take the conversation with it.
 */

/**
 * Where the user is, in a phrase Quanty can read. Ordered longest-prefix-first,
 * because `/repos/:id/editor` is a different answer from `/repos`.
 *
 * These are the routes that mount `AppShell`. `/thread` and `/compose` are
 * absent on purpose: they carry their own Quanty with the open message or the
 * draft in hand, which is strictly more context than a route name, and
 * `AppShell` does not render a second trigger there.
 */
const VIEW_LABELS: ReadonlyArray<readonly [prefix: string, label: string]> = [
  ['/quantgit', 'Browsing QuantGit repositories'],
  ['/pipelines', 'Looking at QuantGit pipelines'],
  ['/workspaces', 'Managing workspaces'],
  ['/calendar', 'Looking at the calendar'],
  ['/contacts', 'Browsing contacts'],
  ['/drive', 'Browsing files in Drive'],
  ['/postcard', 'Designing a postcard'],
  ['/settings', 'Changing QuantMail settings'],
  ['/security', 'Reviewing account security'],
  ['/search', 'Searching mail'],
  ['/labels', 'Managing mail labels'],
  ['/starred', 'Reading starred mail'],
  ['/snoozed', 'Reading snoozed mail'],
  ['/archive', 'Reading archived mail'],
  ['/drafts', 'Reading draft messages'],
  ['/trash', 'Reading deleted mail'],
  ['/spam', 'Reading spam'],
  ['/sent', 'Reading sent mail'],
];

function viewLabelForRoute(pathname: string): string {
  if (pathname === '/') return 'Browsing the primary inbox';
  const match = VIEW_LABELS.find(([prefix]) => pathname.startsWith(prefix));
  return match ? match[1] : 'Using QuantMail';
}

/**
 * Loaded on demand: the drawer is 660+ lines plus its own chat history layer,
 * and it now sits on every shell route, so putting it in the first chunk would
 * make the whole app pay for a panel most sessions never open. Paired with
 * `useDeferredMount`, the code is fetched the first time Quanty is actually
 * asked for and then stays mounted, so the conversation survives closing the
 * drawer exactly as it would with a static import.
 */
const QuantyCopilotDrawer = dynamic(() => import('./QuantyCopilotDrawer'), { ssr: false });

/*
 * NOTE 2026-10-11: the `QuantyTrigger` export that used to live here was
 * removed — repo-wide grep showed zero mount sites (the trigger docstring
 * claiming it was "the only Quanty a session is guaranteed to see" was false).
 * The real entry point is the live-agent surface: `AppShell` opens it via
 * `liveAgentRef.current?.open()` from the header Quanty button, and
 * `QuantyDrawerHost` below still hosts the copilot drawer conversation.
 */

export function QuantyDrawerHost({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname() ?? '/';
  const shouldMount = useDeferredMount(isOpen);

  if (!shouldMount) return null;

  return (
    <QuantyCopilotDrawer
      isOpen={isOpen}
      onClose={onClose}
      viewLabel={viewLabelForRoute(pathname)}
    />
  );
}
