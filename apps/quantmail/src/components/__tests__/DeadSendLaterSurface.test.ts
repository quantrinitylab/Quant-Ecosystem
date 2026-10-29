// @vitest-environment node
// ============================================================================
// Dead send-later surface: EmailSendLater.tsx must stay deleted.
//
// Root finding (qm-auto, 2026-10-12, [P2] [mobile-inbox]): QuantMail's
// EmailSendLater.tsx was imported/rendered NOWHERE — a dead picker with its
// own globals.css rules — while the mobile thread composer had no
// schedule-send at all. Since then the real fix landed on main: ThreadComposer
// (commit b4d3d678b) and DockedComposer both wire the ONE canonical
// ScheduleSendModal, with the schedule-send behaviour pinned by
// src/__tests__/ThreadComposerScheduleSend.test.tsx (11 tests) and
// src/components/__tests__/DockedComposerScheduleSend.test.tsx. The only
// unfinished half of the finding was the dead code itself, still sitting in
// the tree. This r3 re-dispatch recreates the r2 (PR #1696) deletion on a
// fresh branch off current origin/main; PR #1696 itself was NOT touched,
// pushed to, rebased, or reset.
//
// This suite pins the end-state, so the dead surface cannot silently
// reappear (e.g. via a bad merge resurrecting the file):
//   (a) no EmailSendLater component file exists anywhere under
//       src/components, and no other *SendLater* file either;
//   (b) globals.css carries no .send-later-* rules (the dead picker's
//       styles were its only consumers — verified by grep at deletion);
//   (c) the canonical surface survives the deletion: ScheduleSendModal.tsx
//       exists and BOTH compose surfaces (thread + docked) still import
//       and render it — deleting the dead picker must never be mistaken
//       for deleting schedule-send itself.
//
// These are pure filesystem assertions (readFileSync/readdirSync, the same
// technique the ThreadComposerScheduleSend wiring pins use) — no DOM, no
// mocks, no fake data.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const COMPONENTS_DIR = join(import.meta.dirname, '..');
const GLOBALS_CSS = join(import.meta.dirname, '..', '..', 'app', 'globals.css');

describe('dead send-later surface stays deleted', () => {
  it('no EmailSendLater (or any *SendLater*) component file exists', () => {
    expect(existsSync(join(COMPONENTS_DIR, 'EmailSendLater.tsx'))).toBe(false);
    const sendLaterFiles = readdirSync(COMPONENTS_DIR).filter((name) =>
      /SendLater/.test(name),
    );
    expect(sendLaterFiles).toEqual([]);
  });

  it('globals.css carries no send-later picker rules', () => {
    const css = readFileSync(GLOBALS_CSS, 'utf8');
    expect(css).not.toContain('.send-later-');
    expect(css).not.toContain('Send Later Picker');
  });

  it('the canonical ScheduleSendModal survives and both composers still wire it', () => {
    expect(existsSync(join(COMPONENTS_DIR, 'ScheduleSendModal.tsx'))).toBe(true);
    for (const composer of ['ThreadComposer.tsx', 'DockedComposer.tsx']) {
      const source = readFileSync(join(COMPONENTS_DIR, composer), 'utf8');
      expect(source).toContain("from './ScheduleSendModal'");
      expect(source).toContain('<ScheduleSendModal');
    }
  });
});
