import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  PersistenceAdapter,
  extractPlainText,
  type CollabStorageClient,
} from '../services/collab-persistence';

interface FakeDocRow {
  content: string;
  isDeleted: boolean;
  snapshotStorageKey: string | null;
}

interface FakeUpdateRow {
  id: string;
  docId: string;
  version: number;
  updateBinary: Buffer;
  createdAt: Date;
}

class FakeCollabStorage implements CollabStorageClient {
  public objects = new Map<string, Buffer>();
  public failUpload = false;
  public failDownload = false;
  public failVerification = false;

  async upload(key: string, body: Buffer): Promise<{ key: string; etag: string }> {
    if (this.failUpload) {
      throw new Error('Storage upload failed: network error');
    }
    this.objects.set(key, Buffer.from(body));
    return { key, etag: 'etag-123' };
  }

  async download(
    key: string,
  ): Promise<{ body: Buffer; contentType: string; contentLength: number }> {
    if (this.failDownload) {
      throw new Error('Storage download failed: object unavailable');
    }
    const buf = this.objects.get(key);
    if (!buf) {
      throw new Error('Storage object not found');
    }
    return {
      body: buf,
      contentType: 'application/octet-stream',
      contentLength: buf.byteLength,
    };
  }

  async getObjectSize(key: string): Promise<number | null> {
    if (this.failVerification) {
      return null;
    }
    const buf = this.objects.get(key);
    return buf ? buf.byteLength : null;
  }

  async headObject(key: string): Promise<{ contentLength: number }> {
    if (this.failVerification) {
      throw new Error('HeadObject failed');
    }
    const buf = this.objects.get(key);
    if (!buf) throw new Error('Not found');
    return { contentLength: buf.byteLength };
  }
}

function createCollabTestDb(initialContent = '', initialSnapshotKey: string | null = null) {
  const documents = new Map<string, FakeDocRow>([
    [
      'doc_test',
      { content: initialContent, isDeleted: false, snapshotStorageKey: initialSnapshotKey },
    ],
  ]);
  const updates: FakeUpdateRow[] = [];

  const matches = (row: FakeUpdateRow, where: any): boolean => {
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
        if (!row) throw new Error('Document not found');
        if (data.content !== undefined) row.content = data.content;
        if (data.snapshotStorageKey !== undefined) row.snapshotStorageKey = data.snapshotStorageKey;
        return { id: where.id, ...row };
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
          throw Object.assign(new Error('unique violation'), { code: 'P2002' });
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

describe('Gate 3: Collab Snapshot Offload & Delta Compaction Engine', () => {
  it('extractPlainText accurately extracts text from Yjs updates for GIN full-text index', () => {
    const doc = new Y.Doc();
    const text = doc.getText('content');
    text.insert(0, 'QuantDocs High Performance Distributed Workspace');
    const update = Y.encodeStateAsUpdate(doc);
    doc.destroy();

    const plain = extractPlainText(update);
    expect(plain).toBe('QuantDocs High Performance Distributed Workspace');
  });

  it('compacts deltas, offloads binary snapshot to storage, saves plain text in db, and prunes deltas', async () => {
    const db = createCollabTestDb();
    const storage = new FakeCollabStorage();
    const adapter = new PersistenceAdapter(db as any, { storage });

    // Client creates doc with initial content
    const doc = new Y.Doc();
    const text = doc.getText('content');
    text.insert(0, 'Initial document state. ');
    const update1 = Y.encodeStateAsUpdate(doc);
    await adapter.appendUpdate('doc_test', update1);

    // Second edit
    text.insert(text.length, 'Appended collaborative section.');
    const update2 = Y.encodeStateAsUpdate(doc);
    await adapter.appendUpdate('doc_test', update2);

    expect(db.updates.length).toBe(2);

    // Compact the room
    const result = await adapter.compact('doc_test', doc);

    expect(result.prunedUpdates).toBe(2);
    expect(result.snapshotBytes).toBeGreaterThan(0);
    expect(db.updates.length).toBe(0); // Deltas pruned!

    // Verify storage landed snapshot
    const docRow = db.documents.get('doc_test')!;
    expect(docRow.snapshotStorageKey).toBeTruthy();
    expect(docRow.snapshotStorageKey).toMatch(/^documents\/doc_test\/snapshots\/\d+\.yjs$/);
    expect(storage.objects.has(docRow.snapshotStorageKey!)).toBe(true);

    // Verify plain text extracted for Postgres GIN full-text index
    expect(docRow.content).toBe('Initial document state. Appended collaborative section.');

    // Now reload doc in a new instance and verify exact text matches
    const reloadedDoc = await adapter.loadDoc('doc_test');
    expect(reloadedDoc.getText('content').toString()).toBe(
      'Initial document state. Appended collaborative section.',
    );
  });

  it('refuses compaction and retains WAL deltas if storage upload or verification fails', async () => {
    const db = createCollabTestDb();
    const storage = new FakeCollabStorage();
    storage.failUpload = true; // Simulate network outage to R2/S3
    const adapter = new PersistenceAdapter(db as any, { storage });

    const doc = new Y.Doc();
    doc.getText('content').insert(0, 'Critical unsaved changes');
    const update = Y.encodeStateAsUpdate(doc);
    await adapter.appendUpdate('doc_test', update);

    expect(db.updates.length).toBe(1);

    // Compaction should refuse and NOT delete deltas, returning prunedUpdates: 0
    const result = await adapter.compact('doc_test', doc);
    expect(result.prunedUpdates).toBe(0);
    expect(db.updates.length).toBe(1); // WAL is completely intact!

    // Reloading doc still succeeds from delta replay
    const reloaded = await adapter.loadDoc('doc_test');
    expect(reloaded.getText('content').toString()).toBe('Critical unsaved changes');
  });

  it('falls back gracefully to delta replay if snapshot download fails on load', async () => {
    const db = createCollabTestDb();
    const storage = new FakeCollabStorage();
    const adapter = new PersistenceAdapter(db as any, { storage });

    const doc = new Y.Doc();
    doc.getText('content').insert(0, 'Base text before split. ');
    await adapter.compact('doc_test', doc);

    // Now add new delta after compaction
    doc.getText('content').insert(doc.getText('content').length, 'New delta edit.');
    const nextUpdate = Y.encodeStateAsUpdate(doc);
    await adapter.appendUpdate('doc_test', nextUpdate);

    // Storage is temporarily down for downloads
    storage.failDownload = true;

    // Loading should fall back to replay rather than crashing
    const loaded = await adapter.loadDoc('doc_test');
    expect(loaded).toBeDefined();
    // Delta replay re-applied the available delta
    expect(loaded.getText('content').toString()).toContain('New delta edit.');
  });
});
