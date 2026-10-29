// ============================================================================
// Orphan-removal guard — EmailScheduleTimeline (2026-10-25).
//
// QM-FIX-LOOP finding (2026-10-11 23:55 IST, P2, compose):
// `src/components/EmailScheduleTimeline.tsx` was a 101-line component with
// ZERO importers anywhere in src. Its header comment carried an invented
// competitor claim ("Gmail buries scheduled emails in a hidden 'Scheduled'
// folder...") for a component that never rendered. The real scheduled-send
// surface already exists and is fully wired — `src/app/scheduled/page.tsx`
// (GET /emails?folderType=SCHEDULED, cancel + edit with race honesty) —
// so wiring this second, duplicate presentation in would have added a
// parallel Cancel/Edit surface, not fixed anything. It was DELETED, along
// with its orphaned `.schedule-timeline` CSS block in globals.css.
//
// These guards pin the removal so it cannot silently come back: re-adding
// the file, an import/export/binding, or the orphaned CSS classes trips
// the gate.
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
const COMPONENT_PATH = join(SRC_DIR, 'components', 'EmailScheduleTimeline.tsx');
const GLOBALS_CSS_PATH = join(SRC_DIR, 'app', 'globals.css');

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

function stripComments(body: string): string {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '');
}

describe('orphan-removal guard: EmailScheduleTimeline stays deleted', () => {
  it('the component file does not exist on disk', () => {
    expect(existsSync(COMPONENT_PATH)).toBe(false);
  });

  it('no source file imports, exports, or binds the dead component', () => {
    const files = walkTsFiles(SRC_DIR);
    const binding = /EmailScheduleTimeline/;
    const offenders = files.filter((f) => {
      const code = stripComments(readFileSync(f, 'utf8'));
      return binding.test(code);
    });
    expect(offenders).toEqual([]);
  });

  it('the orphaned schedule-timeline CSS classes do not remain in globals.css', () => {
    const css = readFileSync(GLOBALS_CSS_PATH, 'utf8');
    expect(css).not.toContain('schedule-timeline');
  });

  it('the real scheduled-send surface is still intact (the deletion removed no live code)', () => {
    // The live surface the dead component duplicated: the /scheduled page
    // plus the schedule-send modal used by the composers.
    expect(existsSync(join(SRC_DIR, 'app', 'scheduled', 'page.tsx'))).toBe(true);
    expect(existsSync(join(SRC_DIR, 'components', 'ScheduleSendModal.tsx'))).toBe(true);
  });
});
