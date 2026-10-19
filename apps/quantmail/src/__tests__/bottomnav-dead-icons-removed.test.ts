// @vitest-environment node
/**
 * QM-MOBILE-NAV-DEAD-ICONS — no unused SVG icon components in the mobile shell.
 *
 * Findings-queue 2026-10-11 [P2] [mobile-nav]: ContextBottomNavBar.tsx carried
 * SVG icon components that were defined but never referenced by any
 * PILLAR_SUB_CONFIGS entry — leftovers from removed tabs, dead bundle weight
 * in the mobile shell. PR #1394 removed 17 of them, but 11 were NOT dead: PR
 * #1392 (merged between #1394's gate run and its merge — a merge-order race)
 * had added references to them in the mobileOverflow tab configs, so the
 * removal left dangling icon references and broke main's typecheck. PR #1398
 * restored the 11 live icons verbatim.
 *
 * Regression contract:
 *  1. The 6 genuinely-dead icon identifiers stay absent from the source.
 *  2. The 11 restored live icons ARE defined in the source.
 *  3. Every icon referenced by PILLAR_SUB_CONFIGS still resolves to a function
 *     (a deletion must never leave a dangling icon reference again).
 *  4. The module's public export surface is unchanged.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import * as mobile from '../components/ContextBottomNavBar';

// The 6 genuinely-dead icon components (zero references anywhere in the file).
const DEAD_ICONS = [
  'PriorityRadarIcon',
  'SwarmAgentIcon',
  'BookingLinkIcon',
  'QuantMeetVideoIcon',
  'RemindersIcon',
  'VipCrownIcon',
] as const;

// The 11 icons PR #1394 wrongly removed and PR #1398 restored — each is
// referenced by a PILLAR_SUB_CONFIGS / mobileOverflow tab entry.
const RESTORED_ICONS = [
  'AgendaTimelineIcon',
  'CalendarEventsTrackerIcon',
  'ScheduleClockIcon',
  'DriveFeedIcon',
  'AiMemoryBrainIcon',
  'SharedFolderIcon',
  'VaultLockIcon',
  'FastCdcCleanerIcon',
  'CompanyBuildingIcon',
  'DedupWandIcon',
  'CirclesNetworkIcon',
] as const;

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../components/ContextBottomNavBar.tsx'),
  'utf8',
);

describe('QM-MOBILE-NAV-DEAD-ICONS — dead SVG icons stay removed', () => {
  it('none of the 6 genuinely-dead icon identifiers appear in the source anymore', () => {
    for (const name of DEAD_ICONS) {
      expect(SOURCE, `dead icon still present: ${name}`).not.toContain(name);
    }
  });

  it('the 11 restored live icons are defined in the source', () => {
    for (const name of RESTORED_ICONS) {
      expect(
        SOURCE,
        `live icon missing from source: ${name}`,
      ).toContain(`function ${name}(`);
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
    expect(defined).not.toEqual(expect.arrayContaining([...DEAD_ICONS]));
  });
});
