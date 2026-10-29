// ============================================================================
// EditorSaveMachine tests (P0-5, spec §2.6).
//
// The save hook's timing logic lives in a pure state machine with injected
// ports, so it is tested here with a manual scheduler + in-memory storage
// — no DOM, no fake-timer library. Cases pin: debounce coalescing,
// max-wait, single-flight with exactly one follow-up, retry backoff
// 1s/2s/4s ×3 then stop, offline classification, the 409 conflict state
// (no automatic retry in either direction; explicit reload/overwrite),
// the localStorage mirror lifecycle, and undo-back-to-clean (markClean).
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  EditorSaveMachine,
  mirrorKeyFor,
  readMirror,
  type EditorSaveMachinePorts,
  type SaveOutcome,
} from '../hooks/editor-save-machine';
import type { EditorDocument } from '../types/editor-document';

class FakeScheduler {
  now = 0;
  private nextId = 1;
  private timers = new Map<number, { fn: () => void; at: number }>();

  setTimeout = (fn: () => void, ms: number): number => {
    const id = this.nextId++;
    this.timers.set(id, { fn, at: this.now + ms });
    return id;
  };

  clearTimeout = (handle: unknown): void => {
    this.timers.delete(handle as number);
  };

  advance(ms: number): void {
    const target = this.now + ms;
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, t]) => t.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.timers.delete(due[0]);
      this.now = due[1].at;
      due[1].fn();
    }
    this.now = target;
  }
}

class MemoryStorage {
  private map = new Map<string, string>();
  getItem = (k: string) => this.map.get(k) ?? null;
  setItem = (k: string, v: string) => void this.map.set(k, v);
  removeItem = (k: string) => void this.map.delete(k);
}

function makeDoc(name: string): EditorDocument {
  return {
    schemaVersion: 1,
    tracks: [
      {
        id: 'track-1',
        name,
        type: 'video',
        locked: false,
        visible: true,
        height: 60,
        clips: [],
      },
    ],
    duration: 120,
    aspectRatio: '16:9',
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe('EditorSaveMachine', () => {
  let scheduler: FakeScheduler;
  let storage: MemoryStorage;
  let saves: { version: number; doc: EditorDocument }[];
  let online: boolean;
  let saveImpl: (version: number, doc: EditorDocument) => Promise<SaveOutcome>;
  let reloads: number;
  let machine: EditorSaveMachine;

  beforeEach(() => {
    scheduler = new FakeScheduler();
    storage = new MemoryStorage();
    saves = [];
    online = true;
    reloads = 0;
    saveImpl = async (version) => ({ ok: true, version: version + 1 });
    const ports: EditorSaveMachinePorts = {
      save: (version, doc) => {
        saves.push({ version, doc });
        return saveImpl(version, doc);
      },
      storage,
      isOnline: () => online,
      now: () => scheduler.now,
      setTimeout: scheduler.setTimeout,
      clearTimeout: scheduler.clearTimeout,
      onReloadRequest: () => {
        reloads += 1;
      },
    };
    machine = new EditorSaveMachine(ports, 'proj-1', 1);
  });

  it('debounce: 5 markDirty calls inside 1.5s produce exactly 1 save with the last document', async () => {
    for (let i = 0; i < 5; i++) {
      machine.markDirty(makeDoc(`edit-${i}`));
      scheduler.advance(200);
    }
    await settle();
    expect(saves).toHaveLength(0);

    scheduler.advance(1500);
    await settle();
    expect(saves).toHaveLength(1);
    expect(saves[0]!.doc.tracks[0]!.name).toBe('edit-4');
    expect(saves[0]!.version).toBe(1);
    expect(machine.status).toBe('saved');
    expect(machine.getBaseVersion()).toBe(2);
    expect(machine.lastSavedAt).not.toBeNull();
  });

  it('max-wait: continuous dirt for 10s fires a save even though the debounce never settles', async () => {
    for (let i = 0; i < 9; i++) {
      machine.markDirty(makeDoc(`burst-${i}`));
      scheduler.advance(1000);
      await settle();
    }
    expect(saves).toHaveLength(0);

    machine.markDirty(makeDoc('burst-9'));
    scheduler.advance(1000); // t = 10s: max-wait fires
    await settle();
    expect(saves).toHaveLength(1);
    expect(saves[0]!.doc.tracks[0]!.name).toBe('burst-9');
  });

  it('single-flight: dirt during an in-flight save produces exactly one follow-up save', async () => {
    let releaseFirst: (() => void) | null = null;
    let calls = 0;
    saveImpl = (version) => {
      calls += 1;
      if (calls === 1) {
        return new Promise<SaveOutcome>((resolve) => {
          releaseFirst = () => resolve({ ok: true, version: version + 1 });
        });
      }
      return Promise.resolve({ ok: true, version: version + 1 });
    };

    machine.markDirty(makeDoc('first'));
    const flight = machine.saveNow();
    machine.markDirty(makeDoc('second'));
    releaseFirst!();
    await flight;
    await settle();

    expect(saves).toHaveLength(2);
    expect(saves[1]!.doc.tracks[0]!.name).toBe('second');
    expect(machine.status).toBe('saved');
    expect(machine.getBaseVersion()).toBe(3);
  });

  it('failure: retries at 1s/2s/4s (3 attempts) then stops in error', async () => {
    saveImpl = async () => ({ ok: false, message: 'server down' });
    machine.markDirty(makeDoc('x'));
    await machine.saveNow();
    await settle();
    expect(machine.status).toBe('error');
    expect(saves).toHaveLength(1);

    scheduler.advance(1000);
    await settle();
    expect(saves).toHaveLength(2);
    scheduler.advance(2000);
    await settle();
    expect(saves).toHaveLength(3);
    scheduler.advance(4000);
    await settle();
    expect(saves).toHaveLength(4);

    scheduler.advance(60000);
    await settle();
    expect(saves).toHaveLength(4);
    expect(machine.status).toBe('error');
  });

  it('offline: dirt while offline reports offline; network failure keeps the mirror; online event flushes', async () => {
    online = false;
    machine.markDirty(makeDoc('offline-edit'));
    expect(machine.status).toBe('offline');
    expect(storage.getItem(mirrorKeyFor('proj-1'))).not.toBeNull();

    online = true;
    machine.notifyOnline();
    await settle();
    expect(saves).toHaveLength(1);
    expect(machine.status).toBe('saved');
    expect(storage.getItem(mirrorKeyFor('proj-1'))).toBeNull();
  });

  it('conflict: 409 enters conflict with the server version and never auto-retries', async () => {
    saveImpl = async () => ({ ok: false, conflictVersion: 7 });
    machine.markDirty(makeDoc('mine'));
    scheduler.advance(1500);
    await settle();

    expect(machine.status).toBe('conflict');
    expect(machine.conflictVersion).toBe(7);
    expect(saves).toHaveLength(1);

    scheduler.advance(60000);
    await settle();
    expect(saves).toHaveLength(1); // no automatic retry in either direction
  });

  it('conflict resolution: overwrite re-sends once against the conflict version', async () => {
    saveImpl = async () => ({ ok: false, conflictVersion: 7 });
    machine.markDirty(makeDoc('mine'));
    await machine.saveNow();
    await settle();
    expect(machine.status).toBe('conflict');

    saveImpl = async (version) => ({ ok: true, version: version + 1 });
    await machine.resolveConflict('overwrite');
    await settle();
    expect(saves).toHaveLength(2);
    expect(saves[1]!.version).toBe(7);
    expect(machine.status).toBe('saved');
    expect(machine.getBaseVersion()).toBe(8);
  });

  it('conflict resolution: reload discards local state, clears the mirror, asks the editor to rehydrate', async () => {
    saveImpl = async () => ({ ok: false, conflictVersion: 7 });
    machine.markDirty(makeDoc('mine'));
    await machine.saveNow();
    await settle();
    expect(storage.getItem(mirrorKeyFor('proj-1'))).not.toBeNull();

    await machine.resolveConflict('reload');
    expect(reloads).toBe(1);
    expect(machine.getPendingDocument()).toBeNull();
    expect(storage.getItem(mirrorKeyFor('proj-1'))).toBeNull();
    expect(machine.status).toBe('saved');
  });

  it('mirror: markDirty writes a restorable record; readMirror round-trips and rejects corruption', async () => {
    const doc = makeDoc('mirrored');
    machine.markDirty(doc);
    const record = readMirror(storage, 'proj-1');
    expect(record?.baseVersion).toBe(1);
    expect(record?.document).toEqual(doc);

    storage.setItem(mirrorKeyFor('proj-1'), '{not json');
    expect(readMirror(storage, 'proj-1')).toBeNull();
    expect(storage.getItem(mirrorKeyFor('proj-1'))).toBeNull(); // corrupt key deleted, no crash
  });

  it('undo back to the saved document returns to clean (markClean cancels the pending save)', async () => {
    machine.markDirty(makeDoc('changed'));
    machine.markClean();
    scheduler.advance(20000);
    await settle();
    expect(saves).toHaveLength(0);
    expect(machine.status).toBe('saved');
    expect(storage.getItem(mirrorKeyFor('proj-1'))).toBeNull();
  });

  it('saveNow flushes immediately without waiting for the debounce', async () => {
    machine.markDirty(makeDoc('now'));
    await machine.saveNow();
    expect(saves).toHaveLength(1);
    expect(machine.status).toBe('saved');
  });
});
