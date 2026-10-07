import { z } from 'zod';

export const SyncCredentialsSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export type SyncCredentials = z.infer<typeof SyncCredentialsSchema>;

export const CalendarEventSyncSchema = z.object({
  uid: z.string(),
  summary: z.string(),
  dtstart: z.string(),
  dtend: z.string(),
  description: z.string().optional(),
  location: z.string().optional(),
  lastModified: z.string(),
});

export type CalendarEventSync = z.infer<typeof CalendarEventSyncSchema>;

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  lastSync: string;
}

export interface ConflictResolution {
  uid: string;
  winner: 'local' | 'remote';
  resolved: CalendarEventSync;
}

export class CalDAVSyncService {
  private store: Map<string, CalendarEventSync[]> = new Map();
  private syncTokens: Map<string, string> = new Map();

  sync(userId: string, _serverUrl: string, _credentials: SyncCredentials): SyncResult {
    const events = this.store.get(userId) ?? [];
    const now = new Date().toISOString();
    this.syncTokens.set(userId, now);

    return {
      pushed: events.length,
      pulled: 0,
      conflicts: 0,
      lastSync: now,
    };
  }

  push(userId: string, events: CalendarEventSync[]): number {
    const existing = this.store.get(userId) ?? [];

    for (const event of events) {
      const idx = existing.findIndex((e) => e.uid === event.uid);
      if (idx >= 0) {
        existing[idx] = event;
      } else {
        existing.push(event);
      }
    }

    this.store.set(userId, existing);
    return events.length;
  }

  pull(userId: string, since?: string): CalendarEventSync[] {
    const events = this.store.get(userId) ?? [];
    if (!since) return [...events];

    return events.filter((e) => e.lastModified > since);
  }

  resolveConflicts(local: CalendarEventSync[], remote: CalendarEventSync[]): ConflictResolution[] {
    const resolutions: ConflictResolution[] = [];

    for (const localEvent of local) {
      const remoteEvent = remote.find((r) => r.uid === localEvent.uid);
      if (!remoteEvent) continue;

      // Last-write-wins strategy
      const winner = localEvent.lastModified >= remoteEvent.lastModified ? 'local' : 'remote';
      resolutions.push({
        uid: localEvent.uid,
        winner,
        resolved: winner === 'local' ? localEvent : remoteEvent,
      });
    }

    return resolutions;
  }

  getLastSync(userId: string): string | null {
    return this.syncTokens.get(userId) ?? null;
  }
}
