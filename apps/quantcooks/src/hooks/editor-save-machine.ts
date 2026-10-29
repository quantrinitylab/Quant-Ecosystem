// ============================================================================
// QuantEdits - Editor save state machine (P0-5, spec §2.5b)
//
// The timing/decision core of useEditorSave, kept as a pure class with
// injected ports (clock, scheduler, storage, network probe, save function)
// so the debounce / max-wait / single-flight / retry / conflict behaviour
// is testable without a DOM — the established frontend test pattern in
// this app. The React hook (useEditorSave.ts) is a thin wrapper over this.
//
// Honesty rules baked in (spec D5-4/D5-5):
//  - 'saved' is entered ONLY on a server-acknowledged response.
//  - A 409 enters 'conflict' and is NEVER retried automatically in either
//    direction; resolution is an explicit user action.
//  - While saves fail, the document is mirrored to localStorage and the
//    status says so — nothing claims a save that did not happen.
// ============================================================================

import type { EditorDocument } from '../types/editor-document';

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict' | 'offline';

export interface SaveOutcome {
  ok: boolean;
  /** New project version on success. */
  version?: number;
  /** Set when the failure is a 409 VERSION_CONFLICT. */
  conflictVersion?: number;
  /** True when the failure looks like a network/offline failure. */
  networkFailure?: boolean;
  message?: string;
}

export interface EditorSaveMachinePorts {
  /** Perform one save attempt of `document` against `version`. */
  save: (version: number, document: EditorDocument) => Promise<SaveOutcome>;
  /** localStorage-like mirror store (injected for tests). */
  storage: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
  };
  isOnline: () => boolean;
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  /** Called when the user resolves a conflict (or a stale mirror) by reloading. */
  onReloadRequest: () => void;
}

export interface MirrorRecord {
  baseVersion: number;
  document: EditorDocument;
  mirroredAt: number;
}

export const DEBOUNCE_MS = 1500;
export const MAX_WAIT_MS = 10000;
export const RETRY_DELAYS_MS = [1000, 2000, 4000] as const;

export function mirrorKeyFor(projectId: string): string {
  return `quantcooks:editor-draft:${projectId}`;
}

export class EditorSaveMachine {
  status: SaveStatus = 'saved';
  lastSavedAt: number | null = null;
  conflictVersion: number | null = null;
  /** The document of the last server-acknowledged save (or the hydrated
   * base once the editor reports it via markClean semantics). */
  lastAckedDocument: EditorDocument | null = null;

  private readonly ports: EditorSaveMachinePorts;
  private readonly projectId: string;
  private baseVersion: number;
  private pendingDocument: EditorDocument | null = null;
  private inFlight = false;
  private debounceTimer: unknown = null;
  private maxWaitTimer: unknown = null;
  private retryTimer: unknown = null;
  private retryAttempt = 0;
  private readonly listeners = new Set<() => void>();

  constructor(ports: EditorSaveMachinePorts, projectId: string, baseVersion: number) {
    this.ports = ports;
    this.projectId = projectId;
    this.baseVersion = baseVersion;
  }

  getBaseVersion(): number {
    return this.baseVersion;
  }

  getPendingDocument(): EditorDocument | null {
    return this.pendingDocument;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setStatus(next: SaveStatus): void {
    if (this.status === next) return;
    this.status = next;
    for (const listener of this.listeners) listener();
  }

  private clearTimer(handle: unknown): void {
    if (handle !== null && handle !== undefined) this.ports.clearTimeout(handle);
  }

  /** Record the latest document, mirror it, and arm the save timers. */
  markDirty(doc: EditorDocument): void {
    // Fresh dirt after exhausted retries re-arms the retry budget (spec:
    // failure "stays error until the next markDirty or a manual retry").
    if (this.status === 'error' || this.status === 'offline') this.retryAttempt = 0;
    this.pendingDocument = doc;
    this.writeMirror(doc);
    if (this.status !== 'saving' && this.status !== 'conflict') {
      this.setStatus(this.ports.isOnline() ? 'dirty' : 'offline');
    }
    if (this.status === 'conflict') return; // D5-4: no automatic path out

    this.clearTimer(this.debounceTimer);
    this.debounceTimer = this.ports.setTimeout(() => void this.flush(), DEBOUNCE_MS);
    if (this.maxWaitTimer === null || this.maxWaitTimer === undefined) {
      this.maxWaitTimer = this.ports.setTimeout(() => void this.flush(), MAX_WAIT_MS);
    }
  }

  /** Save now (debounce fire, max-wait fire, manual Save, visibility hide). */
  async saveNow(): Promise<void> {
    await this.flush();
  }

  /**
   * The local document compares equal to the last acknowledged one (e.g.
   * the user undid their way back): drop the pending save and the mirror.
   * No-ops while a save is in flight (its ack will republish the base) or
   * in conflict (only the user's Reload/Overwrite resolves that).
   */
  markClean(): void {
    if (this.inFlight || this.status === 'conflict') return;
    this.pendingDocument = null;
    this.retryAttempt = 0;
    this.clearTimer(this.debounceTimer);
    this.debounceTimer = null;
    this.clearTimer(this.maxWaitTimer);
    this.maxWaitTimer = null;
    this.clearTimer(this.retryTimer);
    this.retryTimer = null;
    this.clearMirror();
    this.setStatus('saved');
  }

  /** The browser came back online: flush any unsaved document. */
  notifyOnline(): void {
    if (this.pendingDocument && (this.status === 'offline' || this.status === 'error')) {
      void this.flush();
    }
  }

  private async flush(): Promise<void> {
    this.clearTimer(this.debounceTimer);
    this.debounceTimer = null;
    this.clearTimer(this.maxWaitTimer);
    this.maxWaitTimer = null;
    this.clearTimer(this.retryTimer);
    this.retryTimer = null;

    if (this.inFlight) return; // single-flight; settle re-checks dirt
    if (this.status === 'conflict') return;
    const doc = this.pendingDocument;
    if (!doc) return;

    this.inFlight = true;
    this.setStatus('saving');
    let outcome: SaveOutcome;
    try {
      outcome = await this.ports.save(this.baseVersion, doc);
    } catch (err) {
      outcome = {
        ok: false,
        networkFailure: true,
        message: err instanceof Error ? err.message : 'Save failed',
      };
    }
    this.inFlight = false;

    if (outcome.ok) {
      this.retryAttempt = 0;
      this.clearTimer(this.retryTimer);
      this.retryTimer = null;
      if (typeof outcome.version === 'number') this.baseVersion = outcome.version;
      this.lastSavedAt = this.ports.now();
      this.lastAckedDocument = doc;
      // Notify even if the status value is unchanged (saving → saved is a
      // change, but follow-up-dirt acks must still publish lastAckedDocument).
      for (const listener of this.listeners) listener();
      if (this.pendingDocument === doc) {
        this.pendingDocument = null;
        this.clearMirror();
        this.setStatus('saved');
      } else {
        // Dirt arrived while saving: exactly one follow-up save.
        this.setStatus('dirty');
        void this.flush();
      }
      return;
    }

    if (typeof outcome.conflictVersion === 'number') {
      this.conflictVersion = outcome.conflictVersion;
      this.setStatus('conflict'); // no auto-retry in either direction
      return;
    }

    const offline = outcome.networkFailure === true || !this.ports.isOnline();
    this.setStatus(offline ? 'offline' : 'error');
    if (this.retryAttempt < RETRY_DELAYS_MS.length) {
      const delay = RETRY_DELAYS_MS[this.retryAttempt] as number;
      this.retryAttempt += 1;
      this.clearTimer(this.retryTimer);
      this.retryTimer = this.ports.setTimeout(() => void this.flush(), delay);
    }
  }

  /**
   * Resolve a conflict (or restore a stale mirror as the local document):
   *  - 'reload': discard local edits + the mirror; the editor rehydrates
   *    from the server via onReloadRequest.
   *  - 'overwrite': ONE explicit re-send of the local document against the
   *    server's current version. A second 409 lands back in 'conflict'
   *    with the newer version.
   */
  async resolveConflict(strategy: 'reload' | 'overwrite'): Promise<void> {
    if (strategy === 'reload') {
      this.pendingDocument = null;
      this.conflictVersion = null;
      this.retryAttempt = 0;
      this.clearMirror();
      this.setStatus('saved');
      this.ports.onReloadRequest();
      return;
    }
    if (this.conflictVersion === null) return;
    this.baseVersion = this.conflictVersion;
    this.conflictVersion = null;
    this.retryAttempt = 0;
    this.setStatus('dirty');
    await this.flush();
  }

  /**
   * Adopt a restored mirror as the local document against a NEW base
   * version (the stale-mirror Restore path routes through overwrite
   * semantics — only ever via the user's click).
   */
  adoptMirrorAsOverwrite(doc: EditorDocument, serverVersion: number): void {
    this.pendingDocument = doc;
    this.baseVersion = serverVersion;
    this.conflictVersion = null;
    this.writeMirror(doc);
    this.setStatus('dirty');
    void this.flush();
  }

  /** Discard a mirror without adopting it (the banner's Discard button). */
  discardMirror(): void {
    this.clearMirror();
  }

  dispose(): void {
    this.clearTimer(this.debounceTimer);
    this.clearTimer(this.maxWaitTimer);
    this.clearTimer(this.retryTimer);
  }

  // -- localStorage mirror -------------------------------------------------

  private writeMirror(doc: EditorDocument): void {
    const record: MirrorRecord = {
      baseVersion: this.baseVersion,
      document: doc,
      mirroredAt: this.ports.now(),
    };
    try {
      this.ports.storage.setItem(mirrorKeyFor(this.projectId), JSON.stringify(record));
    } catch {
      /* storage full/blocked — the save path itself still runs */
    }
  }

  private clearMirror(): void {
    try {
      this.ports.storage.removeItem(mirrorKeyFor(this.projectId));
    } catch {
      /* ignore */
    }
  }
}

/** Parse a stored mirror; corrupt mirrors are deleted and ignored. */
export function readMirror(
  storage: EditorSaveMachinePorts['storage'],
  projectId: string,
): MirrorRecord | null {
  const key = mirrorKeyFor(projectId);
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MirrorRecord;
    if (
      typeof parsed.baseVersion !== 'number' ||
      !parsed.document ||
      typeof parsed.document !== 'object'
    ) {
      throw new Error('malformed mirror');
    }
    return parsed;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      /* ignore */
    }
    return null;
  }
}
