'use client';

import { usePathname } from 'next/navigation';
import { QuantSidekickProvider, ThemeProvider } from '@quant/shared-ui';
import { MailCopilot } from '../components/MailCopilot';
import { useAuth } from './auth-provider';

const PUBLIC_AUTH_PATHS = ['/login', '/register', '/forgot-password'];

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
