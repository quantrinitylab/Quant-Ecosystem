// ============================================================================
// Orphan-removal guard — dead `src/mobile/` abstraction suite (2026-10-20).
//
// QM-FIX-LOOP finding (2026-10-11 17:27 IST, P2): `src/mobile/gestures.ts`
// held a 229-line GestureService that was never imported by any file — the
// only occurrence of "GestureService" in apps/quantmail/src was the file
// itself, its registered default gestures (swipe_left_archive,
// swipe_right_mark_unread, double_tap_star, long_press_context_menu,
// pinch_zoom, edge_swipe_back, pan_scroll) were phantom (nothing fed touch
// events into the class), and the real gesture work lives in
// SwipeableEmailRow + lib/touch-swipe-machine.ts + useEdgeSwipeBack.
// A repo-wide import check showed the same was true of every other module in
// the directory (accessibility, app-state, biometric-auth, camera,
// deep-linking, haptics, location, offline-sync, share-extension, widgets):
// zero importers, zero dynamic imports, zero symbol bindings outside the
// directory. The whole `src/mobile/` directory was DELETED.
//
// These guards pin the removal so it cannot silently come back: re-adding a
// module, an import/export, a binding, or the bogus gesture registrations
// trips the gate.
//
// Guard contract (NOT prose): only real module bindings trip the identifier
// guard — comments/notes mentioning the old names are allowed.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(THIS_DIR, '..');
const MOBILE_DIR = join(SRC_DIR, 'mobile');

// Modules deleted from src/mobile/ (2026-10-20) after a repo-wide
// zero-importer check. Re-adding any of them under these names trips the
// binding guard below.
const DELETED_MODULES = [
  'accessibility',
  'app-state',
  'biometric-auth',
  'camera',
  'deep-linking',
  'gestures',
  'haptics',
  'location',
  'offline-sync',
  'share-extension',
  'widgets',
];

// Service-class symbols that existed ONLY in the deleted modules.
const DELETED_SERVICE_CLASSES = [
  'GestureService',
  'AppStateService',
  'BiometricAuthService',
  'HapticsService',
  'ShareExtensionService',
];

// Gesture registrations that lived ONLY in the dead GestureService — phantom
// ids nothing ever consumed (the real gesture work is SwipeableEmailRow +
// lib/touch-swipe-machine.ts + useEdgeSwipeBack).
const PHANTOM_GESTURE_IDS = [
  'swipe_left_archive',
  'swipe_right_mark_unread',
  'double_tap_star',
  'long_press_context_menu',
  'pinch_zoom',
  'edge_swipe_back',
  'pan_scroll',
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

function stripComments(body: string): string {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '');
}

describe('orphan-removal guard: dead src/mobile/ abstraction suite stays deleted', () => {
  it('no TypeScript module remains under src/mobile/', () => {
    if (!existsSync(MOBILE_DIR)) return; // whole dir gone: strongest pass
    const leftover = readdirSync(MOBILE_DIR).filter((e) => /\.(ts|tsx)$/.test(e));
    expect(leftover).toEqual([]);
  });

  it('no source file imports, exports, or binds a deleted mobile module', () => {
    const files = walkTsFiles(SRC_DIR);
    const offenders: string[] = [];
    for (const f of files) {
      const code = stripComments(readFileSync(f, 'utf8'));
      const hitModule = DELETED_MODULES.some((m) =>
        new RegExp(`mobile\\/${m}\\b`).test(code),
      );
      const hitClass = DELETED_SERVICE_CLASSES.some((c) =>
        new RegExp(`\\b${c}\\b`).test(code),
      );
      if (hitModule || hitClass) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it('the phantom gesture registrations the dead service claimed do not appear in source', () => {
    const files = walkTsFiles(SRC_DIR);
    const offenders: string[] = [];
    for (const f of files) {
      const code = stripComments(readFileSync(f, 'utf8'));
      if (PHANTOM_GESTURE_IDS.some((g) => code.includes(g))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
