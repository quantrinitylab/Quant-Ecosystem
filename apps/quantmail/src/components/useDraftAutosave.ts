'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Draft autosave state machine.
 *
 * - `pristine`: nothing typed yet (or matches the last saved snapshot).
 * - `editing`: user changed something; a save is scheduled.
 * - `saving`: a save is in flight.
 * - `saved`: last scheduled save succeeded.
 * - `error`: last scheduled save failed.
 *
 * The timer is a debounce: every content change resets the countdown, and the
 * save only fires after `delayMs` of quiet. Nothing is sent when there is no
 * content, and manual saves report back through `notifyManualSave` so the
 * timer does not immediately re-fire for content it just saved.
 */
export type DraftSaveState = 'pristine' | 'editing' | 'saving' | 'saved' | 'error';

export const DRAFT_AUTOSAVE_DELAY_MS = 10_000;

/**
 * Framework-free autosave controller. All timer/state logic lives here so it
 * is unit-testable without a DOM; the React hook below is a thin wrapper.
 */
export class DraftAutosaveController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSavedSnapshot: string;
  private saveFn: () => Promise<boolean>;
  private delayMs: number;
  private enabled: boolean;
  private state: DraftSaveState = 'pristine';
  private listeners = new Set<(s: DraftSaveState) => void>();

  constructor(opts: {
    initialSnapshot: string;
    save: () => Promise<boolean>;
    delayMs?: number;
    enabled?: boolean;
  }) {
    this.lastSavedSnapshot = opts.initialSnapshot;
    this.saveFn = opts.save;
    this.delayMs = opts.delayMs ?? DRAFT_AUTOSAVE_DELAY_MS;
    this.enabled = opts.enabled ?? true;
  }

  getSaveState(): DraftSaveState {
    return this.state;
  }

  onChange(listener: (s: DraftSaveState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(s: DraftSaveState) {
    this.state = s;
    for (const l of this.listeners) l(s);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.clearTimer();
  }

  setSaveFn(save: () => Promise<boolean>) {
    this.saveFn = save;
  }

  /** Call on every content change. Returns the new state. */
  contentChanged(snapshot: string, hasContent: boolean): DraftSaveState {
    this.clearTimer();
    if (!this.enabled) return this.state;
    const dirty = snapshot !== this.lastSavedSnapshot;
    if (!dirty) return this.state;
    if (!hasContent) {
      if (this.state !== 'saved' && this.state !== 'error') {
        this.setState('pristine');
      }
      return this.state;
    }
    this.setState('editing');
    this.timer = setTimeout(() => {
      this.timer = null;
      // Fire-time check uses the latest snapshot the owner reported via
      // setPendingSnapshot — the user may have kept typing since scheduling.
      void this.fireIfDirty();
    }, this.delayMs);
    return this.state;
  }

  private pendingSnapshot: string | null = null;

  /** Called by the owner on every render with the latest snapshot. */
  setPendingSnapshot(snapshot: string) {
    this.pendingSnapshot = snapshot;
  }

  private async fireIfDirty(): Promise<boolean> {
    const latest = this.pendingSnapshot;
    if (latest === null || latest === this.lastSavedSnapshot) return false;
    return this.doSave(latest);
  }

  /** The save currently on the wire, so close-time callers can wait it out. */
  private inflight: Promise<boolean> | null = null;
  /** True once any save (timer, manual or close-time) has reached the server. */
  private everSaved = false;

  async doSave(snapshot: string): Promise<boolean> {
    if (!this.enabled || this.state === 'saving') return false;
    this.setState('saving');
    const run = (async () => {
      try {
        return await this.saveFn();
      } catch {
        return false;
      }
    })();
    this.inflight = run;
    let ok = false;
    try {
      ok = await run;
    } finally {
      if (this.inflight === run) this.inflight = null;
    }
    if (ok) {
      this.lastSavedSnapshot = snapshot;
      this.everSaved = true;
      this.setState('saved');
    } else {
      this.setState('error');
    }
    return ok;
  }

  notifyManualSave(snapshot: string, ok: boolean) {
    this.clearTimer();
    if (ok) {
      this.lastSavedSnapshot = snapshot;
      this.everSaved = true;
      this.setState('saved');
    } else {
      this.setState('error');
    }
  }

  hasEverSaved(): boolean {
    return this.everSaved;
  }

  /**
   * Wait out a save that is already on the wire without starting a new one.
   * Discard calls this before deleting: an autosave POST that lands AFTER the
   * delete would otherwise resurrect the draft the person just threw away.
   */
  async settle(): Promise<void> {
    this.clearTimer();
    const pending = this.inflight;
    if (pending) {
      try {
        await pending;
      } catch {
        // doSave already turned the failure into state; nothing to add here.
      }
    }
  }

  /**
   * Close-time save (Back / Close / edge swipe): cancel the countdown, wait out
   * an in-flight autosave, then save `snapshot` unless the server already
   * holds exactly it. Resolves true only when the server has this snapshot,
   * so the caller's "Draft saved" toast is never a guess. Saving straight
   * through `saveFn` instead would race an in-flight autosave into a second
   * POST — a duplicate draft.
   */
  async flush(snapshot: string): Promise<boolean> {
    await this.settle();
    if (this.state === 'saved' && snapshot === this.lastSavedSnapshot) return true;
    return this.doSave(snapshot);
  }

  clearTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  dispose() {
    this.clearTimer();
    this.listeners.clear();
  }
}

interface UseDraftAutosaveOptions {
  /** JSON fingerprint of the current draft content. Compared by value. */
  snapshot: string;
  /** False when there is nothing worth saving (empty draft). */
  hasContent: boolean;
  /** Performs the actual save. Resolves true on success. */
  save: () => Promise<boolean>;
  /** Master switch — e.g. false while sending. */
  enabled?: boolean;
  /** Quiet period before a save fires. Defaults to 10s. */
  delayMs?: number;
}

export function useDraftAutosave({
  snapshot,
  hasContent,
  save,
  enabled = true,
  delayMs = DRAFT_AUTOSAVE_DELAY_MS,
}: UseDraftAutosaveOptions): {
  saveState: DraftSaveState;
  /** Call after a manual save so the timer treats that content as saved. */
  notifyManualSave: (ok: boolean) => void;
  /** Force an immediate save attempt (used by unmount guards). */
  saveNow: () => Promise<boolean>;
  /** Close-time save of the current content; see DraftAutosaveController.flush. */
  flush: () => Promise<boolean>;
  /** Wait out an in-flight save without starting one (discard path). */
  settle: () => Promise<void>;
  /** True once any save of this draft has reached the server. */
  hasSavedOnce: () => boolean;
} {
  const [saveState, setSaveState] = useState<DraftSaveState>('pristine');
  const controllerRef = useRef<DraftAutosaveController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new DraftAutosaveController({
      initialSnapshot: snapshot,
      save,
      delayMs,
      enabled,
    });
  }
  const controller = controllerRef.current;

  // Subscribe once.
  useEffect(() => {
    return controller.onChange(setSaveState);
  }, [controller]);

  // Keep the controller's knobs current.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    controller.setSaveFn(() => saveRef.current());
  }, [controller]);
  useEffect(() => {
    controller.setEnabled(enabled);
  }, [controller, enabled]);

  // Feed every content change through the controller.
  useEffect(() => {
    controller.setPendingSnapshot(snapshot);
    controller.contentChanged(snapshot, hasContent);
  }, [controller, snapshot, hasContent]);

  useEffect(() => () => controller.dispose(), [controller]);

  const notifyManualSave = useCallback(
    (ok: boolean) => {
      controller.notifyManualSave(snapshot, ok);
    },
    [controller, snapshot],
  );

  const saveNow = useCallback(
    () => controller.doSave(snapshot),
    [controller, snapshot],
  );

  // Sync React state on mount in case the controller already transitioned.
  useEffect(() => {
    setSaveState(controller.getSaveState());
  }, [controller]);

  const flush = useCallback(() => controller.flush(snapshot), [controller, snapshot]);
  const settle = useCallback(() => controller.settle(), [controller]);
  const hasSavedOnce = useCallback(() => controller.hasEverSaved(), [controller]);

  return { saveState, notifyManualSave, saveNow, flush, settle, hasSavedOnce };
}

/**
 * Honest, user-visible label for the autosave state. Returns null when there
 * is nothing to say (pristine) so the UI stays quiet.
 */
export function draftSaveStateLabel(state: DraftSaveState): string | null {
  switch (state) {
    case 'editing':
      return 'Unsaved changes';
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved';
    case 'error':
      return "Couldn't save";
    case 'pristine':
    default:
      return null;
  }
}
