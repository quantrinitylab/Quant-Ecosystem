// ============================================================================
// QC-F-371 (Slice-1) — updateUserPreferences helper unit tests
//
// lib/preferences-update is the single atomic write path for the
// User.preferences column (see qc-f-371-preferences-race.test.ts for the
// writer-level interleavings). These cases pin the helper's own
// contract:
//   - a P2034 write conflict is retried and the retry re-reads FRESH
//     state (the second attempt's mutation sees the first committer's
//     change — retrying with the stale snapshot would reintroduce the
//     race this finding is about);
//   - a persistent conflict surfaces after exactly
//     PREFERENCES_UPDATE_MAX_ATTEMPTS attempts (bounded, never a loop);
//   - non-conflict errors are NOT retried and nothing is written;
//   - a throwing mutation writes nothing (rollback — QC-F-317's 503
//     path depends on it);
//   - nextPreferences: null is an idempotent no-op (no write, result
//     still returned);
//   - a missing user row returns null and never calls the mutation.
//
// Negative control: on pre-fix code this file fails at import — the
// helper did not exist (the race cases in the sibling file provide the
// behavioural 4/4 FAIL signature on pre-fix code).
// ============================================================================

import { describe, expect, it, vi } from 'vitest';
import {
  updateUserPreferences,
  PREFERENCES_UPDATE_MAX_ATTEMPTS,
  type PreferencesStore,
  type PreferencesTxClient,
} from '../lib/preferences-update';

const USER = 'user-1';

function makeStore(initial: unknown) {
  const state: { preferences: unknown; writes: number; attempts: number } = {
    preferences: initial,
    writes: 0,
    attempts: 0,
  };
  let conflictsToInject = 0;
  let alwaysConflict = false;

  const user = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      where.id === USER ? { preferences: state.preferences } : null,
    update: async ({ data }: { where: { id: string }; data: { preferences: unknown } }) => {
      state.preferences = data.preferences;
      state.writes += 1;
      return {};
    },
  };

  const store: PreferencesStore = {
    user,
    $transaction: async <T,>(fn: (tx: PreferencesTxClient) => Promise<T>): Promise<T> => {
      state.attempts += 1;
      // Model a serializable store: the callback works on a snapshot and
      // its writes land only if the transaction commits.
      const snapshot = { preferences: state.preferences, writes: 0 };
      const tx: PreferencesTxClient = {
        user: {
          findUnique: async ({ where }: { where: { id: string } }) =>
            where.id === USER ? { preferences: snapshot.preferences } : null,
          update: async ({ data }: { where: { id: string }; data: { preferences: unknown } }) => {
            snapshot.preferences = data.preferences;
            snapshot.writes += 1;
            return {};
          },
        },
      };
      const out = await fn(tx);
      if (alwaysConflict || conflictsToInject > 0) {
        if (conflictsToInject > 0) conflictsToInject -= 1;
        throw Object.assign(new Error('write conflict'), { code: 'P2034' });
      }
      state.preferences = snapshot.preferences;
      state.writes += snapshot.writes;
      return out;
    },
  };

  return {
    store,
    state,
    injectConflicts: (n: number) => {
      conflictsToInject = n;
    },
    setAlwaysConflict: () => {
      alwaysConflict = true;
    },
  };
}

describe('QC-F-371: updateUserPreferences helper contract', () => {
  it('1. retries a P2034 conflict and the retry re-reads fresh state', async () => {
    const { store, state, injectConflicts } = makeStore({ counter: 1, other: 'a' });
    injectConflicts(1);

    const seen: unknown[] = [];
    const result = await updateUserPreferences<string>(store, USER, (_tx, current) => {
      seen.push(current);
      const prefs = { ...(current as Record<string, unknown>) };
      // Simulate the competing committer whose write caused the
      // conflict: by the second attempt the store holds its change.
      if (seen.length === 1) {
        state.preferences = { counter: 1, other: 'b', competitor: true };
      }
      prefs['mine'] = true;
      return { nextPreferences: prefs, result: 'done' };
    });

    expect(result).toBe('done');
    expect(state.attempts).toBe(2);
    // The retry's mutation MUST have seen the competitor's fresh row,
    // and the final value must contain BOTH changes.
    expect(seen[1]).toEqual({ counter: 1, other: 'b', competitor: true });
    expect(state.preferences).toEqual({ counter: 1, other: 'b', competitor: true, mine: true });
    expect(state.writes).toBe(1);
  });

  it('2. surfaces a persistent P2034 after exactly the bounded attempts', async () => {
    const { store, state, setAlwaysConflict } = makeStore({});
    setAlwaysConflict();

    await expect(
      updateUserPreferences(store, USER, () => ({ nextPreferences: { x: 1 }, result: 'x' })),
    ).rejects.toMatchObject({ code: 'P2034' });
    expect(state.attempts).toBe(PREFERENCES_UPDATE_MAX_ATTEMPTS);
    expect(state.writes).toBe(0);
  });

  it('3. does not retry non-conflict errors and writes nothing', async () => {
    const { store, state } = makeStore({ keep: true });
    const boom = new Error('db down');

    await expect(
      updateUserPreferences(store, USER, () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(state.attempts).toBe(1);
    expect(state.writes).toBe(0);
    expect(state.preferences).toEqual({ keep: true });
  });

  it('4. nextPreferences: null is a no-op — result returned, no write', async () => {
    const { store, state } = makeStore({ keep: true });

    const result = await updateUserPreferences<string>(store, USER, () => ({
      nextPreferences: null,
      result: 'already-there',
    }));

    expect(result).toBe('already-there');
    expect(state.writes).toBe(0);
    expect(state.preferences).toEqual({ keep: true });
  });

  it('5. a missing user row returns null and never calls the mutation', async () => {
    const { store, state } = makeStore({});
    const mutate = vi.fn(() => ({ nextPreferences: {}, result: 'x' }));

    const result = await updateUserPreferences(store, 'user-ghost', mutate);

    expect(result).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
    expect(state.writes).toBe(0);
  });
});
