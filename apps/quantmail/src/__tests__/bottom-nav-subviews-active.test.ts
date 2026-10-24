// @vitest-environment node
/**
 * QM-BOTTOM-NAV-SUBVIEWS (2026-10-19): the mobile bottom-nav active state
 * went dead in real in-page subviews that are not primary bottom tabs —
 * calendar events/trackers/schedule/feed, drive feed/aimemory/vault/shared/
 * cleaner, contacts groups/companies/dedup. `resolveActiveTab` returned IDs
 * ('events', 'schedule', 'feed', 'shared', 'cleaner', 'groups', ...) that had
 * NO entry in `PILLAR_SUB_CONFIGS`, so `ContextBottomNavBar` found no tab to
 * highlight and rendered zero aria-current on the bottom nav while the user
 * was in those views (and worst case — index-0 fallback — the bar actively
 * lied: Drive "My Drive" stayed highlighted inside the Vault).
 *
 * The fix: these real subviews get `mobileOverflow: true` entries (the bar
 * joins them only while they are the active view, same pattern as mail's
 * Scheduled/Spam/Trash), and the drive resolver stops collapsing
 * ?tab=shared/?tab=cleaner into 'home'.
 *
 * Invariant this suite locks: every tab ID `resolveActiveTab` can return for
 * a pillar MUST exist in that pillar's mobile `PILLAR_SUB_CONFIGS` tabs, so
 * there is always a highlightable tab in every real view.
 */
import { describe, it, expect } from 'vitest';

import {
  PILLAR_SUB_CONFIGS,
  resolveActiveTab,
  type ProductivityPillar,
} from '../components/ContextBottomNavBar';

const paramsOf = (tab: string | null) => ({
  get: (k: string) => (k === 'tab' ? tab : null),
});

function assertNoDeadActiveTabs(
  pillar: ProductivityPillar,
  pathname: string,
  tabValues: Array<string | null>,
) {
  const tabIds = new Set(PILLAR_SUB_CONFIGS[pillar].tabs.map((t) => t.id));
  for (const tab of tabValues) {
    const resolved = resolveActiveTab(pillar, pathname, paramsOf(tab));
    expect(
      tabIds.has(resolved),
      `${pillar} ?tab=${tab} resolves to '${resolved}' — no such tab in the mobile config`,
    ).toBe(true);
  }
}

describe('QM-BOTTOM-NAV-SUBVIEWS — no dead active tab in real subviews', () => {
  it('calendar: every real ?tab= view resolves to a highlightable tab', () => {
    assertNoDeadActiveTabs(
      'calendar',
      '/calendar',
      ['day', 'week', 'month', 'feed', 'agenda', 'events', 'schedule', 'booking', 'quantmeet', 'reminders', null],
    );
  });

  it('calendar: subview tabs are overflow slots with real query targets', () => {
    const tabs = PILLAR_SUB_CONFIGS.calendar.tabs;
    for (const [id, queryValue, label] of [
      ['feed', 'feed', 'Feed'],
      ['events', 'events', 'Trackers'],
      ['schedule', 'schedule', 'Schedule'],
    ] as const) {
      const tab = tabs.find((t) => t.id === id)!;
      expect(tab, `calendar tab '${id}' exists`).toBeDefined();
      expect(tab.label).toBe(label);
      expect(tab.mobileOverflow).toBe(true);
      expect(tab.targetPath).toBe('/calendar');
      expect(tab.queryParam).toEqual({ key: 'tab', value: queryValue });
      expect(typeof tab.icon).toBe('function');
    }
    // Mirrored collapses from resolveActiveTab keep working too.
    expect(resolveActiveTab('calendar', '/calendar', paramsOf('agenda'))).toBe('feed');
    expect(resolveActiveTab('calendar', '/calendar', paramsOf('booking'))).toBe('schedule');
    expect(resolveActiveTab('calendar', '/calendar', paramsOf('quantmeet'))).toBe('schedule');
    expect(resolveActiveTab('calendar', '/calendar', paramsOf('reminders'))).toBe('schedule');
  });

  it('drive: every real ?tab= view resolves to a highlightable tab', () => {
    assertNoDeadActiveTabs(
      'drive',
      '/drive',
      ['home', 'recent', 'starred', 'feed', 'aimemory', 'memory', 'vault', 'shared', 'cleaner', null],
    );
  });

  it('drive: shared/cleaner no longer collapse to home', () => {
    expect(resolveActiveTab('drive', '/drive', paramsOf('shared'))).toBe('shared');
    expect(resolveActiveTab('drive', '/drive', paramsOf('cleaner'))).toBe('cleaner');
  });

  it('drive: subview tabs are overflow slots with real query targets', () => {
    const tabs = PILLAR_SUB_CONFIGS.drive.tabs;
    for (const [id, queryValue] of [
      ['feed', 'feed'],
      ['aimemory', 'aimemory'],
      ['vault', 'vault'],
      ['shared', 'shared'],
      ['cleaner', 'cleaner'],
    ] as const) {
      const tab = tabs.find((t) => t.id === id)!;
      expect(tab, `drive tab '${id}' exists`).toBeDefined();
      expect(tab.mobileOverflow).toBe(true);
      expect(tab.targetPath).toBe('/drive');
      expect(tab.queryParam).toEqual({ key: 'tab', value: queryValue });
      expect(typeof tab.icon).toBe('function');
    }
    expect(tabs.find((t) => t.id === 'aimemory')!.badgeText).toBe('AI');
    // QM vault honesty: no encryption badge until client-side encryption ships.
    expect(tabs.find((t) => t.id === 'vault')!.badgeText).toBeUndefined();
  });

  it('contacts: every real ?tab= view resolves to a highlightable tab', () => {
    assertNoDeadActiveTabs('contacts', '/contacts', ['all', 'favorites', 'groups', 'companies', 'dedup', 'circles', null]);
  });

  it('contacts: subview tabs are overflow slots with real query targets', () => {
    const tabs = PILLAR_SUB_CONFIGS.contacts.tabs;
    for (const [id, label] of [
      ['groups', 'Groups'],
      ['companies', 'Companies'],
      ['dedup', 'Dedup'],
    ] as const) {
      const tab = tabs.find((t) => t.id === id)!;
      expect(tab, `contacts tab '${id}' exists`).toBeDefined();
      expect(tab.label).toBe(label);
      expect(tab.mobileOverflow).toBe(true);
      expect(tab.targetPath).toBe('/contacts');
      expect(tab.queryParam).toEqual({ key: 'tab', value: id });
      expect(typeof tab.icon).toBe('function');
    }
  });

  it('every pillar ends with the Profile tab (opens /settings, highlighted on /settings and /security)', () => {
    for (const pillar of ['mail', 'calendar', 'drive', 'contacts', 'quantgit'] as const) {
      const tabs = PILLAR_SUB_CONFIGS[pillar].tabs;
      const last = tabs[tabs.length - 1];
      expect(last.id, `${pillar} last tab`).toBe('profile');
      expect(last.targetPath).toBe('/settings');
      expect(last.mobileOverflow).toBeFalsy();
      expect(resolveActiveTab(pillar, '/settings', null)).toBe('profile');
      expect(resolveActiveTab(pillar, '/security', null)).toBe('profile');
    }
  });
});
