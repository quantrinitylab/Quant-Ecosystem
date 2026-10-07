import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { PersistenceAdapter } from '../services/collab-persistence';

interface UpdateRow {
  id: string;
  docId: string;
  version: number;
  updateBinary: Buffer;
  createdAt: Date;
}

/** Stands in for Postgres: survives the simulated pod kill. */
function createFakeDb(initialContent = '') {
  const documents = new Map<string, { content: string; isDeleted: boolean }>([
    ['doc_1', { content: initialContent, isDeleted: false }],
  ]);
  const updates: UpdateRow[] = [];

  const matches = (row: UpdateRow, where: any): boolean => {
    if (where?.docId && row.docId !== where.docId) return false;
    if (where?.id?.in && !where.id.in.includes(row.id)) return false;
    return true;
  };

  return {
    documents,
    updates,
    document: {
      async findUnique({ where }: any) {
        return documents.get(where.id) ?? null;
      },
      async update({ where, data }: any) {
        const row = documents.get(where.id);
        if (!row) throw new Error('not found');
        row.content = data.content;
        return { id: where.id };
      },
    },
    collabDocumentUpdate: {
      async findFirst({ where, orderBy }: any) {
        const rows = updates.filter((row) => matches(row, where));
        rows.sort((a, b) =>
          orderBy?.version === 'desc' ? b.version - a.version : a.version - b.version,
        );
        return rows[0] ?? null;
      },
      async findMany({ where }: any) {
        return updates
          .filter((row) => matches(row, where))
          .sort((a, b) => a.version - b.version)
          .map((row) => ({ ...row }));
      },
      async create({ data }: any) {
        if (updates.some((row) => row.docId === data.docId && row.version === data.version)) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        updates.push({ ...data, createdAt: new Date() });
        return { id: data.id };
      },
      async deleteMany({ where }: any) {
        const keep = updates.filter((row) => !matches(row, where));
        const removed = updates.length - keep.length;
        updates.length = 0;
        updates.push(...keep);
        return { count: removed };
      },
    },
  };
}

function makeSocket() {
  return {
    readyState: 1,
    sent: [] as Uint8Array[],
    closes: [] as Array<{ code?: number; reason?: string }> | any[],
    send(data: Uint8Array) {
      this.sent.push(data);
    },
    close(code?: number, reason?: string) {
      this.closes.push({ code, reason });
      this.readyState = 3;
    },
    on() {},
  };
}

async function loadServer() {
  return import('../services/yjs-server');
}

describe('Gate G-A: collaborative document durability', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('survives a pod kill with no compaction: every delta replays from Postgres', async () => {
    const db = createFakeDb();

    // --- pod A ---
    let server = await loadServer();
    const socket = makeSocket();
    await server.setupWSConnection(
      socket as any,
      { params: { docId: 'doc_1' } },
      { persistence: new PersistenceAdapter(db as any), compactEveryUpdates: 10_000 },
    );
    const live = server.getLiveDoc('doc_1');
    expect(live).toBeDefined();
    live!.getText('content').insert(0, 'hello durable world');
    await server.flushPendingWrites('doc_1');

    expect(db.updates.length).toBeGreaterThan(0);
    // Nothing was compacted, so the snapshot column is still untouched.
    expect(db.documents.get('doc_1')!.content).toBe('');

    // --- kill -9: module state (the rooms map) is gone, Postgres is not ---
    vi.resetModules();
    server = await loadServer();

    const recovered = await server.getYDoc('doc_1', {
      persistence: new PersistenceAdapter(db as any),
    });
    expect(recovered.getText('content').toString()).toBe('hello durable world');
  });

  it('compaction folds deltas into the snapshot and prunes the log losslessly', async () => {
    const db = createFakeDb();
    const server = await loadServer();
    const persistence = new PersistenceAdapter(db as any, { allowInlineFallback: true });

    const socket = makeSocket();
    await server.setupWSConnection(
      socket as any,
      { params: { docId: 'doc_1' } },
      { persistence, compactEveryUpdates: 10_000 },
    );
    const live = server.getLiveDoc('doc_1')!;
    live.getText('content').insert(0, 'alpha ');
    live.getText('content').insert(6, 'beta');
    await server.flushPendingWrites('doc_1');

    const result = await persistence.compact('doc_1', live);
    expect(result.prunedUpdates).toBeGreaterThan(0);
    expect(db.updates.length).toBe(0);
    expect(db.documents.get('doc_1')!.content.startsWith('yjs:v1:')).toBe(true);

    const reloaded = await persistence.loadDoc('doc_1');
    expect(reloaded.getText('content').toString()).toBe('alpha beta');
  });

  it('G-A-BUG-1: a legacy plaintext body is preserved, not overwritten', async () => {
    const db = createFakeDb('This document predates Yjs and must not be destroyed.');
    const server = await loadServer();
    const persistence = new PersistenceAdapter(db as any, { allowInlineFallback: true });

    const socket = makeSocket();
    await server.setupWSConnection(
      socket as any,
      { params: { docId: 'doc_1' } },
      { persistence, compactEveryUpdates: 1 },
    );
    const live = server.getLiveDoc('doc_1')!;
    expect(live.getText('content').toString()).toContain('predates Yjs');

    live.getText('content').insert(0, 'EDIT: ');
    await server.flushPendingWrites('doc_1');

    const reloaded = await persistence.loadDoc('doc_1');
    expect(reloaded.getText('content').toString()).toBe(
      'EDIT: This document predates Yjs and must not be destroyed.',
    );
  });

  it('does not re-append the state it just loaded', async () => {
    const db = createFakeDb();
    const persistence = new PersistenceAdapter(db as any);
    const seed = new Y.Doc();
    seed.getText('content').insert(0, 'seeded');
    await persistence.appendUpdate('doc_1', Y.encodeStateAsUpdate(seed));
    const baseline = db.updates.length;

    const server = await loadServer();
    await server.getYDoc('doc_1', { persistence, compactEveryUpdates: 10_000 });
    expect(db.updates.length).toBe(baseline);
  });

  it('closes sockets with 1011 when an edit cannot be made durable', async () => {
    const db = createFakeDb();
    db.collabDocumentUpdate.create = async () => {
      throw new Error('connection terminated');
    };
    const server = await loadServer();
    const socket = makeSocket();
    await server.setupWSConnection(
      socket as any,
      { params: { docId: 'doc_1' } },
      { persistence: new PersistenceAdapter(db as any) },
    );
    server.getLiveDoc('doc_1')!.getText('content').insert(0, 'x');
    await server.flushPendingWrites('doc_1');

    expect(socket.closes.some((entry: any) => entry.code === 1011)).toBe(true);
    // Room must be evicted from cache so failed unpersisted state is not served or compacted
    expect(server.getLiveDoc('doc_1')).toBeUndefined();
  });

  it('does not cache a poisoned room when the document is missing', async () => {
    const db = createFakeDb();
    db.documents.delete('doc_1');
    const server = await loadServer();
    const persistence = new PersistenceAdapter(db as any);

    await expect(server.getYDoc('doc_1', { persistence })).rejects.toThrow();
    db.documents.set('doc_1', { content: '', isDeleted: false });
    // Must succeed now; the failed attempt must not have been cached.
    await expect(server.getYDoc('doc_1', { persistence })).resolves.toBeDefined();
  });
});
