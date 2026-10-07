import type { ConflictResolution } from '../types.js';

interface Hist {
  value: unknown;
  writerId: string;
  timestamp: number;
  version: number;
}

interface Snapshot {
  id: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export class SharedScratchpad {
  private data = new Map<string, Map<string, unknown>>();
  private hist = new Map<string, Map<string, Hist[]>>();
  private versions = new Map<string, Map<string, number>>();
  private snapshots = new Map<string, Snapshot[]>();
  private conflictStrategy: ConflictResolution = 'last-writer-wins';

  setConflictResolution(strategy: ConflictResolution): void {
    this.conflictStrategy = strategy;
  }

  write(
    gid: string,
    key: string,
    value: unknown,
    writerId: string,
    expectedVersion?: number,
  ): boolean {
    if (!this.data.has(gid)) this.data.set(gid, new Map());
    if (!this.hist.has(gid)) this.hist.set(gid, new Map());
    if (!this.versions.has(gid)) this.versions.set(gid, new Map());

    const verMap = this.versions.get(gid)!;
    const currentVersion = verMap.get(key) ?? 0;

    if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
      return false; // optimistic lock failure
    }

    const newVersion = currentVersion + 1;
    verMap.set(key, newVersion);
    this.data.get(gid)!.set(key, value);

    const h = this.hist.get(gid)!;
    if (!h.has(key)) h.set(key, []);
    h.get(key)!.push({ value, writerId, timestamp: Date.now(), version: newVersion });
    return true;
  }

  read(gid: string, key: string): unknown | null {
    return this.data.get(gid)?.get(key) ?? null;
  }

  getVersion(gid: string, key: string): number {
    return this.versions.get(gid)?.get(key) ?? 0;
  }

  getAll(gid: string): Record<string, unknown> {
    const m = this.data.get(gid);
    return m ? Object.fromEntries(m.entries()) : {};
  }

  merge(gid: string, entries: Record<string, unknown>, writerId: string): void {
    if (this.conflictStrategy === 'last-writer-wins') {
      for (const [k, v] of Object.entries(entries)) {
        this.write(gid, k, v, writerId);
      }
    } else {
      for (const [k, v] of Object.entries(entries)) {
        const current = this.read(gid, k);
        if (current === null) {
          this.write(gid, k, v, writerId);
        } else if (
          typeof current === 'object' &&
          current !== null &&
          typeof v === 'object' &&
          v !== null
        ) {
          this.write(gid, k, { ...current, ...v }, writerId);
        } else {
          this.write(gid, k, v, writerId);
        }
      }
    }
  }

  getHistory(gid: string, key: string): Hist[] {
    return this.hist.get(gid)?.get(key) ?? [];
  }

  snapshot(gid: string): string {
    const id = crypto.randomUUID();
    const data = this.getAll(gid);
    if (!this.snapshots.has(gid)) this.snapshots.set(gid, []);
    this.snapshots.get(gid)!.push({ id, data: structuredClone(data), timestamp: Date.now() });
    return id;
  }

  restore(gid: string, snapshotId: string): boolean {
    const snaps = this.snapshots.get(gid);
    if (!snaps) return false;
    const snap = snaps.find((s) => s.id === snapshotId);
    if (!snap) return false;
    this.data.set(gid, new Map(Object.entries(snap.data)));
    return true;
  }

  getSnapshots(gid: string): Snapshot[] {
    return this.snapshots.get(gid) ?? [];
  }

  diff(
    gid: string,
    snapshotId: string,
  ): { added: string[]; removed: string[]; changed: string[] } | null {
    const snaps = this.snapshots.get(gid);
    if (!snaps) return null;
    const snap = snaps.find((s) => s.id === snapshotId);
    if (!snap) return null;

    const current = this.getAll(gid);
    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];

    for (const key of Object.keys(current)) {
      if (!(key in snap.data)) added.push(key);
      else if (JSON.stringify(current[key]) !== JSON.stringify(snap.data[key])) changed.push(key);
    }
    for (const key of Object.keys(snap.data)) {
      if (!(key in current)) removed.push(key);
    }
    return { added, removed, changed };
  }
}
