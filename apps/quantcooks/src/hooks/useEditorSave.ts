// ============================================================================
// QuantEdits - useEditorSave (P0-5, spec §2.5b)
//
// Thin React wrapper over EditorSaveMachine (editor-save-machine.ts),
// which holds all timing/decision logic in pure, testable form. This hook
// only wires the machine to the real ports: apiClient.saveProjectState,
// localStorage, navigator.onLine, and the online/visibility events.
//
// Status semantics (honest by construction, spec D5-5): 'saved' appears
// only after the server has acknowledged a save; failures surface as
// 'error'/'offline' with the document mirrored in this browser; a 409
// surfaces as 'conflict' with Reload/Overwrite as explicit user actions.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../services/api-client';
import type { EditorDocument } from '../types/editor-document';
import {
  EditorSaveMachine,
  type SaveOutcome,
  type SaveStatus,
} from './editor-save-machine';

export type { SaveStatus };

export interface UseEditorSave {
  status: SaveStatus;
  /** ISO time of the last server-acknowledged save; null until one lands. */
  lastSavedAt: string | null;
  /** Document of the last acknowledged save (the dirty-comparison base). */
  lastSavedDocument: EditorDocument | null;
  conflictVersion: number | null;
  markDirty: (doc: EditorDocument) => void;
  markClean: () => void;
  saveNow: () => Promise<void>;
  resolveConflict: (strategy: 'reload' | 'overwrite') => Promise<void>;
  /** Adopt a restored localStorage mirror via overwrite semantics. */
  adoptMirrorAsOverwrite: (doc: EditorDocument, serverVersion: number) => void;
  discardMirror: () => void;
}

interface UseEditorSaveOptions {
  projectId: string;
  /** The version the hydrated document is based on (machine creation). */
  baseVersion: number;
  onReloadRequest: () => void;
}

async function saveViaApi(
  projectId: string,
  version: number,
  document: EditorDocument,
): Promise<SaveOutcome> {
  try {
    const res = await apiClient.saveProjectState(projectId, { version, timeline: document });
    if (res.success && res.data) {
      return { ok: true, version: res.data.version };
    }
    if (res.error?.code === 'VERSION_CONFLICT') {
      return { ok: false, conflictVersion: res.error.currentVersion };
    }
    return { ok: false, message: res.error?.message ?? 'Save failed' };
  } catch (err) {
    // apiFetchRaw rejects on network failure (fetch TypeError).
    return {
      ok: false,
      networkFailure: err instanceof TypeError,
      message: err instanceof Error ? err.message : 'Save failed',
    };
  }
}

export function useEditorSave(opts: UseEditorSaveOptions): UseEditorSave {
  const { projectId, onReloadRequest } = opts;
  const machineRef = useRef<EditorSaveMachine | null>(null);
  const machineProjectRef = useRef<string | null>(null);
  const reloadRef = useRef(onReloadRequest);
  reloadRef.current = onReloadRequest;

  if (machineRef.current === null || machineProjectRef.current !== projectId) {
    // (Re)create per project; baseVersion seeds only the fresh machine —
    // afterwards the machine tracks the version itself.
    machineRef.current?.dispose();
    machineProjectRef.current = projectId;
    machineRef.current = new EditorSaveMachine(
      {
        save: (version, document) => saveViaApi(projectId, version, document),
        storage: window.localStorage,
        isOnline: () => navigator.onLine,
        now: () => Date.now(),
        setTimeout: (fn, ms) => window.setTimeout(fn, ms),
        clearTimeout: (handle) => window.clearTimeout(handle as number),
        onReloadRequest: () => reloadRef.current(),
      },
      projectId,
      opts.baseVersion,
    );
  }
  const machine = machineRef.current;

  const [snapshot, setSnapshot] = useState(() => ({
    status: machine.status,
    lastSavedAt: machine.lastSavedAt,
    lastSavedDocument: machine.lastAckedDocument,
    conflictVersion: machine.conflictVersion,
  }));

  useEffect(() => {
    const update = () =>
      setSnapshot({
        status: machine.status,
        lastSavedAt: machine.lastSavedAt,
        lastSavedDocument: machine.lastAckedDocument,
        conflictVersion: machine.conflictVersion,
      });
    const unsubscribe = machine.subscribe(update);
    update();
    return unsubscribe;
  }, [machine]);

  useEffect(() => {
    const onOnline = () => machine.notifyOnline();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void machine.saveNow();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [machine]);

  useEffect(() => () => machine.dispose(), [machine]);

  return {
    status: snapshot.status,
    lastSavedAt: snapshot.lastSavedAt ? new Date(snapshot.lastSavedAt).toISOString() : null,
    lastSavedDocument: snapshot.lastSavedDocument,
    conflictVersion: snapshot.conflictVersion,
    markDirty: (doc) => machine.markDirty(doc),
    markClean: () => machine.markClean(),
    saveNow: () => machine.saveNow(),
    resolveConflict: (strategy) => machine.resolveConflict(strategy),
    adoptMirrorAsOverwrite: (doc, serverVersion) =>
      machine.adoptMirrorAsOverwrite(doc, serverVersion),
    discardMirror: () => machine.discardMirror(),
  };
}

export default useEditorSave;
