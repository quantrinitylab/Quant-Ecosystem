import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * P0 regression guard (QM-UIUX-071): the Canvas 2D API throws on raw
 * `var(--token)` strings. Every canvas color assignment in these files must
 * go through `resolveCanvasColor()` — a future codemod that drops a bare
 * `'var(--...)'` into `addColorStop`/`fillStyle`/`strokeStyle`/`shadowColor`
 * fails this test instead of crashing the login page in production.
 */
const CANVAS_SOURCES = [
  '../marks/canvas-mark.ts',
  '../../components/TitaniumGridCanvas.tsx',
  '../../components/QuantMailLogo.tsx',
  '../../components/QuantGitLogo.tsx',
  '../../components/QuantDriveLogo.tsx',
  '../../components/AgentOfficeCanvas.tsx',
  '../../components/Interactive3DLogo.tsx',
  '../../app/lab/marks/DinosaurMarkCandidate.tsx',
];

const CANVAS_ASSIGN_RE =
  /(addColorStop\(\s*[\d.]+,\s*|fillStyle\s*=\s*|strokeStyle\s*=\s*|shadowColor\s*=\s*)(['"`])(.*?)\2/g;

describe('canvas var() regression guard', () => {
  for (const rel of CANVAS_SOURCES) {
    it(`no raw var() reaches canvas in ${rel}`, () => {
      const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
      const offenders: string[] = [];
      let m: RegExpExecArray | null;
      CANVAS_ASSIGN_RE.lastIndex = 0;
      while ((m = CANVAS_ASSIGN_RE.exec(src)) !== null) {
        const colorExpr = m[3];
        // Allowed: wrapped in resolveCanvasColor(...), or a literal without var().
        if (colorExpr.includes('var(') && !colorExpr.includes('resolveCanvasColor')) {
          offenders.push(`${m[1]}'${colorExpr}'`);
        }
      }
      expect(offenders).toEqual([]);
    });
  }
});
