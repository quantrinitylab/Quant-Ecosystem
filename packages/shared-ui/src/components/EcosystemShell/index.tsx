'use client';
// ============================================================================
// @quant/shared-ui - EcosystemShell
// ============================================================================
//
// One shared layout wrapper that mounts the six cross-cutting frontend surfaces
// ONCE (design Open Question 1 → SHARED LAYOUT WRAPPER). An app inherits all of
// onboarding, command-palette, contextual-sidekick, universal-timeline,
// wellbeing and bharat-ai simply by wrapping its tree in <EcosystemShell>; it
// never re-registers a surface per app (Property P6 analog for the frontend).
//
// Composition (outermost → innermost):
//   QueryClientProvider   — react-query context for the api-client Layer-5 hooks
//     ThemeProvider       — theming surface
//       EcosystemProvider — constructs the six engine singletons once
//         CommandPaletteProvider — the visible Cmd+K command-palette surface
//           {children}
//           BackendBackedSurfaces — consumes bharat-ai + wellbeing via api-client

import { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '../ThemeProvider';
import { CommandPaletteProvider } from '../CommandPaletteUI/CommandPaletteProvider';
import { EcosystemProvider, type EcosystemProviderProps } from './EcosystemProvider';
import { QuantSidekickProvider, QuantSidekick } from '../QuantSidekick/QuantSidekick';
import { useBharatLocale, useWellbeingSummary } from './hooks';

/**
 * Invisible component, mounted once inside the shell, that wires the two
 * backend-backed surfaces (bharat-ai localization, wellbeing controls) to their
 * backends via `@quant/api-client` (no inline fetch — Layer 5 / Requirement 1.4).
 * It renders nothing; data flows to consumers through the query cache.
 */
function BackendBackedSurfaces(): null {
  useBharatLocale();
  useWellbeingSummary();
  return null;
}

export interface EcosystemShellProps extends EcosystemProviderProps {
  /** Provide a custom react-query client; one (retry disabled) is created if omitted. */
  queryClient?: QueryClient;
  /**
   * Mount the backend-backed surfaces (bharat-ai localization, wellbeing).
   * Defaults to `true`; set `false` for SSR/test shells with no backend.
   */
  enableBackendSurfaces?: boolean;
  /** Default theme handed to the inner ThemeProvider. */
  defaultTheme?: 'light' | 'dark' | 'system';
  /**
   * Mount the universal QuantAI presence (the animated "alien" assistant +
   * provider) so every app shows it consistently. Defaults to `true`; set
   * `false` for embeds/tests that should not render the floating widget.
   */
  enableQuantSidekick?: boolean;
}

/**
 * The single mount point for the ecosystem's cross-cutting frontend surfaces.
 * Wrap an app's root layout in this and every descendant inherits all six
 * surfaces through context — no per-app re-registration.
 */
export function EcosystemShell({
  children,
  userId,
  appName,
  defaultLanguage,
  queryClient,
  enableBackendSurfaces = true,
  defaultTheme = 'system',
  enableQuantSidekick = true,
}: EcosystemShellProps) {
  const client = useMemo(
    () => queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    [queryClient],
  );

  return (
    <QueryClientProvider client={client}>
      <ThemeProvider defaultTheme={defaultTheme}>
        <EcosystemProvider userId={userId} appName={appName} defaultLanguage={defaultLanguage}>
          <CommandPaletteProvider appName={appName}>
            <QuantSidekickProvider>
              {children}
              {enableQuantSidekick ? <QuantSidekick /> : null}
              {enableBackendSurfaces ? <BackendBackedSurfaces /> : null}
            </QuantSidekickProvider>
          </CommandPaletteProvider>
        </EcosystemProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

// Re-exports so consumers import the whole surface from one place.
export { EcosystemProvider, useEcosystem } from './EcosystemProvider';
export type { EcosystemContextValue, EcosystemProviderProps } from './EcosystemProvider';
export type { BharatLocaleBundle, WellbeingSummary, RecordUsageInput } from './hooks';
