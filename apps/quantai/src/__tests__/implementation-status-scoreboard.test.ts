/**
 * implementation-status-scoreboard.test.ts
 *
 * Guards the F-198 fix: the A01-A13 "QuantAI - screens" table in
 * docs/quant-architecture/33-implementation-status.md must describe the REAL
 * tree under apps/quantai/src - nothing aspirational, nothing stale.
 *
 * Fails if:
 *  - the doc section is missing or does not carry exactly the 13 A01..A13 rows,
 *  - a row's Status (BUILT / PARTIAL / MISSING) disagrees with ground truth,
 *  - a file the doc names as evidence (backticked) does not exist,
 *  - a route the doc claims absent (e.g. "/ask", "/admin") actually exists,
 *  - a legacy `src/pages/<name>.tsx` the doc leans on has no default export
 *    (Next.js would not route it),
 *  - a line count the doc cites ("(1,483 lines)") drifts beyond tolerance.
 *
 * Style follows the F-191 openapi-docs-consistency guard: pure fs + markdown
 * parsing, no app imports, no new deps.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..', '..'); // apps/quantai
const APP_SRC = path.join(APP_ROOT, 'src');
const REPO_ROOT = path.resolve(APP_ROOT, '..', '..');
const STATUS_MD = path.join(
  REPO_ROOT,
  'docs',
  'quant-architecture',
  '33-implementation-status.md',
);

type RowStatus = 'BUILT' | 'PARTIAL' | 'MISSING';

interface EvidenceFile {
  /** Path under apps/quantai/src. */
  rel: string;
  /**
   * Extra backticked tokens the doc may use instead of the file path,
   * e.g. route-style `/plan` for `app/plan/page.tsx`. Honest only because the
   * file itself is still asserted to exist above.
   */
  aliases?: string[];
}

interface RowGroundTruth {
  status: RowStatus;
  /** Files under apps/quantai/src that must exist AND be named in the row. */
  mustExist: EvidenceFile[];
  /** Route segments under src/app that must have NO page.tsx. */
  noAppPage: string[];
  /** Route segments under src/app/api that must have NO route.ts. */
  noApiRoute: string[];
  /** Legacy pages-router files the doc names; must exist with a default export. */
  legacyPages: string[];
}

const f = (rel: string, aliases?: string[]): EvidenceFile => ({ rel, aliases });

/**
 * Ground truth as verified by F-198 against origin/main.
 * Keep this table honest: it is the test, not a wishlist.
 */
const GROUND_TRUTH: Record<string, RowGroundTruth> = {
  A01: {
    status: 'BUILT',
    mustExist: [f('app/page.tsx')],
    noAppPage: ['ask'],
    noApiRoute: [],
    legacyPages: [],
  },
  A02: { status: 'BUILT', mustExist: [f('components/ModelSelector.tsx')], noAppPage: [], noApiRoute: [], legacyPages: [] },
  A03: { status: 'BUILT', mustExist: [f('app/artifacts/page.tsx')], noAppPage: [], noApiRoute: [], legacyPages: [] },
  A04: {
    status: 'PARTIAL',
    mustExist: [
      f('components/WorkflowBuilder.tsx'),
      f('components/AgentCodeTerminal.tsx'),
      f('components/ToolCallCard.tsx'),
    ],
    noAppPage: ['builder', 'agent-builder'],
    noApiRoute: [],
    legacyPages: [],
  },
  A05: {
    status: 'PARTIAL',
    mustExist: [
      f('components/WorkflowDashboard.tsx'),
      f('components/AgentDashboard.tsx'),
      f('components/WorkflowProgressCard.tsx'),
    ],
    noAppPage: ['runs', 'agents'],
    noApiRoute: [],
    legacyPages: [],
  },
  A06: { status: 'MISSING', mustExist: [], noAppPage: ['approval-queue', 'approvals', 'approval'], noApiRoute: [], legacyPages: [] },
  A07: {
    status: 'PARTIAL',
    mustExist: [f('pages/automation.tsx')],
    noAppPage: ['automation', 'automations'],
    noApiRoute: [],
    legacyPages: ['pages/automation.tsx'],
  },
  A08: {
    status: 'PARTIAL',
    mustExist: [f('pages/memory.tsx')],
    noAppPage: ['memory'],
    noApiRoute: [],
    legacyPages: ['pages/memory.tsx'],
  },
  A09: { status: 'MISSING', mustExist: [], noAppPage: ['playground', 'model-playground'], noApiRoute: [], legacyPages: [] },
  A10: {
    status: 'PARTIAL',
    mustExist: [
      f('components/UsageAnalyticsChart.tsx'),
      f('app/plan/page.tsx', ['/plan']),
      f('app/api/quanty/plan/route.ts', ['/api/quanty/plan']),
    ],
    noAppPage: [],
    noApiRoute: [],
    legacyPages: [],
  },
  A11: {
    status: 'PARTIAL',
    mustExist: [
      f('components/DeviceCard.tsx'),
      f('components/DevicePreview.tsx'),
      f('components/plan/DevicesSection.tsx'),
      f('pages/device.tsx'),
    ],
    noAppPage: ['device', 'devices'],
    noApiRoute: [],
    legacyPages: ['pages/device.tsx'],
  },
  A12: { status: 'BUILT', mustExist: [f('app/settings/page.tsx')], noAppPage: [], noApiRoute: [], legacyPages: [] },
  A13: { status: 'MISSING', mustExist: [], noAppPage: ['admin'], noApiRoute: ['admin'], legacyPages: [] },
};

interface DocRow {
  id: string;
  status: string;
  cells: string[];
  raw: string;
}

function readDocRows(): DocRow[] {
  const text = fs.readFileSync(STATUS_MD, 'utf8');
  const lines = text.split('\n');
  const startIdx = lines.findIndex((l) => /^#{2,4}\s+3\.\s+QuantAI\s+[—–-]\s+screens/.test(l));
  expect(startIdx, 'doc section "3. QuantAI — screens" must exist').toBeGreaterThanOrEqual(0);
  const rows: DocRow[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (/^#{1,4}\s/.test(line) && rows.length > 0) break; // next section
    const m = /^\|\s*(A\d{2})\s*\|(.*)$/.exec(line);
    if (!m) continue;
    const cells = m[2].split('|').map((c) => c.trim());
    // Columns: | ID | Module | Status | Evidence | Gaps vs spec |
    rows.push({ id: m[1], status: (cells[1] ?? '').toUpperCase(), cells, raw: line });
  }
  return rows;
}

/** Backticked tokens in a row's Evidence/Gaps cells. */
function backtickedTokens(row: DocRow): string[] {
  const out: string[] = [];
  const re = /`([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(row.raw)) !== null) out.push(m[1]);
  return out;
}

/**
 * Resolve a doc token to a path under apps/quantai/src.
 * Docs cite both `app/page.tsx` and `src/pages/device.tsx` styles.
 */
function tokenToSrcRel(token: string): string | null {
  const clean = token.split('#')[0].trim();
  if (!/^[A-Za-z0-9_./-]+\.(tsx?|mdx?)$/.test(clean)) return null;
  return clean.startsWith('src/') ? clean.slice(4) : clean;
}

function lineCount(rel: string): number {
  return fs.readFileSync(path.join(APP_SRC, rel), 'utf8').split('\n').length;
}

/** All files under dir whose name is exactly `base`. */
function findByBasename(dir: string, base: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findByBasename(full, base));
    else if (entry.isFile() && entry.name === base) out.push(full);
  }
  return out;
}

describe('implementation-status scoreboard A01-A13 matches the real tree (F-198)', () => {
  it('section carries exactly the 13 rows A01..A13, no dupes', () => {
    const rows = readDocRows();
    const ids = rows.map((r) => r.id).sort();
    expect(ids).toEqual(Object.keys(GROUND_TRUTH).sort());
  });

  it.each(Object.keys(GROUND_TRUTH))('%s status matches ground truth', (id) => {
    const row = readDocRows().find((r) => r.id === id)!;
    expect(row.status).toBe(GROUND_TRUTH[id].status);
  });

  it.each(Object.keys(GROUND_TRUTH))('%s evidence files exist on disk', (id) => {
    const gt = GROUND_TRUTH[id];
    const missing = gt.mustExist.filter(({ rel }) => !fs.existsSync(path.join(APP_SRC, rel)));
    expect(missing.map((e) => e.rel)).toEqual([]);
  });

  it.each(Object.keys(GROUND_TRUTH))('%s evidence files are named in the doc row (unambiguous)', (id) => {
    const row = readDocRows().find((r) => r.id === id)!;
    const tokens = backtickedTokens(row);
    const bad: string[] = [];
    for (const { rel, aliases = [] } of GROUND_TRUTH[id].mustExist) {
      const base = path.basename(rel);
      const accepted = [rel, `src/${rel}`, base, ...aliases];
      const used = accepted.filter((a) => tokens.includes(a));
      if (used.length === 0) {
        bad.push(`${rel}: not named in doc row (expected one of: ${accepted.join(', ')})`);
        continue;
      }
      // A bare basename is only honest if it resolves to exactly one file.
      // (When the doc uses the full path or a route alias, basename
      // uniqueness does not matter.)
      if (used.every((u) => u === base)) {
        const hits = findByBasename(APP_SRC, base);
        if (hits.length !== 1 || hits[0] !== path.join(APP_SRC, rel)) {
          bad.push(`${rel}: basename "${base}" is ambiguous (${hits.length} matches) - doc must use the full path`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('cited line counts are within tolerance of the real files', () => {
    const drift: string[] = [];
    for (const row of readDocRows()) {
      const re = /`([^`]+)`\s*\(([0-9,]+)\s+lines\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(row.raw)) !== null) {
        const rel = tokenToSrcRel(m[1]);
        if (!rel || !fs.existsSync(path.join(APP_SRC, rel))) continue;
        const claimed = Number(m[2].replace(/,/g, ''));
        const actual = lineCount(rel);
        const tolerance = Math.max(20, Math.ceil(claimed * 0.05));
        if (Math.abs(actual - claimed) > tolerance) {
          drift.push(`${row.id} ${m[1]}: doc says ${claimed} lines, file has ${actual}`);
        }
      }
    }
    expect(drift).toEqual([]);
  });

  it('routes the doc claims absent really have no page.tsx', () => {
    const present: string[] = [];
    for (const [id, gt] of Object.entries(GROUND_TRUTH)) {
      for (const seg of gt.noAppPage) {
        const p = path.join(APP_SRC, 'app', seg, 'page.tsx');
        if (fs.existsSync(p)) present.push(`${id}: /${seg} exists at ${path.relative(REPO_ROOT, p)}`);
      }
    }
    expect(present).toEqual([]);
  });

  it('api routes the doc claims absent really have no route.ts', () => {
    const present: string[] = [];
    for (const [id, gt] of Object.entries(GROUND_TRUTH)) {
      for (const seg of gt.noApiRoute) {
        const p = path.join(APP_SRC, 'app', 'api', seg, 'route.ts');
        if (fs.existsSync(p)) present.push(`${id}: /api/${seg} exists`);
      }
    }
    expect(present).toEqual([]);
  });

  it('legacy pages-router files the doc names are real routed pages (default export)', () => {
    const bad: string[] = [];
    for (const [id, gt] of Object.entries(GROUND_TRUTH)) {
      for (const rel of gt.legacyPages) {
        const p = path.join(APP_SRC, rel);
        if (!fs.existsSync(p)) {
          bad.push(`${id}: ${rel} missing`);
          continue;
        }
        const src = fs.readFileSync(p, 'utf8');
        if (!/export\s+default\b/.test(src)) bad.push(`${id}: ${rel} has no default export (not routed)`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('negative control: the absence checks are not vacuous', () => {
    // A path we KNOW does not exist must be reported absent by the same
    // fs.existsSync machinery the real assertions rely on.
    expect(fs.existsSync(path.join(APP_SRC, 'app', 'never-built-guard', 'page.tsx'))).toBe(false);
    // And a real file must be reported present (machinery sees positives too).
    expect(fs.existsSync(path.join(APP_SRC, 'app', 'page.tsx'))).toBe(true);
  });
});
