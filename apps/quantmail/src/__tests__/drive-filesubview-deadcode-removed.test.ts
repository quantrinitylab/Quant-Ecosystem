// @vitest-environment node
/**
 * Findings-queue 2026-10-11 [P2] [drive]: DriveFilesSubView.tsx rendered
 * invented infra-marketing claims ("FastCDC Deduped" per-file badges,
 * "CAS: 64KB" storage internals, "All objects backed by FastCDC 64KB CAS",
 * quota-meter "Enterprise Sovereign Cloud" / "FastCDC Content-Defined
 * Chunking · Zero-Egress Storage") with no backend data behind them. PR #1041
 * stripped the rendered claims, but the component itself was dead code —
 * imported in drive/page.tsx yet never rendered. This PR deletes the file.
 *
 * Regression contract:
 *  1. The component file no longer exists.
 *  2. Its identifiers appear nowhere in the drive surface source.
 *  3. The live drive surface carries no invented infra-marketing claims.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const DRIVE_DIR = path.resolve(__dirname, '../app/drive');
const DELETED_FILE = path.join(DRIVE_DIR, 'components/DriveFilesSubView.tsx');

// The exact invented claims the finding called out — none are driven by
// backend data, so none may appear in live drive source.
const INVENTED_CLAIMS = [
  'Enterprise Sovereign Cloud',
  'FastCDC Content-Defined Chunking',
  'Zero-Egress',
  'All objects backed by FastCDC',
  'CAS: 64KB',
  'FastCDC Deduped',
] as const;

function readAllDriveSource(): string {
  const chunks: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(entry.name)) chunks.push(fs.readFileSync(p, 'utf8'));
    }
  };
  walk(DRIVE_DIR);
  return chunks.join('\n');
}

describe('dead code removal: DriveFilesSubView', () => {
  it('the component file is gone', () => {
    expect(fs.existsSync(DELETED_FILE), 'DriveFilesSubView.tsx still exists').toBe(false);
  });

  it('no DriveFilesSubView identifiers remain anywhere in the drive surface', () => {
    const src = readAllDriveSource();
    expect(src, 'DriveFilesSubView identifier still referenced').not.toContain(
      'DriveFilesSubView',
    );
  });
});

describe('live drive surface: no invented infra claims', () => {
  it('none of the invented infra-marketing claims appear in live drive source', () => {
    const src = readAllDriveSource();
    for (const claim of INVENTED_CLAIMS) {
      expect(src, `invented infra claim still present: ${claim}`).not.toContain(claim);
    }
  });
});
