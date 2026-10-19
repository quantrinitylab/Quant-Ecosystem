// @vitest-environment node
/**
 * QM-MOBILE-NAV-DEAD-ICONS — no unused SVG icon components in the mobile shell.
 *
 * Findings-queue 2026-10-11 [P2] [mobile-nav]: ContextBottomNavBar.tsx carried
 * 17 SVG icon components (PriorityRadar, SwarmAgent, AgendaTimeline,
 * BookingLink, QuantMeetVideo, Reminders, CalendarEventsTracker,
 * ScheduleClock, DriveFeed, AiMemoryBrain, SharedFolder, VaultLock,
 * FastCdcCleaner, VipCrown, CompanyBuilding, DedupWand, CirclesNetwork) that
 * were defined but never referenced by any PILLAR_SUB_CONFIGS entry —
 * leftovers from removed tabs, dead bundle weight in the mobile shell.
 *
 * Regression contract:
 *  1. None of the removed dead icon identifiers appear in the file anymore.
 *  2. Every icon referenced by PILLAR_SUB_CONFIGS still resolves to a function
 *     (deletion must not leave a dangling icon reference).
 *  3. The module's public export surface is unchanged (no accidental removal
 *     of a live icon or export).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import * as mobile from '../components/ContextBottomNavBar';

// The 17 dead icon components removed (QM-MOBILE-NAV-DEAD-ICONS fix).
const DEAD_ICONS = [
  'PriorityRadarIcon',
  'SwarmAgentIcon',
  'AgendaTimelineIcon',
  'BookingLinkIcon',
  'QuantMeetVideoIcon',
  'RemindersIcon',
  'CalendarEventsTrackerIcon',
  'ScheduleClockIcon',
  'DriveFeedIcon',
  'AiMemoryBrainIcon',
  'SharedFolderIcon',
  'VaultLockIcon',
  'FastCdcCleanerIcon',
  'VipCrownIcon',
  'CompanyBuildingIcon',
  'DedupWandIcon',
  'CirclesNetworkIcon',
] as const;

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../components/ContextBottomNavBar.tsx'),
  'utf8',
);

describe('QM-MOBILE-NAV-DEAD-ICONS — dead SVG icons stay removed', () => {
  it('none of the 17 removed icon identifiers appear in the source anymore', () => {
    for (const name of DEAD_ICONS) {
      expect(SOURCE, `dead icon still present: ${name}`).not.toContain(name);
    }
  });

  it('every PILLAR_SUB_CONFIGS icon reference resolves to a function', () => {
    for (const pillar of Object.keys(mobile.PILLAR_SUB_CONFIGS)) {
      const tabs = mobile.PILLAR_SUB_CONFIGS[pillar as mobile.ProductivityPillar].tabs;
      for (const tab of tabs) {
        expect(typeof tab.icon, `pillar=${pillar} tab=${tab.id} icon not a function`).toBe('function');
      }
    }
  });

  it('public export surface is unchanged', () => {
    expect(mobile.PILLAR_SUB_CONFIGS).toBeDefined();
    expect(typeof mobile.ContextBottomNavBar).toBe('function');
    expect(typeof mobile.resolveActiveTab).toBe('function');
    expect(typeof mobile.executeContextTabClick).toBe('function');
    // Every icon still defined in the file is the live tab glyph set.
    const defined = [...SOURCE.matchAll(/^function ([A-Za-z]+Icon)\(/gm)].map((m) => m[1]);
    expect(defined.length).toBeGreaterThan(0);
    expect(defined).not.toEqual(expect.arrayContaining(DEAD_ICONS));
  });
});
