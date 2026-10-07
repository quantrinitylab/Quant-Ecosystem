// @vitest-environment jsdom
// ============================================================================
// @quant/shared-ui - EcosystemShell tests
// ============================================================================
//
// Verifies the resolved Open Question 1 decision: a single shared layout
// wrapper mounts the six cross-cutting frontend surfaces once and apps inherit
// them through context without per-app re-registration (Property P6 analog),
// and that the backend-backed surfaces (bharat-ai, wellbeing) consume their
// backend via @quant/api-client against the Next /api/* proxy (no inline fetch).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CommandRegistry } from '@quant/command-palette';
import { SidekickEngine } from '@quant/contextual-sidekick';
import { UniversalTimelineService } from '@quant/universal-timeline';
import { ActivationTracker } from '@quant/onboarding';
import { UsageTracker } from '@quant/wellbeing';
import { TranslationStore } from '@quant/bharat-ai';
import { EcosystemShell } from '../index';
import { useEcosystem, type EcosystemContextValue } from '../EcosystemProvider';

// framer-motion is pulled in transitively by some shell surfaces; stub it so the
// jsdom render does not depend on animation internals.
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, ...props }: any) => {
          const { initial, animate, exit, transition, custom, whileHover, whileTap, ...rest } =
            props;
          return <div {...rest}>{children}</div>;
        },
    },
  ),
}));

function Probe({ onValue }: { onValue: (v: EcosystemContextValue) => void }) {
  const eco = useEcosystem();
  onValue(eco);
  return <div data-testid="probe">{eco.commandRegistry.getCount()}</div>;
}

describe('EcosystemShell', () => {
  it('renders children inside the shell', () => {
    render(
      <EcosystemShell enableBackendSurfaces={false}>
        <div data-testid="child">hello</div>
      </EcosystemShell>,
    );
    expect(screen.getByTestId('child').textContent).toBe('hello');
  });

  it('mounts all six cross-cutting surface engines once via context', () => {
    let captured: EcosystemContextValue | undefined;
    render(
      <EcosystemShell enableBackendSurfaces={false} userId="user-1" appName="quantmail">
        <Probe onValue={(v) => (captured = v)} />
      </EcosystemShell>,
    );

    expect(captured).toBeDefined();
    // command-palette
    expect(captured!.commandRegistry).toBeInstanceOf(CommandRegistry);
    expect(captured!.commandRegistry.getCount()).toBeGreaterThanOrEqual(1);
    // contextual-sidekick
    expect(captured!.sidekick).toBeInstanceOf(SidekickEngine);
    // universal-timeline
    expect(captured!.timeline).toBeInstanceOf(UniversalTimelineService);
    // onboarding
    expect(captured!.activation).toBeInstanceOf(ActivationTracker);
    // wellbeing
    expect(captured!.usageTracker).toBeInstanceOf(UsageTracker);
    // bharat-ai
    expect(captured!.translations).toBeInstanceOf(TranslationStore);

    expect(captured!.userId).toBe('user-1');
    expect(captured!.appName).toBe('quantmail');
  });

  it('inherits the SAME singletons in deeply nested consumers (no re-registration)', () => {
    const seen: EcosystemContextValue[] = [];
    render(
      <EcosystemShell enableBackendSurfaces={false}>
        <div>
          <Probe onValue={(v) => seen.push(v)} />
          <section>
            <article>
              <Probe onValue={(v) => seen.push(v)} />
            </article>
          </section>
        </div>
      </EcosystemShell>,
    );

    expect(seen).toHaveLength(2);
    // Both consumers receive the identical engine instances — proof the shell
    // mounts each surface exactly once and the subtree inherits it (P6 analog).
    expect(seen[0]!.commandRegistry).toBe(seen[1]!.commandRegistry);
    expect(seen[0]!.sidekick).toBe(seen[1]!.sidekick);
    expect(seen[0]!.timeline).toBe(seen[1]!.timeline);
    expect(seen[0]!.usageTracker).toBe(seen[1]!.usageTracker);
    expect(seen[0]!.translations).toBe(seen[1]!.translations);
  });

  it('throws if useEcosystem is used outside the shell', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe onValue={() => {}} />)).toThrow(/EcosystemShell|EcosystemProvider/);
    spy.mockRestore();
  });
});

describe('EcosystemShell backend-backed surfaces (api-client, no inline fetch)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ success: true, data: {} }),
    }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('consumes bharat-ai and wellbeing via the Next /api/* proxy paths', async () => {
    render(
      <EcosystemShell enableBackendSurfaces userId="user-2" appName="quantchat">
        <div data-testid="child">app</div>
      </EcosystemShell>,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const calledUrls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calledUrls.some((u) => u.startsWith('/api/bharat-ai/locale'))).toBe(true);
    expect(calledUrls.some((u) => u.startsWith('/api/wellbeing/summary'))).toBe(true);
  });
});
