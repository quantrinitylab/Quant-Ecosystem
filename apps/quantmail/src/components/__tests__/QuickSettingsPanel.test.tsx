import { describe, it, expect, vi } from 'vitest';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuickSettingsButton, QuickSettingsPanel } from '../QuickSettingsPanel';

// next/link renders a plain anchor in this markup test.
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) =>
    createElement('a', { href, ...rest }, children),
}));

describe('QuickSettingsPanel', () => {
  it('renders nothing when closed — no gear panel in the DOM to tab into', () => {
    const html = renderToStaticMarkup(
      <QuickSettingsPanel open={false} onClose={() => {}} />,
    );
    expect(html).toBe('');
  });

  it('renders the three wired controls plus the honest inbox-type note when open', () => {
    const html = renderToStaticMarkup(<QuickSettingsPanel open onClose={() => {}} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('Quick settings');
    // Theme, density, notifications — every group is a radiogroup.
    expect(html.match(/role="radiogroup"/g)?.length).toBe(3);
    expect(html).toContain('Obsidian');
    expect(html).toContain('Daylight');
    expect(html).toContain('Match system');
    expect(html).toContain('Comfortable');
    expect(html).toContain('Cozy');
    expect(html).toContain('Compact');
    expect(html).toContain('All new mail');
    expect(html).toContain('Important mail only');
    expect(html).toContain('Nothing');
    // No fake inbox-type / reading-pane controls: the panel says plainly
    // that QuantMail does not offer them yet instead of rendering them.
    expect(html).toContain('Inbox type and reading pane are not settings QuantMail offers yet');
    expect(html).not.toContain('Reading pane');
    expect(html).toContain('href="/settings"');
    expect(html).toContain('See all settings');
  });

  it('keeps every control at the 44px touch floor and marks the selected option', () => {
    const html = renderToStaticMarkup(<QuickSettingsPanel open onClose={() => {}} />);
    expect(html).toContain('min-h-11');
    // Defaults: dark theme, comfortable density, all notifications.
    expect(html.match(/aria-checked="true"/g)?.length).toBe(3);
  });

  it('the trigger is a 44px gear button that names what it opens', () => {
    const html = renderToStaticMarkup(<QuickSettingsButton />);
    expect(html).toContain('data-testid="quick-settings-button"');
    expect(html).toContain('aria-label="Quick settings"');
    expect(html).toContain('min-h-[44px]');
    // Closed trigger renders no dialog.
    expect(html).not.toContain('role="dialog"');
  });

  it('the panel is pure black with spacing, not divider lines, between sections', () => {
    const html = renderToStaticMarkup(<QuickSettingsPanel open onClose={() => {}} />);
    expect(html).toContain('bg-black');
    expect(html).toContain('space-y-5');
    expect(html).not.toContain('border-b');
    expect(html).not.toContain('divide-y');
  });
});
