// @vitest-environment node
// ============================================================================
// mail-notification-mode — the "important mail only" gap.
//
// Contracts under test:
//   1. normalizeMailNotificationMode: the three modes pass through; anything
//      else (missing, wrong type, unknown string) falls back to 'all', which
//      preserves the old every-mail behaviour for users who never chose.
//   2. readMailNotificationModeFromPreferences: reads the single documented
//      `User.preferences` key; ignores non-object preferences.
//   3. isImportantMail: reads the real classification infra — isImportant /
//      isStarred / HIGH+ priority win outright; otherwise the smart-inbox
//      partition decides (primary = personal mail). Missing signals fail
//      OPEN (notify), matching the ingest path's uncategorized => Primary.
//   4. readUserMailNotificationMode: store failure fails open to 'all' — a
//      mode read must never cost the user a notification.
//   5. writeUserMailNotificationMode: merges into the existing preferences
//      JSON, preserving unrelated keys.
// ============================================================================

import { describe, expect, it, vi } from 'vitest';
import {
  isImportantMail,
  normalizeMailNotificationMode,
  readMailNotificationModeFromPreferences,
  readUserMailNotificationMode,
  writeUserMailNotificationMode,
  type MailNotificationModeStore,
} from '../services/mail-notification-mode.service';

describe('normalizeMailNotificationMode', () => {
  it.each(['all', 'important', 'off'] as const)('passes through %s', (mode) => {
    expect(normalizeMailNotificationMode(mode)).toBe(mode);
  });

  it.each([undefined, null, '', 'everything', 'ALL', 0, 1, true, {}, []])(
    'falls back to all for %p',
    (value) => {
      expect(normalizeMailNotificationMode(value)).toBe('all');
    },
  );
});

describe('readMailNotificationModeFromPreferences', () => {
  it('reads the documented key', () => {
    expect(
      readMailNotificationModeFromPreferences({ mailNotificationMode: 'important' }),
    ).toBe('important');
  });

  it('defaults to all when the key is absent or the preferences are not an object', () => {
    expect(readMailNotificationModeFromPreferences({})).toBe('all');
    expect(readMailNotificationModeFromPreferences(null)).toBe('all');
    expect(readMailNotificationModeFromPreferences(undefined)).toBe('all');
    expect(readMailNotificationModeFromPreferences('important')).toBe('all');
    expect(readMailNotificationModeFromPreferences([{ mailNotificationMode: 'off' }])).toBe(
      'all',
    );
  });

  it('normalizes a stored unknown value instead of trusting it', () => {
    expect(readMailNotificationModeFromPreferences({ mailNotificationMode: 'everything' })).toBe(
      'all',
    );
  });
});

describe('isImportantMail', () => {
  it('treats explicit importance flags as important', () => {
    expect(isImportantMail({ isImportant: true })).toBe(true);
    expect(isImportantMail({ isStarred: true })).toBe(true);
  });

  it('treats high/urgent priority as important, case-insensitively', () => {
    expect(isImportantMail({ priority: 'HIGH' })).toBe(true);
    expect(isImportantMail({ priority: 'high' })).toBe(true);
    expect(isImportantMail({ priority: 'URGENT' })).toBe(true);
  });

  it('lets a star win over a bulk category', () => {
    expect(isImportantMail({ isStarred: true, aiCategory: 'promotions' })).toBe(true);
  });

  it.each(['promotions', 'updates', 'social', 'forums'] as const)(
    'treats the %s partition as not important',
    (aiCategory) => {
      expect(isImportantMail({ aiCategory })).toBe(false);
    },
  );

  it('is case-insensitive on the category', () => {
    expect(isImportantMail({ aiCategory: 'PROMOTIONS' })).toBe(false);
  });

  it('treats primary as important', () => {
    expect(isImportantMail({ aiCategory: 'primary' })).toBe(true);
    expect(isImportantMail({ category: 'primary' })).toBe(true);
  });

  it('fails open when nothing was classified', () => {
    expect(isImportantMail({})).toBe(true);
    expect(isImportantMail({ aiCategory: null, category: null })).toBe(true);
  });
});

function memoryStore(preferencesByUser: Record<string, unknown>): MailNotificationModeStore {
  return {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const preferences = preferencesByUser[where.id];
        return preferences === undefined ? null : { preferences };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { preferences: unknown } }) => {
        preferencesByUser[where.id] = data.preferences;
        return { id: where.id };
      }),
    },
  };
}

describe('readUserMailNotificationMode', () => {
  it('reads the stored mode', async () => {
    const store = memoryStore({ u1: { mailNotificationMode: 'off' } });
    await expect(readUserMailNotificationMode(store, 'u1')).resolves.toBe('off');
  });

  it('defaults to all for unknown users and empty preferences', async () => {
    const store = memoryStore({});
    await expect(readUserMailNotificationMode(store, 'nobody')).resolves.toBe('all');
    const empty = memoryStore({ u1: {} });
    await expect(readUserMailNotificationMode(empty, 'u1')).resolves.toBe('all');
  });

  it('fails open to all when the store throws', async () => {
    const store: MailNotificationModeStore = {
      user: {
        findUnique: vi.fn(async () => {
          throw new Error('db down');
        }),
        update: vi.fn(),
      },
    };
    const warn = vi.fn();
    await expect(readUserMailNotificationMode(store, 'u1', { warn })).resolves.toBe('all');
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('writeUserMailNotificationMode', () => {
  it('merges into existing preferences without dropping unrelated keys', async () => {
    const store = memoryStore({
      u1: { mailNotificationMode: 'all', theme: 'dark', 'quant-notify-desktop': '1' },
    });
    await writeUserMailNotificationMode(store, 'u1', 'important');
    expect(store.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        preferences: {
          mailNotificationMode: 'important',
          theme: 'dark',
          'quant-notify-desktop': '1',
        },
      },
    });
    await expect(readUserMailNotificationMode(store, 'u1')).resolves.toBe('important');
  });

  it('starts from an empty object when there are no preferences yet', async () => {
    const store = memoryStore({});
    await writeUserMailNotificationMode(store, 'u1', 'off');
    await expect(readUserMailNotificationMode(store, 'u1')).resolves.toBe('off');
  });
});
