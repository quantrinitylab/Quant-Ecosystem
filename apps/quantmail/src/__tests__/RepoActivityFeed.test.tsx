// @vitest-environment jsdom
// ============================================================================
// RepoActivityFeed — the QuantGit repo activity stream inside QuantMail.
//
// Guards the "NaNd" defect: an unparseable activity timestamp must degrade to
// an empty time slot, never the literal "NaNd" text. NaN falls through every
// `min < 1` / `min < 60` / `hr < 24` comparison and the day branch interpolates
// NaN into `${NaN}d`. Mirrors the sibling guards on PeopleList / PersonThread /
// ConversationalThreadView — Number.isNaN(date.getTime()) degrades to ''.
//
// Renders the REAL component with REAL activity items, asserting only
// observable behaviour.
// ============================================================================

import { describe, it, expect, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RepoActivityFeed, formatRelativeTime } from '../components/RepoActivityFeed';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// framer-motion reads matchMedia, which jsdom does not implement. This is a
// test-environment shim, not product behaviour: reduced-motion is off so the
// feed items render their default markup.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(ui: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(ui);
  });
  return container;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

const activity = (id: string, timestamp: string) => ({
  id,
  type: 'commit' as const,
  actor: { name: 'Dev A' },
  message: 'fix: time guard',
  timestamp,
  ref: 'main',
});

describe('formatRelativeTime', () => {
  it('degrades an unparseable timestamp to an empty string, never "NaNd"', () => {
    for (const bad of ['not-a-date', '', 'undefined', 'null', '2026-13-99T99:99:99']) {
      const label = formatRelativeTime(bad);
      expect(label).toBe('');
      expect(label).not.toMatch(/NaN/);
    }
  });

  it('renders valid recent timestamps unchanged', () => {
    const now = Date.now();
    expect(formatRelativeTime(new Date(now - 30_000).toISOString())).toBe('now');
    expect(formatRelativeTime(new Date(now - 5 * 60_000).toISOString())).toBe('5m');
    expect(formatRelativeTime(new Date(now - 2 * 3_600_000).toISOString())).toBe('2h');
    expect(formatRelativeTime(new Date(now - 3 * 86_400_000).toISOString())).toBe('3d');
  });
});

describe('RepoActivityFeed', () => {
  it('renders an empty time slot (never "NaNd") for an activity with an unparseable timestamp', () => {
    const el = render(
      <RepoActivityFeed repoName="quantmail" activities={[activity('a1', 'not-a-date')]} />
    );
    const time = el.querySelector('time.activity-time');
    expect(time).not.toBeNull();
    expect(time!.textContent).toBe('');
    expect(el.textContent).not.toMatch(/NaNd/);
  });

  it('still renders the time label for valid timestamps alongside a broken one', () => {
    const el = render(
      <RepoActivityFeed
        repoName="quantmail"
        activities={[
          activity('a1', 'not-a-date'),
          activity('a2', new Date(Date.now() - 5 * 60_000).toISOString()),
        ]}
      />
    );
    const times = Array.from(el.querySelectorAll('time.activity-time'));
    expect(times).toHaveLength(2);
    expect(times[0].textContent).toBe('');
    expect(times[1].textContent).toBe('5m');
    expect(el.textContent).not.toMatch(/NaNd/);
  });

  it('renders nothing for an empty activity list', () => {
    const el = render(<RepoActivityFeed repoName="quantmail" activities={[]} />);
    expect(el.innerHTML).toBe('');
  });
});
