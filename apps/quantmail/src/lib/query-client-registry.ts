// ============================================================================
// QueryClient registry — module-level handle to the app shell's QueryClient.
// ============================================================================
//
// Why this exists (fix/qm-auth-providers-minimal): the public auth pages
// (/login, /register, /forgot-password, /reset-password) render `AuthProvider`
// WITHOUT a `QueryClientProvider` above it, so the auth shell never pays for
// the react-query chunk. `useQueryClient()` throws when no provider is
// mounted, so `AuthProvider` cannot call it unconditionally — and it cannot
// call it conditionally either, because on the authenticated shell it now
// sits ABOVE `QueryProvider` (hoisted so the same provider instance — and the
// session state — survives the /login → / transition without re-hydrating).
//
// Instead, `QueryProvider` registers its client here on mount, and
// `AuthProvider.logout()` clears the cache through `getQueryClient()`. The
// import is type-only, so this module — and everything that imports it —
// pulls zero react-query runtime bytes into the auth shell.
//
// Lifecycle: registered on QueryProvider mount, unregistered on unmount.
// `logout()` is only reachable from authenticated UI (the app shell), where
// the provider is always mounted; on the auth shell `getQueryClient()`
// returns undefined and the optional call is a no-op.
// ============================================================================

import type { QueryClient } from '@tanstack/react-query';

let activeClient: QueryClient | undefined;

export function registerQueryClient(client: QueryClient | undefined): void {
  activeClient = client;
}

export function getQueryClient(): QueryClient | undefined {
  return activeClient;
}
