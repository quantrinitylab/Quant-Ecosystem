import { describe, it, expect, vi } from 'vitest';
import {
  ServerDraftRef,
  saveServerDraft,
  isVersionConflict,
  isDraftGone,
  conflictCurrentVersion,
  type GuardedApiResponse,
} from '../serverDraft';

function ok<T>(data: T): GuardedApiResponse<T> {
  return { success: true, data };
}
function fail(code: string, statusCode: number, details?: Record<string, unknown>): GuardedApiResponse<never> {
  return { success: false, error: { code, message: code, statusCode, details } };
}

describe('ServerDraftRef', () => {
  it('starts empty with no expected version', () => {
    const ref = new ServerDraftRef();
    expect(ref.getId()).toBeNull();
    expect(ref.getExpectedVersion()).toBeUndefined();
  });

  it('adopt stores id and version; noteSaved updates the version', () => {
    const ref = new ServerDraftRef();
    ref.adopt('d1', 3);
    expect(ref.getId()).toBe('d1');
    expect(ref.getExpectedVersion()).toBe(3);
    ref.noteSaved(4);
    expect(ref.getExpectedVersion()).toBe(4);
  });

  it('adopt without a version leaves the write unguarded', () => {
    const ref = new ServerDraftRef();
    ref.adopt('d1');
    expect(ref.getId()).toBe('d1');
    expect(ref.getExpectedVersion()).toBeUndefined();
  });

  it('clear drops both id and version', () => {
    const ref = new ServerDraftRef();
    ref.adopt('d1', 3);
    ref.clear();
    expect(ref.getId()).toBeNull();
    expect(ref.getExpectedVersion()).toBeUndefined();
  });
});

describe('conflict predicates', () => {
  it('isVersionConflict matches only VERSION_CONFLICT', () => {
    expect(isVersionConflict(fail('VERSION_CONFLICT', 409))).toBe(true);
    expect(isVersionConflict(fail('EMAIL_NOT_FOUND', 404))).toBe(false);
    expect(isVersionConflict(ok({}))).toBe(false);
  });

  it('isDraftGone matches EMAIL_NOT_FOUND or a 404', () => {
    expect(isDraftGone(fail('EMAIL_NOT_FOUND', 404))).toBe(true);
    expect(isDraftGone(fail('SOME_CODE', 404))).toBe(true);
    expect(isDraftGone(fail('VERSION_CONFLICT', 409))).toBe(false);
    expect(isDraftGone(ok({}))).toBe(false);
  });

  it('conflictCurrentVersion reads details.currentVersion', () => {
    expect(conflictCurrentVersion(fail('VERSION_CONFLICT', 409, { currentVersion: 7 }))).toBe(7);
    expect(conflictCurrentVersion(fail('VERSION_CONFLICT', 409))).toBeUndefined();
    expect(conflictCurrentVersion(fail('VERSION_CONFLICT', 409, { currentVersion: 'x' }))).toBeUndefined();
    expect(conflictCurrentVersion(fail('VERSION_CONFLICT', 409, { currentVersion: -1 }))).toBeUndefined();
  });
});

describe('saveServerDraft', () => {
  it('creates once and adopts the returned id + version', async () => {
    const ref = new ServerDraftRef();
    const create = vi.fn(async () => ok({ id: 'd1', version: 0 }));
    const update = vi.fn(async (_id: string, _v: number | undefined) => ok({ id: 'd1', version: 1 }));
    const result = await saveServerDraft({ ref, create, update });
    expect(result).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    expect(ref.getId()).toBe('d1');
    expect(ref.getExpectedVersion()).toBe(0);
  });

  it('updates with the tracked expectedVersion and records the new version', async () => {
    const ref = new ServerDraftRef();
    ref.adopt('d1', 2);
    const update = vi.fn(async () => ok({ id: 'd1', version: 3 }));
    const result = await saveServerDraft({ ref, create: vi.fn(), update });
    expect(result).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('d1', 2);
    expect(ref.getExpectedVersion()).toBe(3);
  });

  it('on 409: reports conflict, adopts the fresh version, retries once (last-writer-wins)', async () => {
    const ref = new ServerDraftRef();
    ref.adopt('d1', 2);
    const onConflict = vi.fn();
    const update = vi
      .fn()
      .mockResolvedValueOnce(fail('VERSION_CONFLICT', 409, { currentVersion: 5 }))
      .mockResolvedValueOnce(ok({ id: 'd1', version: 6 }));
    const result = await saveServerDraft({ ref, create: vi.fn(), update, onConflict });
    expect(result).toBe(true);
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(2);
    // First attempt carried the stale version, the retry the fresh one.
    expect(update).toHaveBeenNthCalledWith(1, 'd1', 2);
    expect(update).toHaveBeenNthCalledWith(2, 'd1', 5);
    expect(ref.getExpectedVersion()).toBe(6);
    // Same draft id throughout — no duplicate minted.
    expect(ref.getId()).toBe('d1');
  });

  it('on 409 without a fresh version: rereads once, then retries', async () => {
    const ref = new ServerDraftRef();
    ref.adopt('d1', 2);
    const update = vi
      .fn()
      .mockResolvedValueOnce(fail('VERSION_CONFLICT', 409))
      .mockResolvedValueOnce(ok({ id: 'd1', version: 8 }));
    const rereadVersion = vi.fn(async () => 7);
    const result = await saveServerDraft({ ref, create: vi.fn(), update, rereadVersion });
    expect(result).toBe(true);
    expect(rereadVersion).toHaveBeenCalledWith('d1');
    expect(update).toHaveBeenNthCalledWith(2, 'd1', 7);
  });

  it('on 409 with no version available anywhere: fails honestly, no blind overwrite', async () => {
    const ref = new ServerDraftRef();
    ref.adopt('d1', 2);
    const update = vi.fn(async () => fail('VERSION_CONFLICT', 409));
    const result = await saveServerDraft({ ref, create: vi.fn(), update });
    expect(result).toBe(false);
    expect(update).toHaveBeenCalledTimes(1);
    // Id is kept — the next content change retries with the notice shown.
    expect(ref.getId()).toBe('d1');
  });

  it('on a second 409 after retry: stops instead of looping', async () => {
    const ref = new ServerDraftRef();
    ref.adopt('d1', 2);
    const onConflict = vi.fn();
    const update = vi.fn(async () => fail('VERSION_CONFLICT', 409, { currentVersion: 9 }));
    const result = await saveServerDraft({ ref, create: vi.fn(), update, onConflict });
    expect(result).toBe(false);
    expect(update).toHaveBeenCalledTimes(2);
    expect(onConflict).toHaveBeenCalledTimes(1);
  });

  it('on 404: reports deleted and clears the id (next save mints exactly one fresh draft)', async () => {
    const ref = new ServerDraftRef();
    ref.adopt('d1', 2);
    const onDeleted = vi.fn();
    const update = vi.fn(async () => fail('EMAIL_NOT_FOUND', 404));
    const result = await saveServerDraft({ ref, create: vi.fn(), update, onDeleted });
    expect(result).toBe(false);
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(ref.getId()).toBeNull();
  });

  it('on 404 during the conflict retry: also clears', async () => {
    const ref = new ServerDraftRef();
    ref.adopt('d1', 2);
    const onDeleted = vi.fn();
    const update = vi
      .fn()
      .mockResolvedValueOnce(fail('VERSION_CONFLICT', 409, { currentVersion: 5 }))
      .mockResolvedValueOnce(fail('EMAIL_NOT_FOUND', 404));
    const result = await saveServerDraft({ ref, create: vi.fn(), update, onDeleted });
    expect(result).toBe(false);
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(ref.getId()).toBeNull();
  });

  it('a failed create returns false without adopting anything', async () => {
    const ref = new ServerDraftRef();
    const create = vi.fn(async () => fail('NETWORK_ERROR', 0));
    const result = await saveServerDraft({ ref, create, update: vi.fn() });
    expect(result).toBe(false);
    expect(ref.getId()).toBeNull();
  });
});
