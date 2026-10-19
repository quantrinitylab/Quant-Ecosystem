// ============================================================================
// Orphan-removal guard — mobile PushNotificationService (2026-10-20).
//
// QM-FIX-LOOP finding (2026-10-11 17:00 IST, P2): `src/mobile/push-notifications.ts`
// was a 292-line PushNotificationService with ZERO importers: all state was
// in-memory (Map/badgeCount/scheduled list), there was no native bridge
// (no Capacitor/LocalNotifications anywhere under apps/quantmail/src) so
// nothing could ever deliver, and routeDeepLink() mapped taps to routes that
// do not exist (`/mail/inbox/<id>`, `/mail/thread/<id>`, ...), while the real
// app routes are /inbox and /thread/<id>. The real push path is the web one —
// lib/push-notifications-client.ts + hooks/usePushNotifications.ts (service
// worker / PushManager, tested in push-notifications-client.test.ts).
//
// The file was DELETED. These guards pin the removal so it cannot silently
// come back: re-adding the file, an import/export, a binding, or the bogus
// deep-link route literals trips the gate.
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
const SERVICE_PATH = join(SRC_DIR, 'mobile', 'push-notifications.ts');

// Route literals that existed ONLY in the dead service's routeDeepLink and
// match no real app route (real: /inbox, /thread/<id>). If any of these shows
// up in real source again, the phantom routing is back — fail loudly.
const BOGUS_ROUTE_FRAGMENTS = [
  '/mail/inbox/',
  '/mail/thread/',
  '/mail/newsletters/',
  '/mail/spam',
  '/settings/security/alerts/',
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

describe('orphan-removal guard: mobile PushNotificationService stays deleted', () => {
  it('the service file does not exist on disk', () => {
    expect(existsSync(SERVICE_PATH)).toBe(false);
  });

  it('no source file imports, exports, or binds the dead module', () => {
    const files = walkTsFiles(SRC_DIR);
    const binding = /mobile\/push-notifications|\bPushNotificationService\b/;
    const offenders = files.filter((f) => {
      const code = stripComments(readFileSync(f, 'utf8'));
      return binding.test(code);
    });
    expect(offenders).toEqual([]);
  });

  it('the phantom deep-link routes the dead service claimed do not appear in source', () => {
    const files = walkTsFiles(SRC_DIR);
    const offenders: string[] = [];
    for (const f of files) {
      const code = stripComments(readFileSync(f, 'utf8'));
      if (BOGUS_ROUTE_FRAGMENTS.some((r) => code.includes(r))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
