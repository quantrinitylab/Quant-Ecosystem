'use client';
// ============================================================================
// @quant/shared-ui - EcosystemProvider
// ============================================================================
//
// The shared layout wrapper for the cross-cutting *frontend* surfaces of the
// ecosystem (design.md "Category A — Cross-cutting", resolved Open Question 1:
// SHARED LAYOUT WRAPPER). It constructs each cross-cutting engine's service
// ONCE (a decorated singleton, mirroring the server-core plugin convention's
// "construct once at boot" rule) and exposes them through a single React
// context so every app inherits all six surfaces by mounting the wrapper —
// never by re-registering each surface per app (Property P6 analog for the
// frontend).
//
// The six surfaces wired here (Requirements 2.1, 2.4, 1.4):
//   - onboarding            (@quant/onboarding)         frontend-led
//   - command-palette       (@quant/command-palette)    frontend-led
//   - contextual-sidekick   (@quant/contextual-sidekick) frontend-led
//   - universal-timeline    (@quant/universal-timeline) frontend-led
//   - wellbeing             (@quant/wellbeing)          backend-backed controls
//   - bharat-ai             (@quant/bharat-ai)          backend-backed localization
//
// Backend-backed surfaces (wellbeing, bharat-ai) additionally consume their
// backend through `@quant/api-client` hooks (see ./hooks) against the Next
// `/api/*` proxy — never an inline fetch (Requirement 1.4 / Layer 5).

import React, { createContext, useContext, useMemo } from 'react';
import { CommandRegistry, type Command } from '@quant/command-palette';
import { SidekickEngine } from '@quant/contextual-sidekick';
import { UniversalTimelineService } from '@quant/universal-timeline';
import { ActivationTracker } from '@quant/onboarding';
import { UsageTracker } from '@quant/wellbeing';
import { TranslationStore, QuantLanguage } from '@quant/bharat-ai';

/**
 * The singleton engine services for the six cross-cutting frontend surfaces,
 * mounted once by {@link EcosystemProvider} and read by app surfaces via
 * {@link useEcosystem}.
 */
export interface EcosystemContextValue {
  /** `@quant/command-palette` — global action surface (Cmd+K) registry. */
  commandRegistry: CommandRegistry;
  /** `@quant/contextual-sidekick` — in-app assistant surface engine. */
  sidekick: SidekickEngine;
  /** `@quant/universal-timeline` — cross-app activity surface service. */
  timeline: UniversalTimelineService;
  /** `@quant/onboarding` — first-run activation tracker. */
  activation: ActivationTracker;
  /** `@quant/wellbeing` — usage/wellbeing controls tracker. */
  usageTracker: UsageTracker;
  /** `@quant/bharat-ai` — localization / India-market translation store. */
  translations: TranslationStore;
  /** Current user id the surfaces are scoped to. */
  userId: string;
  /** Host app name (used to scope command/sidekick context). */
  appName: string;
}

const EcosystemContext = createContext<EcosystemContextValue | null>(null);

export interface EcosystemProviderProps {
  children: React.ReactNode;
  /** User id the cross-cutting surfaces are scoped to. */
  userId?: string;
  /** Host app name (e.g. "quantmail"). */
  appName?: string;
  /** Default language for the bharat-ai localization fallback chain. */
  defaultLanguage?: QuantLanguage;
}

/**
 * Constructs the six cross-cutting engine services exactly once and provides
 * them to the subtree. Mounting this once at the app root is sufficient for
 * every descendant surface to inherit them (no per-app re-registration).
 */
export function EcosystemProvider({
  children,
  userId = 'anonymous',
  appName = 'quant',
  defaultLanguage = QuantLanguage.english,
}: EcosystemProviderProps) {
  const value = useMemo<EcosystemContextValue>(() => {
    const commandRegistry = new CommandRegistry();
    const sidekick = new SidekickEngine();
    const timeline = new UniversalTimelineService();
    const activation = new ActivationTracker(userId);
    const usageTracker = new UsageTracker();
    const translations = new TranslationStore();
    translations.setFallbackChain([defaultLanguage, QuantLanguage.english]);

    // Seed one built-in cross-app command so the palette engine is non-empty on
    // first mount; apps register their own commands via `useEcosystem()`.
    const helpCommand: Command = {
      id: 'ecosystem.help',
      name: 'Open Quant help',
      description: 'Open the Quant help center',
      category: 'navigate',
      app: appName,
      keywords: ['help', 'support', 'docs'],
      handler: async () => ({ success: true, message: 'Opened help', executedAt: Date.now() }),
    };
    commandRegistry.register(helpCommand);

    return {
      commandRegistry,
      sidekick,
      timeline,
      activation,
      usageTracker,
      translations,
      userId,
      appName,
    };
  }, [userId, appName, defaultLanguage]);

  return <EcosystemContext.Provider value={value}>{children}</EcosystemContext.Provider>;
}

/**
 * Access the shared cross-cutting engine singletons. Must be called within an
 * {@link EcosystemProvider} / `EcosystemShell`.
 */
export function useEcosystem(): EcosystemContextValue {
  const ctx = useContext(EcosystemContext);
  if (!ctx) {
    throw new Error('useEcosystem must be used within an EcosystemShell / EcosystemProvider');
  }
  return ctx;
}
