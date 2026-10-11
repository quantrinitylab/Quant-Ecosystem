// ============================================================================
// Orphan-removal guard — CalendarRemindersView (2026-10-11).
//
// QM-FIX-LOOP finding (2026-10-11 12:29 IST, P1): CalendarRemindersView was
// orphaned dead code seeded with 4 hardcoded fake reminders presented as the
// user's real tasks ("Review PR #298 for Wave 39 Sovereign Parity",
// "Verify CalDAV RFC 5545 sync with external clients",
// "Prepare QuantMeet 4K screen sharing demo",
// "Update QuantCalendar booking slug availability"). add/toggle/filter mutated
// local useState only — no backend persistence. Zero references outside its
// own test; the 'reminders' context tab renders CalendarScheduleSubView.
//
// The component and its tests were DELETED. These guards pin the removal so it
// cannot silently come back: re-adding the file, an import/export, a JSX
// usage, or the fake seed literals trips the gate.
//
// Guard contract (NOT prose): only real module bindings trip the identifier
// guard — comments/notes mentioning the old name are allowed.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(THIS_DIR, '..');
const COMPONENT_PATH = join(
  SRC_DIR,
  'app',
  'calendar',
  'components',
  'CalendarRemindersView.tsx',
);

// Identifiers of the old, seeded fake reminders. If these literals reappear
// anywhere under apps/quantmail/src, the fake data is back — fail loudly.
const FAKE_REMINDER_TITLES = [
  'Review PR #298 for Wave 39 Sovereign Parity',
  'Verify CalDAV RFC 5545 sync with external clients',
  'Prepare QuantMeet 4K screen sharing demo',
  'Update QuantCalendar booking slug availability',
];

const THIS_FILE = fileURLToPath(import.meta.url);

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (full === THIS_FILE) continue;
    if (entry === 'node_modules') continue;
    const st = statSync(full);
    if (st.isDirectory()) {
      walkTsFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('orphan-removal guard: CalendarRemindersView stays deleted', () => {
  it('the component file does not exist on disk', () => {
    expect(existsSync(COMPONENT_PATH)).toBe(false);
  });

  it('no source file imports, exports, or renders the identifier', () => {
    const files = walkTsFiles(SRC_DIR);
    const binding = /\b(import|export)\b[^;]*\bCalendarRemindersView\b|<CalendarRemindersView\b/;
    const offenders = files.filter((f) => {
      const body = readFileSync(f, 'utf8');
      // Strip comments so historical notes/docs may still mention the old name.
      const code = body
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/.*$/gm, '');
      return binding.test(code);
    });
    expect(offenders).toEqual([]);
  });

  it('the hardcoded fake reminder seed titles do not appear in any source', () => {
    const files = walkTsFiles(SRC_DIR);
    const offenders: string[] = [];
    for (const f of files) {
      const body = readFileSync(f, 'utf8');
      if (FAKE_REMINDER_TITLES.some((t) => body.includes(t))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
