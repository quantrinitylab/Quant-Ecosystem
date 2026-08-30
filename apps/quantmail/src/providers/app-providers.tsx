'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { QuantSidekickProvider, ThemeProvider } from '@quant/shared-ui';
import { useAuth } from './auth-provider';

const PUBLIC_AUTH_PATHS = ['/login', '/register', '/forgot-password'];

/**
 * Quanty's dock, out of the root bundle.
 *
 * This provider tree is mounted by the root layout, so a static import put
 * MailCopilot's 525 lines — plus the Quanty mascot and the chat transport — into
 * the first chunk of *every* route, including `/login`, where it can never
 * render. It is already gated on `showTools` below, and that gate only resolves
 * client-side once auth has settled, so nothing was ever painting it on the
 * first frame anyway: `ssr: false` costs no visible time and removes it from
 * every unauthenticated entry point.
 */
const MailCopilot = dynamic(() => import('../components/MailCopilot').then((m) => m.MailCopilot), {
  ssr: false,
});

/**
 * Contextual floating action button (bottom-right). Not yet implemented.
 *
 * Intended behaviour:
 * - Mail surfaces (inbox, folders, threads, search, labels) → compose a mail
 * - Calendar → add an event (opens the calendar's New event modal)
 * - Everywhere else (CodeHub, Drive, Repos, Pipelines, Settings…) → hidden,
 *   so the + never leaks into non-mail contexts.
 */
function ContextFab() {
  return null;
}

/**
 * Global, non-keyboard providers.
 *
 * This file used to carry a second, unreachable command palette: a 156-line
 * `CommandPaletteItem[]` array, its own `⌘K` document listener writing to state
 * nothing rendered, and a "show shortcuts" entry that dispatched a synthetic
 * `KeyboardEvent` at the document to reach the help sheet. The live palette is
 * `components/CommandPalette`, generated from the command registry, so all of
 * that has gone. Key handling belongs to `KeyboardProvider`.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();
  const isPublicAuthRoute = PUBLIC_AUTH_PATHS.includes(pathname ?? '');
  // Only mount the AI copilot once the user is actually signed in.
  const showTools = isAuthenticated && !isPublicAuthRoute && !isLoading;

  return (
    <ThemeProvider defaultTheme="dark">
      <QuantSidekickProvider>
        {children}
        {showTools ? (
          <>
            <MailCopilot />
            <ContextFab />
          </>
        ) : null}
      </QuantSidekickProvider>
    </ThemeProvider>
  );
}
