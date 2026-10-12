// F-187: cross-app switcher — registry-driven tests.
// Uses createRoot + act (repo pattern). The '@quant/shared-ui' mock re-exports
// the REAL registry source so hrefs/icons are verified against ground truth.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@quant/shared-ui', async () => {
  const real = await import(
    '../../../../packages/shared-ui/src/interconnection/constants'
  );
  return { CORE_QUANT_APPS: real.CORE_QUANT_APPS };
});

const { AppSwitcher } = await import('../components/AppSwitcher');
const { CORE_QUANT_APPS } = await import(
  '../../../../packages/shared-ui/src/interconnection/constants'
);

const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u;

const APP_IDS = Object.keys(CORE_QUANT_APPS);

describe('AppSwitcher (F-187)', () => {
  it('renders a closed trigger with proper a11y wiring and no open panel', () => {
    const html = renderToStaticMarkup(<AppSwitcher />);
    expect(html).toContain('data-testid="app-switcher-trigger"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain('data-testid="app-switcher-panel"');
    expect(EMOJI_RE.test(html)).toBe(false);
  });

  it('trigger icon is a real SVG (9-dot grid), not an emoji or wordmark', () => {
    const html = renderToStaticMarkup(<AppSwitcher />);
    const trigger = html.slice(html.indexOf('data-testid="app-switcher-trigger"'));
    expect(trigger).toContain('<svg');
    expect(trigger).toContain('<circle');
  });

  describe('open panel', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    });

    afterEach(() => {
      act(() => root.unmount());
      container.remove();
    });

    function openPanel() {
      act(() => {
        root.render(<AppSwitcher />);
      });
      const trigger = container.querySelector(
        '[data-testid="app-switcher-trigger"]',
      ) as HTMLButtonElement;
      act(() => {
        trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      return trigger;
    }

    it('renders every registry app as a link with the exact registry href', () => {
      openPanel();
      expect(APP_IDS.length).toBeGreaterThanOrEqual(10);
      for (const id of APP_IDS) {
        const app = (CORE_QUANT_APPS as Record<string, { productionUrl: string; defaultRoute: string; name: string }>)[id];
        const link = container.querySelector(
          `[data-testid="app-switcher-link-${id}"]`,
        ) as HTMLAnchorElement | null;
        expect(link, `missing link for ${id}`).not.toBeNull();
        expect(link!.getAttribute('href')).toBe(`${app.productionUrl}${app.defaultRoute}`);
        expect(link!.textContent).toContain(app.name);
      }
    });

    it('marks the current app (quantai) active and others not', () => {
      openPanel();
      const current = container.querySelector(
        '[data-testid="app-switcher-link-quantai"]',
      ) as HTMLAnchorElement;
      expect(current.getAttribute('aria-current')).toBe('page');
      expect(current.textContent).toContain('Current');
      for (const id of APP_IDS.filter((i) => i !== 'quantai')) {
        const link = container.querySelector(
          `[data-testid="app-switcher-link-${id}"]`,
        ) as HTMLAnchorElement;
        expect(link.hasAttribute('aria-current')).toBe(false);
      }
    });

    it('renders a real SVG icon per app and no emojis anywhere in the panel', () => {
      openPanel();
      for (const id of APP_IDS) {
        const tile = container.querySelector(
          `[data-testid="app-switcher-icon-${id}"]`,
        );
        expect(tile, `missing icon tile for ${id}`).not.toBeNull();
        expect(tile!.querySelector('svg')).not.toBeNull();
      }
      const panel = container.querySelector('[data-testid="app-switcher-panel"]')!;
      expect(EMOJI_RE.test(panel.textContent ?? '')).toBe(false);
    });

    it('panel is dark-styled', () => {
      openPanel();
      const panel = container.querySelector(
        '[data-testid="app-switcher-panel"]',
      ) as HTMLElement;
      expect(panel.className).toContain('bg-[#0B0C12]');
    });

    it('Escape closes the panel and returns focus to the trigger', () => {
      const trigger = openPanel();
      expect(
        container.querySelector('[data-testid="app-switcher-panel"]'),
      ).not.toBeNull();
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      expect(
        container.querySelector('[data-testid="app-switcher-panel"]'),
      ).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
  });
});
