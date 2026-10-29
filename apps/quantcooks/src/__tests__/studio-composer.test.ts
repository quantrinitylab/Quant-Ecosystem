// ============================================================================
// QuantCooks Studio (Phase 2 Unit 1) — Composer rendering.
// There are no pre-existing component tests in this app (all prior tests are
// service/lib tests), so these render with react-dom/server against the
// established vitest setup — no new dependencies, no DOM environment.
// Interactive flows (quote confirm) ride on the same pure pricing module
// pinned in studio-pricing-mentions.test.ts.
// ============================================================================

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { Composer } from '../components/studio/Composer';

const render = (props: React.ComponentProps<typeof Composer>) =>
  renderToStaticMarkup(React.createElement(Composer, props));

describe('Composer', () => {
  it('renders the full grammar: chips, prompt field, settings row, costed Generate', () => {
    const html = render({
      kind: 'video',
      chips: [{ id: 'camera', label: 'Camera move', value: 'Cake Orbit' }],
      initialPrompt: 'Steam rising off the ramen',
      generation: 'ready',
    });
    expect(html).toContain('data-testid="studio-composer"');
    expect(html).toContain('Camera move');
    expect(html).toContain('Cake Orbit');
    expect(html).toContain('data-testid="composer-prompt"');
    expect(html).toContain('Steam rising off the ramen');
    expect(html).toContain('data-testid="composer-model"');
    expect(html).toContain('data-testid="composer-duration"');
    // Base 5s QC Motion run = 8 credits, printed on the button itself.
    expect(html).toContain('Generate · 8 credits');
  });

  it('renders parsed @-mentions and / references as removable chips', () => {
    const html = render({
      kind: 'video',
      initialPrompt: 'Feature @paneer-tikka from /festival-menu',
      generation: 'ready',
    });
    expect(html).toContain('data-testid="mention-paneer-tikka"');
    expect(html).toContain('data-testid="mention-festival-menu"');
  });

  it('re-prices the Generate button from settings (live cost)', () => {
    const base = render({ kind: 'video', initialPrompt: 'Sizzle shot', generation: 'ready' });
    const longer = render({
      kind: 'video',
      initialPrompt: 'Sizzle shot',
      generation: 'ready',
      initialSettings: { durationSeconds: 15 },
    });
    expect(base).toContain('Generate · 8 credits');
    expect(longer).toContain('Generate · 18 credits'); // 8 + 10 extra seconds × 1
  });

  it('shows a dash price and a disabled button when there is no input', () => {
    const html = render({ kind: 'video', generation: 'ready' });
    expect(html).toContain('Generate · —');
    expect(html).toMatch(/data-testid="composer-generate"[^>]*disabled/);
  });

  it('NOT_CONFIGURED: generation is disabled with the honest reason on the surface', () => {
    const html = render({ kind: 'video', initialPrompt: 'A great shot' });
    expect(html).toContain('data-testid="composer-not-configured"');
    expect(html).toContain('NOT_CONFIGURED');
    expect(html).toContain('Nothing will be charged');
    expect(html).toMatch(/data-testid="composer-generate"[^>]*disabled/);
    // No fake quote/confirm UI in this state.
    expect(html).not.toContain('data-testid="composer-confirm"');
  });
});
