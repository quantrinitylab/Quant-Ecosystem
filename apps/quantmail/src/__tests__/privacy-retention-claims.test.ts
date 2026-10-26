// ============================================================================
// Privacy policy retention claims — no invented operational specifics.
//
// QM-FIX-LOOP finding (copy-audit, 2026-10-12): the privacy page's retention
// section stated precise operational schedules as fact — a 30-day scrub/shred
// schedule for access logs and disaster-recovery snapshots — with no
// retention/scrubbing/shredding implementation behind them. On origin/main the
// same claims appeared as a 7-day scrub schedule plus a "currently 7 days"
// backup rotation, and the Data Safety matrix repeated the 7-day scrub claim.
//
// What the repo actually proves:
//   - audit logs are IMMUTABLE: DELETE /audit-logs/:id returns 403
//     AUDIT_LOG_IMMUTABLE (backend/routes/audit-logs.ts) — the opposite of a
//     30/7-day destruction schedule;
//   - backup pruning is count-based per schedule (retentionCount in
//     backend/services/backup-snapshot.service.ts) or policy-configurable
//     (retentionDays in backend/services/drive-backup.service.ts) — never a
//     fixed immutable 7/30-day rotation, and nothing "cryptographically shreds";
//   - no mail Trash/Spam auto-purge job exists.
//
// This suite fails loudly if any fixed scrub/shred/purge/rotation schedule
// creeps back into the privacy page. The honest replacement wording ("No fixed
// ... schedule is currently published/in effect") must stay present so the
// section cannot silently revert to an empty claim.
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PRIVACY_PAGE = path.resolve(__dirname, '../app/privacy/page.tsx');
const SOURCE = fs.readFileSync(PRIVACY_PAGE, 'utf8');

// The retention section (section 5) — slice it out so unrelated page copy
// (e.g. "cryptographic token rotation" for session tokens) cannot trip us.
const SECTION_5 = (() => {
  const start = SOURCE.indexOf('5. Data Retention');
  const end = SOURCE.indexOf('6. Contact Information');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return SOURCE.slice(start, end);
})();

// Unprovable schedule claims that must never reappear anywhere on the page.
const FORBIDDEN_ANYWHERE = [
  'scrubbed and',
  'permanently destroyed within',
  'cryptographic shredding',
  'immutable 30-day',
  'currently 7 days',
  'within 7 days',
  'within 30 days',
  'automatically and irrevocably purged',
  'Automatic Purge Schedules',
];

// Schedule language that must not appear inside the retention section itself.
const FORBIDDEN_IN_SECTION_5 = [
  ...FORBIDDEN_ANYWHERE,
  'rotation schedule',
];

describe('privacy page retention claims', () => {
  it('states no invented scrub/shred/purge/rotation schedule anywhere on the page', () => {
    for (const phrase of FORBIDDEN_ANYWHERE) {
      expect(SOURCE).not.toContain(phrase);
    }
  });

  it('states no schedule language inside the retention section', () => {
    for (const phrase of FORBIDDEN_IN_SECTION_5) {
      expect(SECTION_5).not.toContain(phrase);
    }
  });

  it('keeps the honest replacement wording for each retention item', () => {
    expect(SECTION_5).toContain('No automatic purge schedule is currently in effect');
    expect(SECTION_5).toContain('No fixed scrubbing or');
    expect(SECTION_5).toContain('No fixed');
    expect(SECTION_5).toContain('rotation period is currently published');
  });

  it('does not contradict the retention section in the Data Safety matrix', () => {
    // The matrix row for App Performance & Logs must not reintroduce a
    // scrub schedule that section 5 just disclaimed.
    expect(SOURCE).not.toContain('scrubbed within');
  });
});
