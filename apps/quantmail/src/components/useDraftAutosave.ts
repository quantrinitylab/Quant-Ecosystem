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

  async doSave(snapshot: string): Promise<boolean> {
    if (!this.enabled || this.state === 'saving') return false;
    this.setState('saving');
    let ok = false;
    try {
      ok = await this.saveFn();
    } catch {
      ok = false;
    }
    if (ok) {
      this.lastSavedSnapshot = snapshot;
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
      this.setState('saved');
    } else {
      this.setState('error');
    }
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

  return { saveState, notifyManualSave, saveNow };
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
