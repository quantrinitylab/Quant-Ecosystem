// QC-F-487 — call/meet dock overflow: source-contract + arithmetic pins
// (specialist-qc-f-487-buildprep.md §8.2 File B, cases T5–T6).
//
// This is a DECLARED-structure parkh, not a pixel parkh (brief §7):
// jsdom has no layout, so the tests pin (a) the exact source contract
// the fix is built from — responsive presentation on the two DOCK sites
// only, the sound button in its own row above the calls dock, relative
// anchoring on both docks — and (b) the intrinsic-width arithmetic
// those classes declare, tied back to the classes themselves so the
// table cannot float free of the code. Real 390px pixel proof is the
// live gate HG-487-1.
//
// Negative-control signature: on the ORIGINAL code T5 FAILS outright
// (no presentation="responsive" anywhere, the sound button sits AFTER
// the pb-10 marker inside the dock row, no relative on either dock)
// and T6's class pins FAIL (no h-12 w-12 trigger in BackgroundBlur.tsx).
// T6's arithmetic itself is a band table (guard) and passes both ways.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(testDir, '../..');
const repoRoot = resolve(appRoot, '../..');

const callsSrc = readFileSync(resolve(appRoot, 'src/app/calls/[callId]/page.tsx'), 'utf8');
const meetSrc = readFileSync(resolve(appRoot, 'src/app/meet/[roomId]/page.tsx'), 'utf8');
const blurSrc = readFileSync(
  resolve(repoRoot, 'packages/shared-ui/src/components/Media/BackgroundBlur.tsx'),
  'utf8',
);

const occurrences = (src: string, needle: string) => src.split(needle).length - 1;

describe('QC-F-487 dock overflow — source contract (T5)', () => {
  it('calls: dock BackgroundBlur is responsive, sound button is in its own row BEFORE the dock row, dock is relative', () => {
    expect(occurrences(callsSrc, 'presentation="responsive"')).toBe(1);
    expect(callsSrc).toContain('relative pb-10 pt-4');
    const soundIdx = callsSrc.indexOf('Tap to enable sound');
    const dockIdx = callsSrc.indexOf('pb-10 pt-4');
    expect(soundIdx).toBeGreaterThanOrEqual(0);
    expect(dockIdx).toBeGreaterThanOrEqual(0);
    expect(soundIdx).toBeLessThan(dockIdx);
  });

  it('meet: only the DOCK BackgroundBlur is responsive (pre-join untouched), dock is relative, responsive site sits after the Control dock marker', () => {
    expect(occurrences(meetSrc, 'presentation="responsive"')).toBe(1);
    expect(meetSrc).toContain(
      'relative flex items-center justify-center gap-3 bg-gray-900 px-4 py-4',
    );
    const dockMarker = meetSrc.indexOf('Control dock');
    expect(dockMarker).toBeGreaterThanOrEqual(0);
    expect(meetSrc.indexOf('presentation="responsive"')).toBeGreaterThan(dockMarker);
    // Everything before the dock (incl. the pre-join studio) carries no
    // presentation prop at all — the pre-join render stays default inline.
    expect(meetSrc.slice(0, dockMarker)).not.toContain('presentation');
  });
});

describe('QC-F-487 dock overflow — arithmetic table tied to source classes (T6)', () => {
  it('post-fix intrinsic widths fit: calls row 296 <= 390, meet row 336 <= 358', () => {
    // Calls: mic 56 + end 64 + camera 56 + compact trigger 48 + gaps 3x24.
    expect(56 + 64 + 56 + 48 + 24 * 3).toBe(296);
    expect(296).toBeLessThanOrEqual(390);
    // Meet: mic/camera/hand 48x3 + trigger 48 + Leave ~96 + gaps 4x12.
    expect(48 + 48 + 48 + 48 + 96 + 12 * 4).toBe(336);
    expect(336).toBeLessThanOrEqual(358);
  });

  it('the table numbers are the classes the sources actually declare', () => {
    // Compact trigger is a 48px circle in the component itself.
    expect(blurSrc).toContain('h-12 w-12');
    expect(blurSrc).toContain('blur-menu-trigger');
    // Calls dock buttons: mic/camera w-14 (56), end w-16 (64).
    expect(callsSrc).toContain('w-14 h-14');
    expect(callsSrc).toContain('w-16 h-16');
    // Meet dock buttons h-12 (48) and Leave h-12 + px-6 (~96 wide).
    expect(meetSrc).toContain('data-testid="leave-meeting"');
    expect(meetSrc).toContain('h-12 items-center justify-center gap-2 rounded-full bg-red-600 px-6');
    expect(meetSrc).toContain('data-testid="toggle-mic"');
  });
});
