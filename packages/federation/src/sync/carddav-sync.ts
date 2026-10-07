import { z } from 'zod';

export const ContactSyncSchema = z.object({
  uid: z.string(),
  fullName: z.string(),
  email: z.string().optional(),
  phone: z.string().optional(),
  organization: z.string().optional(),
  lastModified: z.string(),
});

export type ContactSync = z.infer<typeof ContactSyncSchema>;

export interface CardDAVSyncCredentials {
  username: string;
  password: string;
}

export interface CardDAVSyncResult {
  pushed: number;
  pulled: number;
  merged: number;
  lastSync: string;
}

export interface MergeResult {
  uid: string;
  merged: ContactSync;
  source: 'local' | 'remote' | 'merged';
}

export class CardDAVSyncService {
  private store: Map<string, ContactSync[]> = new Map();
  private syncTokens: Map<string, string> = new Map();

  sync(
    userId: string,
    _serverUrl: string,
    _credentials: CardDAVSyncCredentials,
  ): CardDAVSyncResult {
    const contacts = this.store.get(userId) ?? [];
    const now = new Date().toISOString();
    this.syncTokens.set(userId, now);

    return {
      pushed: contacts.length,
      pulled: 0,
      merged: 0,
      lastSync: now,
    };
  }

  push(userId: string, contacts: ContactSync[]): number {
    const existing = this.store.get(userId) ?? [];

    for (const contact of contacts) {
      const idx = existing.findIndex((c) => c.uid === contact.uid);
      if (idx >= 0) {
        existing[idx] = contact;
      } else {
        existing.push(contact);
      }
    }

    this.store.set(userId, existing);
    return contacts.length;
  }

  pull(userId: string, since?: string): ContactSync[] {
    const contacts = this.store.get(userId) ?? [];
    if (!since) return [...contacts];

    return contacts.filter((c) => c.lastModified > since);
  }

  merge(local: ContactSync[], remote: ContactSync[]): MergeResult[] {
    const results: MergeResult[] = [];
    const localMap = new Map(local.map((c) => [c.uid, c]));
    const remoteMap = new Map(remote.map((c) => [c.uid, c]));

    // Process all unique UIDs
    const allUids = new Set([...localMap.keys(), ...remoteMap.keys()]);

    for (const uid of allUids) {
      const localContact = localMap.get(uid);
      const remoteContact = remoteMap.get(uid);

      if (localContact && !remoteContact) {
        results.push({ uid, merged: localContact, source: 'local' });
      } else if (!localContact && remoteContact) {
        results.push({ uid, merged: remoteContact, source: 'remote' });
      } else if (localContact && remoteContact) {
        // Merge: last modified wins for conflicts, combine fields
        const winner =
          localContact.lastModified >= remoteContact.lastModified ? localContact : remoteContact;
        const merged: ContactSync = {
          uid,
          fullName: winner.fullName,
          email: localContact.email ?? remoteContact.email,
          phone: localContact.phone ?? remoteContact.phone,
          organization: localContact.organization ?? remoteContact.organization,
          lastModified: new Date().toISOString(),
        };
        results.push({ uid, merged, source: 'merged' });
      }
    }

    return results;
  }

  getLastSync(userId: string): string | null {
    return this.syncTokens.get(userId) ?? null;
  }
}
