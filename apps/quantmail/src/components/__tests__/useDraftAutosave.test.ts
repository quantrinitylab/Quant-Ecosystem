import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DraftAutosaveController,
  draftSaveStateLabel,
  DRAFT_AUTOSAVE_DELAY_MS,
} from '../useDraftAutosave';

vi.useFakeTimers();

function makeController(saveImpl: () => Promise<boolean> = async () => true) {
  const save = vi.fn(saveImpl);
  const states: string[] = [];
  const c = new DraftAutosaveController({
    initialSnapshot: '{}',
    save,
    delayMs: DRAFT_AUTOSAVE_DELAY_MS,
  });
  c.onChange((s) => states.push(s));
  return { c, save, states };
}

describe('DraftAutosaveController', () => {
  beforeEach(() => {
    vi.clearAllTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  it('stays pristine and never saves when there is no content', async () => {
    const { c, save } = makeController();
    c.setPendingSnapshot('{"a":1}');
    expect(c.contentChanged('{"a":1}', false)).toBe('pristine');
    await vi.advanceTimersByTimeAsync(DRAFT_AUTOSAVE_DELAY_MS + 1000);
    expect(save).not.toHaveBeenCalled();
    expect(c.getSaveState()).toBe('pristine');
    c.dispose();
  });

  it('saves after the quiet period when dirty with content', async () => {
    const { c, save } = makeController();
    c.setPendingSnapshot('{"a":1}');
    expect(c.contentChanged('{"a":1}', true)).toBe('editing');
    await vi.advanceTimersByTimeAsync(DRAFT_AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(1);
    expect(c.getSaveState()).toBe('saved');
    c.dispose();
  });

  it('debounces: typing resets the countdown', async () => {
    const { c, save } = makeController();
    c.setPendingSnapshot('{"a":1}');
    c.contentChanged('{"a":1}', true);
    await vi.advanceTimersByTimeAsync(DRAFT_AUTOSAVE_DELAY_MS - 1000);
    // Type again before the timer fires — countdown restarts
    c.setPendingSnapshot('{"a":2}');
    c.contentChanged('{"a":2}', true);
    await vi.advanceTimersByTimeAsync(DRAFT_AUTOSAVE_DELAY_MS - 1000);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);
    c.dispose();
  });

  it('saves the latest snapshot, not a stale one', async () => {
    const { c, save } = makeController(async () => true);
    c.setPendingSnapshot('{"a":1}');
    c.contentChanged('{"a":1}', true);
    // More typing AFTER the last contentChanged call (owner reports it)
    c.setPendingSnapshot('{"a":3}');
    await vi.advanceTimersByTimeAsync(DRAFT_AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(1);
    expect(c.getSaveState()).toBe('saved');
    c.dispose();
  });

  it('reports an honest error state when the save fails', async () => {
    const { c, save } = makeController(async () => false);
    c.setPendingSnapshot('{"a":1}');
    c.contentChanged('{"a":1}', true);
    await vi.advanceTimersByTimeAsync(DRAFT_AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(1);
    expect(c.getSaveState()).toBe('error');
    c.dispose();
  });

  it('notifyManualSave marks content saved so the timer stays quiet', async () => {
    const { c, save } = makeController();
    c.setPendingSnapshot('{"a":1}');
    c.contentChanged('{"a":1}', true);
    c.notifyManualSave('{"a":1}', true);
    expect(c.getSaveState()).toBe('saved');
    await vi.advanceTimersByTimeAsync(DRAFT_AUTOSAVE_DELAY_MS + 1000);
    expect(save).not.toHaveBeenCalled();
    c.dispose();
  });

  it('does not schedule while disabled', async () => {
    const save = vi.fn(async () => true);
    const c = new DraftAutosaveController({
      initialSnapshot: '{}',
      save,
      enabled: false,
    });
    c.setPendingSnapshot('{"a":1}');
    c.contentChanged('{"a":1}', true);
    await vi.advanceTimersByTimeAsync(DRAFT_AUTOSAVE_DELAY_MS + 1000);
    expect(save).not.toHaveBeenCalled();
    c.dispose();
  });

  it('does not re-fire for already-saved content', async () => {
    const { c, save } = makeController();
    c.setPendingSnapshot('{"a":1}');
    c.contentChanged('{"a":1}', true);
    await vi.advanceTimersByTimeAsync(DRAFT_AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(1);
    // Same content reported again — not dirty, no new timer
    c.setPendingSnapshot('{"a":1}');
    expect(c.contentChanged('{"a":1}', true)).toBe('saved');
    await vi.advanceTimersByTimeAsync(DRAFT_AUTOSAVE_DELAY_MS + 1000);
    expect(save).toHaveBeenCalledTimes(1);
    c.dispose();
  });
});

describe('draftSaveStateLabel', () => {
  it('returns honest labels', () => {
    expect(draftSaveStateLabel('pristine')).toBeNull();
    expect(draftSaveStateLabel('editing')).toBe('Unsaved changes');
    expect(draftSaveStateLabel('saving')).toBe('Saving…');
    expect(draftSaveStateLabel('saved')).toBe('Saved');
    expect(draftSaveStateLabel('error')).toBe("Couldn't save");
  });
});
