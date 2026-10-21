// @vitest-environment jsdom
// ============================================================================
// drive-tabpanel-contract — CODEX-REVIEW 6308908145 corrective (PR #1456).
//
// P1: the Files tab declared aria-controls="drive-panel-files" but page.tsx
// rendered DriveHomeSubView for BOTH home and files with the hard-coded
// id="drive-panel-home" — a second selected tab for the same Home panel,
// pointing at a nonexistent panel ID. The fix gives each tab its own panel
// identity via the single drivePanelIdentity() source of truth.
// P2: the tablist was not keyboard-operable (roving tabindex + onClick
// only). ArrowLeft/ArrowRight/Home/End must move focus AND activate.
// Cleaner: without scan data the tab must show the honest "No scan yet"
// state — never the false-clean "No duplicates found".
//
// Mounted tests (createRoot + act), NOT static-HTML snapshots: the old
// static-HTML header tests could not detect the panel mismatch.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  DriveContextTabsHeader,
  drivePanelIdentity,
  type DriveSubTab,
} from '../app/drive/components/DriveContextTabsHeader';
import {
  DriveHomeSubView,
  type DriveItem,
} from '../components/DriveSubViews';
import { DriveCleanerSubView } from '../app/drive/components/DriveCleanerSubView';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
let host: HTMLDivElement | null = null;

function render(ui: React.ReactElement): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(ui);
  });
  return host;
}

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
  }
  root = null;
  host?.remove();
  host = null;
});

const ALL_TABS: DriveSubTab[] = [
  'home',
  'recent',
  'feed',
  'aimemory',
  'vault',
  'files',
  'shared',
  'starred',
  'cleaner',
];

const realFile = (over: Partial<DriveItem> = {}): DriveItem => ({
  id: 'f-report-q3',
  name: 'report-q3.pdf',
  type: 'file',
  mimeType: 'application/pdf',
  size: 48210,
  modifiedAt: '2026-10-20T10:00:00.000Z',
  ...over,
});

function tabButton(container: ParentNode, tab: DriveSubTab): HTMLButtonElement {
  const el = container.querySelector<HTMLButtonElement>(`#drive-tab-${tab}`);
  if (!el) throw new Error(`tab button #drive-tab-${tab} not found`);
  return el;
}

function keydown(el: Element, key: string) {
  act(() => {
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
  });
}

// Mirrors page.tsx's wiring: the rendered panel identity ALWAYS comes from
// drivePanelIdentity(activeTab) — the same source the header uses.
function HeaderAndPanelHarness({
  initialTab = 'home',
}: {
  initialTab?: DriveSubTab;
}) {
  const [tab, setTab] = useState<DriveSubTab>(initialTab);
  const identity = drivePanelIdentity(tab);
  return (
    <>
      <DriveContextTabsHeader activeTab={tab} onTabChange={setTab} />
      <DriveHomeSubView
        panelId={identity.panelId}
        labelledBy={identity.labelledBy}
        files={[realFile()]}
      />
    </>
  );
}

describe('drivePanelIdentity — single source of truth', () => {
  it('maps every tab to matching drive-panel-<tab> / drive-tab-<tab> IDs', () => {
    for (const tab of ALL_TABS) {
      const identity = drivePanelIdentity(tab);
      expect(identity.panelId).toBe(`drive-panel-${tab}`);
      expect(identity.labelledBy).toBe(`drive-tab-${tab}`);
    }
  });
});

describe('P1 — Files tab renders its own panel (mounted)', () => {
  it('selecting Files renders drive-panel-files with real file content, not a duplicate home panel', () => {
    const el = render(<HeaderAndPanelHarness initialTab="home" />);

    // Home state first: home tab selected, home panel rendered.
    expect(tabButton(el, 'home').getAttribute('aria-selected')).toBe('true');
    expect(el.querySelector('#drive-panel-home')).not.toBeNull();

    // Select the Files tab.
    act(() => {
      tabButton(el, 'home');
    });
    const filesTab = tabButton(el, 'files');
    act(() => {
      filesTab.click();
    });

    // The Files tab is now the selected tab and declares its own panel.
    expect(filesTab.getAttribute('aria-selected')).toBe('true');
    expect(filesTab.getAttribute('aria-controls')).toBe('drive-panel-files');

    // Its panel EXISTS with the matching id + labelledby (the old bug:
    // aria-controls pointed at a nonexistent drive-panel-files).
    const panel = el.querySelector('#drive-panel-files');
    expect(panel).not.toBeNull();
    expect(panel!.getAttribute('role')).toBe('tabpanel');
    expect(panel!.getAttribute('aria-labelledby')).toBe('drive-tab-files');

    // The panel carries REAL file content — not an empty shell.
    expect(panel!.textContent).toContain('report-q3.pdf');

    // And it is NOT a second copy of the home panel.
    expect(el.querySelector('#drive-panel-home')).toBeNull();
  });

  it('every header tab declares an aria-controls target its panel can satisfy', () => {
    const el = render(<HeaderAndPanelHarness initialTab="files" />);
    for (const tab of ALL_TABS) {
      const btn = tabButton(el, tab);
      expect(btn.getAttribute('aria-controls')).toBe(`drive-panel-${tab}`);
    }
    // Files starts selected here: its own panel is rendered, home's is not.
    expect(el.querySelector('#drive-panel-files')).not.toBeNull();
    expect(el.querySelector('#drive-panel-home')).toBeNull();
  });
});

describe('P2 — keyboard-operable tablist (mounted)', () => {
  it('ArrowRight/ArrowLeft move focus and activate tabs; Home/End jump', () => {
    const onTabChange = vi.fn();
    function Controlled() {
      const [tab, setTab] = useState<DriveSubTab>('home');
      return (
        <DriveContextTabsHeader
          activeTab={tab}
          onTabChange={(t) => {
            onTabChange(t);
            setTab(t);
          }}
        />
      );
    }
    const el = render(<Controlled />);

    const homeBtn = tabButton(el, 'home');
    act(() => {
      homeBtn.focus();
    });
    expect(document.activeElement).toBe(homeBtn);

    // Tab order: home, recent, feed, aimemory, vault, files, shared, starred, cleaner.
    // ArrowRight: activates + focuses Recent (next tab).
    keydown(homeBtn, 'ArrowRight');
    expect(onTabChange).toHaveBeenLastCalledWith('recent');
    const recentBtn = tabButton(el, 'recent');
    expect(document.activeElement).toBe(recentBtn);
    expect(recentBtn.getAttribute('aria-selected')).toBe('true');
    // Roving tabindex followed the active tab.
    expect(recentBtn.tabIndex).toBe(0);
    expect(tabButton(el, 'home').tabIndex).toBe(-1);

    // ArrowLeft: back to Home.
    keydown(recentBtn, 'ArrowLeft');
    expect(onTabChange).toHaveBeenLastCalledWith('home');
    expect(document.activeElement).toBe(tabButton(el, 'home'));

    // End: jumps to the last tab (Cleaner) and activates it.
    keydown(tabButton(el, 'home'), 'End');
    expect(onTabChange).toHaveBeenLastCalledWith('cleaner');
    expect(document.activeElement).toBe(tabButton(el, 'cleaner'));

    // Home: jumps back to the first tab (Home).
    keydown(tabButton(el, 'cleaner'), 'Home');
    expect(onTabChange).toHaveBeenLastCalledWith('home');
    expect(document.activeElement).toBe(tabButton(el, 'home'));

    // Arrow keys wrap around the ends.
    keydown(tabButton(el, 'home'), 'ArrowLeft');
    expect(onTabChange).toHaveBeenLastCalledWith('cleaner');
    keydown(tabButton(el, 'cleaner'), 'ArrowRight');
    expect(onTabChange).toHaveBeenLastCalledWith('home');
  });

  it('unrelated keys do not change the active tab', () => {
    const onTabChange = vi.fn();
    const el = render(
      <DriveContextTabsHeader activeTab="home" onTabChange={onTabChange} />,
    );
    keydown(tabButton(el, 'home'), 'Enter');
    keydown(tabButton(el, 'home'), 'a');
    expect(onTabChange).not.toHaveBeenCalled();
  });
});

describe('Cleaner — honest idle without scan data (mounted)', () => {
  it('shows "No scan yet", never the false-clean "No duplicates found"', () => {
    const el = render(<DriveCleanerSubView hasScanned={false} />);
    expect(el.textContent).toContain('No scan yet');
    expect(el.textContent).not.toContain('No duplicates found');
    expect(el.textContent).not.toContain('Your Drive looks clean');
    // Panel identity still satisfies the tab contract.
    const panel = el.querySelector('#drive-panel-cleaner');
    expect(panel).not.toBeNull();
    expect(panel!.getAttribute('aria-labelledby')).toBe('drive-tab-cleaner');
  });

  it('shows real clusters after a completed scan', () => {
    const el = render(
      <DriveCleanerSubView
        hasScanned
        clusters={[
          {
            clusterId: 'h1',
            title: '2 files with identical content',
            similarity: 'Exact match — identical content hash',
            potentialSavings: '4.2 MB',
            files: [
              {
                id: 'a',
                name: 'photo.jpg',
                path: '/Photos/photo.jpg',
                size: '2.1 MB',
                modified: '2026-10-01',
                isOriginal: true,
              },
              {
                id: 'b',
                name: 'photo (1).jpg',
                path: '/Photos/photo (1).jpg',
                size: '2.1 MB',
                modified: '2026-10-02',
              },
            ],
          },
        ]}
      />,
    );
    expect(el.textContent).toContain('2 files with identical content');
    expect(el.textContent).toContain('photo (1).jpg');
    expect(el.textContent).not.toContain('No scan yet');
  });

  it('surfaces scan errors honestly via role=alert', () => {
    const el = render(
      <DriveCleanerSubView hasScanned={false} scanError="network timeout" />,
    );
    const alert = el.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toContain('network timeout');
  });
});
