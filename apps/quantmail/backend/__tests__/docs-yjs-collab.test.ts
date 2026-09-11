// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import {
  closeYDoc,
  setupWSConnection,
  type AwarenessState,
  type DocRoom,
  type WebSocketLike,
} from '../services/yjs-server';
import { PersistenceAdapter } from '../services/collab-persistence';
import { DocBranchingService } from '../services/doc-branching.service';
import {
  ParagraphPermissionsService,
  type PermissionActor,
} from '../services/paragraph-permissions.service';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const SYNC_STEP_1 = 0;
const SYNC_STEP_2 = 1;
const SYNC_UPDATE = 2;

function frame(type: number, subtype: number, payload = new Uint8Array()): Uint8Array {
  const result = new Uint8Array(payload.byteLength + 2);
  result[0] = type;
  result[1] = subtype;
  result.set(payload, 2);
  return result;
}

function awarenessFrame(state: AwarenessState): Uint8Array {
  return frame(
    MESSAGE_AWARENESS,
    SYNC_UPDATE,
    new TextEncoder().encode(JSON.stringify(state)),
  );
}

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

class MockSocket implements WebSocketLike {
  readyState = 1;
  sent: Uint8Array[] = [];
  closeCalls: Array<{ code?: number; reason?: string }> = [];
  private readonly listeners = new Map<string, Set<(...args: any[]) => void>>();

  send(data: Uint8Array): void {
    this.sent.push(new Uint8Array(data));
  }

  close(code?: number, reason?: string): void {
    if (this.readyState !== 1) return;
    this.readyState = 3;
    this.closeCalls.push({ code, reason });
    this.emit('close');
  }

  on(event: 'message' | 'close' | 'error', listener: (...args: any[]) => void): void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: 'message' | 'close' | 'error', listener: (...args: any[]) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  emitMessage(data: Uint8Array): void {
    this.emit('message', data);
  }

  emitClose(): void {
    this.readyState = 3;
    this.emit('close');
  }

  private emit(event: string, ...args: any[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }
}

type PersistenceMock = {
  loadUpdate: ReturnType<typeof vi.fn>;
  saveDoc: ReturnType<typeof vi.fn>;
};

const roomsToClose: Array<{ name: string; persistence: PersistenceMock }> = [];
let roomSequence = 0;

function roomName(label: string): string {
  roomSequence += 1;
  return `${label}-${roomSequence}`;
}

function persistenceWith(update: Uint8Array | null = null): PersistenceMock {
  return {
    loadUpdate: vi.fn().mockResolvedValue(update),
    saveDoc: vi.fn().mockResolvedValue(undefined),
  };
}

async function connect(
  name: string,
  socket: MockSocket,
  persistence: PersistenceMock,
): Promise<DocRoom> {
  if (!roomsToClose.some((entry) => entry.name === name)) {
    roomsToClose.push({ name, persistence });
  }
  return setupWSConnection(socket, { url: `/collab/${name}` }, {
    persistence: persistence as never,
    persistDebounceMs: 60_000,
  });
}

afterEach(async () => {
  vi.useRealTimers();
  while (roomsToClose.length) {
    const entry = roomsToClose.pop()!;
    await closeYDoc(entry.name, { persistence: entry.persistence as never });
  }
});

describe('Yjs realtime sync and awareness protocol', () => {
  it('answers a client sync step 1 with sync step 2 containing missing state', async () => {
    const persistedDoc = new Y.Doc();
    persistedDoc.getText('content').insert(0, 'persisted text');
    const persistence = persistenceWith(Y.encodeStateAsUpdate(persistedDoc));
    const socket = new MockSocket();
    const name = roomName('handshake');
    await connect(name, socket, persistence);

    socket.sent = [];
    const clientDoc = new Y.Doc();
    socket.emitMessage(frame(MESSAGE_SYNC, SYNC_STEP_1, Y.encodeStateVector(clientDoc)));
    await settle();

    expect(socket.sent).toHaveLength(1);
    expect([...socket.sent[0]!.subarray(0, 2)]).toEqual([MESSAGE_SYNC, SYNC_STEP_2]);
    Y.applyUpdate(clientDoc, socket.sent[0]!.subarray(2));
    expect(clientDoc.getText('content').toString()).toBe('persisted text');
    clientDoc.destroy();
    persistedDoc.destroy();
  });

  it('broadcasts an update to peers in the room without echoing it to its origin', async () => {
    const persistence = persistenceWith();
    const socketA = new MockSocket();
    const socketB = new MockSocket();
    const name = roomName('updates');
    await connect(name, socketA, persistence);
    await connect(name, socketB, persistence);
    socketA.sent = [];
    socketB.sent = [];

    const clientDoc = new Y.Doc();
    clientDoc.getText('content').insert(0, 'hello from A');
    const update = Y.encodeStateAsUpdate(clientDoc);
    socketA.emitMessage(frame(MESSAGE_SYNC, SYNC_UPDATE, update));
    await settle();

    expect(socketA.sent).toHaveLength(0);
    expect(socketB.sent).toHaveLength(1);
    expect([...socketB.sent[0]!.subarray(0, 2)]).toEqual([MESSAGE_SYNC, SYNC_UPDATE]);
    expect(socketB.sent[0]!.subarray(2)).toEqual(update);
    clientDoc.destroy();
  });

  it('broadcasts awareness cursor and presence changes to connected peers', async () => {
    const persistence = persistenceWith();
    const socketA = new MockSocket();
    const socketB = new MockSocket();
    const name = roomName('awareness');
    const room = await connect(name, socketA, persistence);
    await connect(name, socketB, persistence);
    socketA.sent = [];
    socketB.sent = [];
    const state: AwarenessState = {
      clientId: 'client-a',
      userId: 'user-a',
      name: 'Ada',
      color: '#663399',
      cursor: { anchor: 4, head: 4 },
    };

    socketA.emitMessage(awarenessFrame(state));
    await settle();

    expect(socketA.sent).toHaveLength(0);
    expect(socketB.sent).toHaveLength(1);
    expect([...socketB.sent[0]!.subarray(0, 2)]).toEqual([MESSAGE_AWARENESS, SYNC_UPDATE]);
    expect(JSON.parse(new TextDecoder().decode(socketB.sent[0]!.subarray(2)))).toEqual(state);
    expect(room.awareness.get('client-a')).toEqual(state);
  });

  it('removes a closed connection and its awareness clients, then notifies peers', async () => {
    const persistence = persistenceWith();
    const socketA = new MockSocket();
    const socketB = new MockSocket();
    const name = roomName('close');
    const room = await connect(name, socketA, persistence);
    await connect(name, socketB, persistence);
    socketA.emitMessage(awarenessFrame({ clientId: 'client-a', userId: 'user-a' }));
    await settle();
    socketB.sent = [];

    socketA.emitClose();
    await settle();

    expect(room.connections.has(socketA)).toBe(false);
    expect(room.connections.has(socketB)).toBe(true);
    expect(room.awareness.has('client-a')).toBe(false);
    expect(room.awarenessClients.has(socketA)).toBe(false);
    expect(socketB.sent).toHaveLength(1);
    expect(JSON.parse(new TextDecoder().decode(socketB.sent[0]!.subarray(2)))).toEqual({
      clientId: 'client-a',
      removed: true,
    });
  });
});

describe('Yjs document persistence', () => {
  it('persists a binary Yjs update in the document content column', async () => {
    const updateMock = vi.fn().mockResolvedValue({ id: 'doc-1' });
    const db = {
      document: { update: updateMock },
      documentVersion: {},
    };
    const adapter = new PersistenceAdapter(db as never);
    const source = new Y.Doc();
    source.getText('content').insert(0, 'binary state');
    const update = Y.encodeStateAsUpdate(source);

    await adapter.saveDoc('doc-1', update);

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: { content: `yjs:v1:${Buffer.from(update).toString('base64')}` },
      select: { id: true },
    });
    source.destroy();
  });

  it('loads stored updates and reconstructs the complete Y.Doc text state', async () => {
    const source = new Y.Doc();
    source.getText('content').insert(0, 'first paragraph');
    source.getText('content').insert(source.getText('content').length, '\nsecond paragraph');
    const encoded = `yjs:v1:${Buffer.from(Y.encodeStateAsUpdate(source)).toString('base64')}`;
    const db = {
      document: {
        findUnique: vi.fn().mockResolvedValue({ content: encoded, isDeleted: false }),
      },
      documentVersion: {},
    };
    const adapter = new PersistenceAdapter(db as never);

    const loaded = await adapter.loadDoc('doc-1');

    expect(loaded.getText('content').toString()).toBe('first paragraph\nsecond paragraph');
    source.destroy();
    loaded.destroy();
  });
});

type BranchRow = {
  id: string;
  docId: string;
  title: string;
  content: string;
  createdAt: Date;
};

function branchingHarness() {
  const rows = new Map<string, BranchRow>();
  let sequence = 0;
  const documentVersion = {
    create: vi.fn(async ({ data }: { data: Omit<BranchRow, 'id' | 'createdAt'> }) => {
      sequence += 1;
      const row = {
        ...data,
        id: `branch-${sequence}`,
        createdAt: new Date(`2026-09-${String(sequence).padStart(2, '0')}T00:00:00.000Z`),
      };
      rows.set(row.id, row);
      return { id: row.id, docId: row.docId, createdAt: row.createdAt };
    }),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const row = rows.get(where.id);
      return row ? { docId: row.docId, content: row.content } : null;
    }),
    findMany: vi.fn(async () => [...rows.values()].map((row) => ({
      id: row.id,
      docId: row.docId,
      content: row.content,
      createdAt: row.createdAt,
    }))),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: { content: string } }) => {
      const row = rows.get(where.id)!;
      rows.set(where.id, { ...row, content: data.content });
      return { id: row.id };
    }),
  };
  const db = {
    document: { findUnique: vi.fn().mockResolvedValue({ id: 'doc-1' }) },
    documentVersion,
  };
  const persistence = { saveDoc: vi.fn().mockResolvedValue(undefined) };
  return {
    rows,
    documentVersion,
    persistence,
    service: new DocBranchingService(db as never, persistence as never),
  };
}

function readYText(update: Uint8Array): string {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  const text = doc.getText('content').toString();
  doc.destroy();
  return text;
}

describe('document branching and three-way CRDT merge', () => {
  it('creates a branch with identical base and working snapshots of trunk', async () => {
    const { rows, service } = branchingHarness();
    const trunk = new Y.Doc();
    trunk.getText('content').insert(0, 'trunk snapshot');

    const branch = await service.createBranch('doc-1', 'feature', 'user-1', trunk);
    const stored = JSON.parse(rows.get(branch.id)!.content) as {
      baseState: string;
      state: string;
      branchName: string;
      status: string;
    };

    expect(branch).toMatchObject({
      docId: 'doc-1',
      branchName: 'feature',
      userId: 'user-1',
      status: 'open',
    });
    expect(readYText(branch.state)).toBe('trunk snapshot');
    expect(stored.baseState).toBe(stored.state);
    expect(stored).toMatchObject({ branchName: 'feature', status: 'open' });
    trunk.destroy();
  });

  it('lists valid document branches and ignores malformed branch records', async () => {
    const { rows, service } = branchingHarness();
    const source = new Y.Doc();
    source.getText('content').insert(0, 'state');
    const branch = await service.createBranch('doc-1', 'review', 'user-7', source);
    rows.set('malformed', {
      id: 'malformed',
      docId: 'doc-1',
      title: '__branch__:broken',
      content: '{not-json',
      createdAt: new Date('2026-09-30T00:00:00.000Z'),
    });

    const branches = await service.listBranches('doc-1');

    expect(branches).toEqual([
      expect.objectContaining({
        id: branch.id,
        docId: 'doc-1',
        branchName: 'review',
        userId: 'user-7',
        status: 'open',
      }),
    ]);
    source.destroy();
  });

  it('deterministically merges concurrent trunk and branch edits without data loss', async () => {
    const { persistence, service } = branchingHarness();
    const base = new Y.Doc();
    base.getText('content').insert(0, 'base');
    const baseState = Y.encodeStateAsUpdate(base);
    const branch = await service.createBranch('doc-1', 'concurrent', 'user-1', baseState);

    const branchDoc = new Y.Doc();
    Y.applyUpdate(branchDoc, baseState);
    branchDoc.getText('content').insert(branchDoc.getText('content').length, ' branch-change');
    await service.updateBranchState(branch.id, branchDoc);

    const trunkDoc = new Y.Doc();
    Y.applyUpdate(trunkDoc, baseState);
    trunkDoc.getText('content').insert(0, 'trunk-change ');
    const result = await service.mergeBranchIntoTrunk(branch.id, trunkDoc);
    const mergedText = readYText(result.state);

    expect(mergedText).toContain('base');
    expect(mergedText).toContain('branch-change');
    expect(mergedText).toContain('trunk-change');
    expect(result.conflicts).toEqual([
      expect.objectContaining({ path: 'document', resolution: 'yjs-crdt' }),
    ]);
    expect(persistence.saveDoc).toHaveBeenCalledWith('doc-1', result.state);

    base.destroy();
    branchDoc.destroy();
    trunkDoc.destroy();
  });
});

function paragraphHarness() {
  let metadata: any = {};
  let updatedAt = new Date('2026-09-11T00:00:00.000Z');
  const document = {
    findUnique: vi.fn(async () => ({ metadata, updatedAt, isDeleted: false })),
    updateMany: vi.fn(async ({ data }: { data: { metadata: unknown } }) => {
      metadata = data.metadata;
      updatedAt = new Date(updatedAt.getTime() + 1);
      return { count: 1 };
    }),
    update: vi.fn(async ({ data }: { data: { metadata: unknown } }) => {
      metadata = data.metadata;
      updatedAt = new Date(updatedAt.getTime() + 1);
      return { id: 'doc-1' };
    }),
  };
  return {
    document,
    metadata: () => metadata,
    service: new ParagraphPermissionsService({ document } as never),
  };
}

const EDITOR_A: PermissionActor = { userId: 'editor-a', roles: ['editor'] };
const EDITOR_B: PermissionActor = { userId: 'editor-b', roles: ['editor'] };
const VIEWER: PermissionActor = { userId: 'viewer', roles: ['viewer'] };

describe('paragraph permissions and RBAC locks', () => {
  it('grants an exclusive paragraph write lock for the requested TTL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-11T12:00:00.000Z'));
    const { metadata, service } = paragraphHarness();

    const lock = await service.lockParagraph('doc-1', 'paragraph-1', EDITOR_A, 5_000);

    expect(lock).toEqual({
      docId: 'doc-1',
      paragraphId: 'paragraph-1',
      userId: 'editor-a',
      role: 'editor',
      expiresAt: '2026-09-11T12:00:05.000Z',
    });
    expect(metadata().collaboration.paragraphLocks['paragraph-1']).toMatchObject({
      userId: 'editor-a',
      role: 'editor',
      expiresAt: lock.expiresAt,
    });
  });

  it('blocks another editor from acquiring or writing a locked paragraph', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-11T12:00:00.000Z'));
    const { service } = paragraphHarness();
    await service.lockParagraph('doc-1', 'paragraph-1', EDITOR_A, 30_000);

    await expect(service.lockParagraph('doc-1', 'paragraph-1', EDITOR_B, 30_000))
      .rejects.toMatchObject({ statusCode: 423, code: 'PARAGRAPH_LOCKED' });
    await expect(service.assertCanWrite('doc-1', 'paragraph-1', EDITOR_B))
      .rejects.toMatchObject({ statusCode: 423, code: 'PARAGRAPH_LOCKED' });
    await expect(service.assertCanWrite('doc-1', 'paragraph-1', EDITOR_A))
      .resolves.toBeUndefined();
  });

  it('allows acquisition after expiry and after an explicit release', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-11T12:00:00.000Z'));
    const { service } = paragraphHarness();
    await service.lockParagraph('doc-1', 'paragraph-1', EDITOR_A, 1_000);

    vi.advanceTimersByTime(1_001);
    const replacement = await service.lockParagraph('doc-1', 'paragraph-1', EDITOR_B, 5_000);
    expect(replacement.userId).toBe('editor-b');

    await service.unlockParagraph('doc-1', 'paragraph-1', EDITOR_B);
    const reacquired = await service.lockParagraph('doc-1', 'paragraph-1', EDITOR_A, 5_000);
    expect(reacquired.userId).toBe('editor-a');
  });

  it('blocks viewers, allows editors, and still respects another editor’s active lock', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-11T12:00:00.000Z'));
    const { service } = paragraphHarness();

    await expect(service.checkPermission('doc-1', 'paragraph-1', VIEWER, 'write'))
      .resolves.toBe(false);
    await expect(service.assertCanWrite('doc-1', 'paragraph-1', VIEWER))
      .rejects.toMatchObject({ statusCode: 403, code: 'PARAGRAPH_FORBIDDEN' });
    await expect(service.assertCanWrite('doc-1', 'paragraph-1', EDITOR_A))
      .resolves.toBeUndefined();

    await service.lockParagraph('doc-1', 'paragraph-1', EDITOR_A, 30_000);
    await expect(service.assertCanWrite('doc-1', 'paragraph-1', EDITOR_B))
      .rejects.toMatchObject({ statusCode: 423, code: 'PARAGRAPH_LOCKED' });
  });
});
