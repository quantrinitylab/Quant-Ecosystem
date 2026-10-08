/**
 * QM-BACK-006 — data-lifecycle domain events.
 *
 * Proves the doc-23 contract for lifecycle transitions: every state change
 * writes its domain row AND its versioned outbox event in the SAME
 * transaction, so the cdc-relay poller can never see one without the other.
 * The fake Prisma below implements real commit/rollback semantics —
 * `$transaction` snapshots state and restores it when the callback throws —
 * so the rollback tests prove atomicity, not just call order.
 *
 * Verified completion (doc 23 laws 7/8): lifecycle_operations rows are the
 * ack surface — publication alone is never treated as completion.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  placeLegalHoldWithEvent,
  releaseLegalHoldWithEvent,
  requestDataExport,
  completeDataExport,
  failDataExport,
  generateInventoryManifest,
  runRetentionSweep,
  recordDeletionBlocked,
  ackLifecycleOperation,
  recordProjectorCheckpoint,
  getProjectorCheckpoint,
  RETENTION_SWEEP_BATCH_LIMIT,
} from '../services/data-lifecycle.service';
import { LifecycleEvents, parseLifecyclePayload } from '../lib/lifecycle-events';

type Row = Record<string, unknown>;

interface FakeDb {
  legalHolds: Map<string, Row>;
  exportRequests: Map<string, Row>;
  policies: Map<string, Row>;
  operations: Map<string, Row>;
  checkpoints: Map<string, Row>;
  emails: Map<string, Row>;
  folders: Map<string, Row>;
  outbox: Row[];
  failOutbox: boolean;
  $transaction<T>(cb: (tx: FakeTx) => Promise<T>): Promise<T>;
}

interface FakeTx {
  legalHold: {
    create(a: { data: Row }): Promise<Row>;
    findUnique(a: { where: { id: string } }): Promise<Row | null>;
    findFirst(a: { where: Row }): Promise<Row | null>;
    findMany(a: { where: Row }): Promise<Row[]>;
    update(a: { where: { id: string }; data: Row }): Promise<Row>;
  };
  dataExportRequest: {
    create(a: { data: Row }): Promise<Row>;
    findUnique(a: { where: { id: string } }): Promise<Row | null>;
    update(a: { where: { id: string }; data: Row }): Promise<Row>;
    count(a: { where: Row }): Promise<number>;
  };
  retentionPolicyRecord: {
    findMany(a: { where: Row }): Promise<Row[]>;
    create(a: { data: Row }): Promise<Row>;
  };
  lifecycleOperation: {
    create(a: { data: Row }): Promise<Row>;
    update(a: { where: { id: string }; data: Row }): Promise<Row>;
    findUnique(a: { where: { id: string } }): Promise<Row | null>;
  };
  projectorCheckpoint: {
    upsert(a: { where: { consumerId: string }; create: Row; update: Row }): Promise<Row>;
    findUnique(a: { where: { consumerId: string } }): Promise<Row | null>;
  };
  email: {
    findMany(a: { where: Row; take?: number }): Promise<Row[]>;
    update(a: { where: { id: string }; data: Row }): Promise<Row>;
    count(a: { where: Row }): Promise<number>;
  };
  emailThread: { count(): Promise<number> };
  contact: { count(): Promise<number> };
  file: { count(): Promise<number> };
  emailFolder: {
    findFirst(a: { where: Row }): Promise<Row | null>;
    create(a: { data: Row }): Promise<Row>;
  };
  outboxEvent: { create(a: { data: Row }): Promise<Row> };
}

function snapshot(db: FakeDb): string {
  return JSON.stringify({
    legalHolds: [...db.legalHolds],
    exportRequests: [...db.exportRequests],
    policies: [...db.policies],
    operations: [...db.operations],
    checkpoints: [...db.checkpoints],
    emails: [...db.emails],
    folders: [...db.folders],
    outbox: db.outbox,
  });
}

function restore(db: FakeDb, snap: string): void {
  const s = JSON.parse(snap);
  db.legalHolds = new Map(s.legalHolds);
  db.exportRequests = new Map(s.exportRequests);
  db.policies = new Map(s.policies);
  db.operations = new Map(s.operations);
  db.checkpoints = new Map(s.checkpoints);
  db.emails = new Map(s.emails);
  db.folders = new Map(s.folders);
  db.outbox = s.outbox;
}

let seq = 0;
const nid = (p: string) => `${p}-${++seq}`;

function createFakeDb(opts: { failOutbox?: boolean } = {}): FakeDb {
  const db: FakeDb = {
    legalHolds: new Map(),
    exportRequests: new Map(),
    policies: new Map(),
    operations: new Map(),
    checkpoints: new Map(),
    emails: new Map(),
    folders: new Map(),
    outbox: [],
    failOutbox: opts.failOutbox ?? false,
    $transaction: async <T>(cb: (tx: FakeTx) => Promise<T>): Promise<T> => {
      const snap = snapshot(db);
      try {
        return await cb(txClient());
      } catch (err) {
        restore(db, snap);
        throw err;
      }
    },
  };

  const matchWhere = (row: Row, where: Row): boolean =>
    Object.entries(where ?? {}).every(([k, v]) => {
      if (v && typeof v === 'object' && 'in' in (v as Row)) {
        return ((v as Row).in as unknown[]).includes(row[k]);
      }
      return row[k] === v;
    });

  const txClient = (): FakeTx => ({
    legalHold: {
      create: async ({ data }) => {
        const row = { id: nid('hold'), createdAt: new Date(), ...data };
        db.legalHolds.set(row.id as string, row);
        return row;
      },
      findUnique: async ({ where }) => db.legalHolds.get(where.id) ?? null,
      findFirst: async ({ where }) => {
        for (const r of db.legalHolds.values()) if (matchWhere(r, where)) return r;
        return null;
      },
      findMany: async ({ where }) => [...db.legalHolds.values()].filter((r) => matchWhere(r, where)),
      update: async ({ where, data }) => {
        const row = db.legalHolds.get(where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return row;
      },
    },
    dataExportRequest: {
      create: async ({ data }) => {
        const row = { id: nid('exp'), requestedAt: new Date(), ...data };
        db.exportRequests.set(row.id as string, row);
        return row;
      },
      findUnique: async ({ where }) => db.exportRequests.get(where.id) ?? null,
      update: async ({ where, data }) => {
        const row = db.exportRequests.get(where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return row;
      },
      count: async ({ where }) => [...db.exportRequests.values()].filter((r) => matchWhere(r, where)).length,
    },
    retentionPolicyRecord: {
      findMany: async ({ where }) => [...db.policies.values()].filter((r) => matchWhere(r, where)),
      create: async ({ data }) => {
        const row = { id: nid('pol'), createdAt: new Date(), ...data };
        db.policies.set(row.id as string, row);
        return row;
      },
    },
    lifecycleOperation: {
      create: async ({ data }) => {
        const row = { id: nid('op'), requestedAt: new Date(), ...data };
        db.operations.set(row.id as string, row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = db.operations.get(where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return row;
      },
      findUnique: async ({ where }) => db.operations.get(where.id) ?? null,
    },
    projectorCheckpoint: {
      upsert: async ({ where, create, update }) => {
        const existing = db.checkpoints.get(where.consumerId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { ...create };
        db.checkpoints.set(where.consumerId, row);
        return row;
      },
      findUnique: async ({ where }) => db.checkpoints.get(where.consumerId) ?? null,
    },
    email: {
      findMany: async ({ where, take }) => {
        let rows = [...db.emails.values()].filter((r) => {
          if (where.deletedAt !== undefined && where.deletedAt !== null) return false;
          if ((where as Row).deletedAt === null && r.deletedAt) return false;
          for (const [k, v] of Object.entries(where)) {
            if (k === 'deletedAt' || k === 'OR') continue;
            if (v && typeof v === 'object' && 'in' in (v as Row)) {
              if (!((v as Row).in as unknown[]).includes(r[k])) return false;
            } else if (r[k] !== v) return false;
          }
          const or = (where as Row).OR as Row[] | undefined;
          if (or) {
            const ok = or.some((cond) =>
              Object.entries(cond).every(([ck, cv]) => {
                if (cv && typeof cv === 'object' && 'lt' in (cv as Row)) {
                  const rv = r[ck] as Date | null;
                  return rv != null && rv < ((cv as Row).lt as Date);
                }
                return r[ck] === cv;
              }),
            );
            if (!ok) return false;
          }
          return true;
        });
        if (take) rows = rows.slice(0, take);
        return rows;
      },
      update: async ({ where, data }) => {
        const row = db.emails.get(where.id);
        if (!row) throw new Error(`email not found: ${where.id}`);
        Object.assign(row, data);
        return row;
      },
      count: async ({ where }) =>
        [...db.emails.values()].filter((r) =>
          Object.entries(where ?? {}).every(([k, v]) => (v === null ? r[k] == null : r[k] === v)),
        ).length,
    },
    emailThread: { count: async () => 3 },
    contact: { count: async () => 7 },
    file: { count: async () => 11 },
    emailFolder: {
      findFirst: async ({ where }) => {
        for (const r of db.folders.values()) if (matchWhere(r, where)) return r;
        return null;
      },
      create: async ({ data }) => {
        const row = { id: nid('folder'), ...data };
        db.folders.set(row.id as string, row);
        return row;
      },
    },
    outboxEvent: {
      create: async ({ data }) => {
        if (db.failOutbox) throw new Error('outbox write failed');
        const row = { id: nid('evt'), createdAt: new Date(), publishedAt: null, ...data };
        db.outbox.push(row);
        return row;
      },
    },
  });

  return db;
}

function seedEmail(db: FakeDb, overrides: Row = {}): Row {
  const row: Row = {
    id: nid('email'),
    userId: 'user-1',
    fromAddress: 'a@example.com',
    toAddresses: ['b@example.com'],
    folderId: 'inbox',
    isTrash: false,
    deletedAt: null,
    receivedAt: new Date('2020-01-01'),
    createdAt: new Date('2020-01-01'),
    ...overrides,
  };
  db.emails.set(row.id as string, row);
  return row;
}

describe('QM-BACK-006 data-lifecycle events', () => {
  let db: FakeDb;
  beforeEach(() => {
    db = createFakeDb();
    seq = 0;
  });

  it('placeLegalHoldWithEvent: hold + completed operation + legalhold.placed.v1 in ONE tx', async () => {
    const hold = await placeLegalHoldWithEvent(db as never, {
      custodianEmail: 'Custodian@Example.com',
      matterName: 'Matter 1',
      reason: 'audit',
      placedBy: 'admin-1',
    });

    expect(hold.custodianEmail).toBe('custodian@example.com');
    const ops = [...db.operations.values()];
    expect(ops).toHaveLength(1);
    expect(ops[0].status).toBe('completed');
    expect(db.outbox).toHaveLength(1);
    expect(db.outbox[0].eventType).toBe(LifecycleEvents.legalHoldPlaced);
    expect((db.outbox[0].payload as Row).custodianEmail).toBe('custodian@example.com');
    expect((db.outbox[0].payload as Row).operationId).toBe(ops[0].id);
  });

  it('placeLegalHoldWithEvent: outbox failure rolls back the hold (atomicity)', async () => {
    db.failOutbox = true;
    await expect(
      placeLegalHoldWithEvent(db as never, {
        custodianEmail: 'c@example.com',
        matterName: 'M',
        reason: 'r',
        placedBy: 'admin-1',
      }),
    ).rejects.toThrow('outbox write failed');
    expect(db.legalHolds.size).toBe(0);
    expect(db.operations.size).toBe(0);
    expect(db.outbox).toHaveLength(0);
  });

  it('placeLegalHoldWithEvent: invalid email fails closed, nothing written', async () => {
    await expect(
      placeLegalHoldWithEvent(db as never, {
        custodianEmail: 'not-an-email',
        matterName: 'M',
        reason: 'r',
        placedBy: 'admin-1',
      }),
    ).rejects.toThrow();
    expect(db.legalHolds.size).toBe(0);
    expect(db.outbox).toHaveLength(0);
  });

  it('releaseLegalHoldWithEvent: release + legalhold.released.v1; 404/400 fail closed', async () => {
    const hold = await placeLegalHoldWithEvent(db as never, {
      custodianEmail: 'c@example.com',
      matterName: 'M',
      reason: 'r',
      placedBy: 'admin-1',
    });
    const released = await releaseLegalHoldWithEvent(db as never, String(hold.id), 'done', 'admin-1');
    expect(released.active).toBe(false);
    expect(db.outbox.map((e) => e.eventType)).toEqual([
      LifecycleEvents.legalHoldPlaced,
      LifecycleEvents.legalHoldReleased,
    ]);

    await expect(releaseLegalHoldWithEvent(db as never, 'nope', 'x', 'admin-1')).rejects.toThrow(
      'Legal hold record not found',
    );
    await expect(
      releaseLegalHoldWithEvent(db as never, String(hold.id), 'again', 'admin-1'),
    ).rejects.toThrow('already released');
  });

  it('export: requested -> completed emits versioned events with operation tracking', async () => {
    seedEmail(db);
    const { exportId, operationId } = await requestDataExport(db as never, 'user-1');
    expect(db.outbox[0].eventType).toBe(LifecycleEvents.exportRequested);
    const op = db.operations.get(operationId);
    expect(op?.status).toBe('requested');

    const manifest = await db.$transaction(async (tx) =>
      generateInventoryManifest(tx as never, 'user-1'),
    );
    // Manifest is real counts from the fake DB — never fabricated.
    expect((manifest.classes as Row).emails).toMatchObject({ count: 1 });
    expect((manifest.classes as Row).contacts).toMatchObject({ count: 7 });
    expect((manifest.classes as Row).driveFiles).toMatchObject({ count: 11 });

    await completeDataExport(db as never, exportId, 'user-1', `inline-manifest:${exportId}`);
    const types = db.outbox.map((e) => e.eventType);
    expect(types).toEqual([LifecycleEvents.exportRequested, LifecycleEvents.exportCompleted]);
    expect((db.outbox[1].payload as Row).artifactRef).toBe(`inline-manifest:${exportId}`);
    const req = db.exportRequests.get(exportId);
    expect(req?.status).toBe('completed');
  });

  it('export: build failure is recorded as failed, never silent', async () => {
    const { exportId } = await requestDataExport(db as never, 'user-1');
    await failDataExport(db as never, exportId, 'user-1', 'disk full');
    expect(db.outbox.map((e) => e.eventType)).toEqual([
      LifecycleEvents.exportRequested,
      LifecycleEvents.exportFailed,
    ]);
    expect(db.exportRequests.get(exportId)?.status).toBe('failed');
    expect((db.outbox[1].payload as Row).error).toBe('disk full');
  });

  it('runRetentionSweep: expired email permanently deleted with erasure-proof events; held email blocked', async () => {
    const old = seedEmail(db, { receivedAt: new Date('2020-01-01') });
    const held = seedEmail(db, {
      fromAddress: 'held@example.com',
      toAddresses: [],
      receivedAt: new Date('2020-01-01'),
    });
    const fresh = seedEmail(db, { receivedAt: new Date() });
    await placeLegalHoldWithEvent(db as never, {
      custodianEmail: 'held@example.com',
      matterName: 'M',
      reason: 'r',
      placedBy: 'admin-1',
    });
    db.outbox.length = 0; // ignore hold-placement events for this assertion
    db.operations.clear();

    await db.$transaction(async (tx) =>
      tx.retentionPolicyRecord.create({
        data: {
          id: 'pol-1',
          userId: 'user-1',
          name: 'Purge old',
          durationDays: 30,
          targetFolders: ['ALL'],
          action: 'PERMANENT_DELETE',
          enabled: true,
        },
      }),
    );

    const result = await runRetentionSweep(db as never, 'system:retention-sweep', new Date('2026-10-08'));
    expect(result).toMatchObject({ policiesRun: 1, deleted: 1, blocked: 1, archived: 0 });

    // The expired email is erased; the held and fresh ones are untouched.
    expect(db.emails.get(String(old.id))?.deletedAt).toBeInstanceOf(Date);
    expect(db.emails.get(String(held.id))?.deletedAt).toBeNull();
    expect(db.emails.get(String(fresh.id))?.deletedAt).toBeNull();

    const types = db.outbox.map((e) => e.eventType);
    expect(types).toContain(LifecycleEvents.deletionCompleted);
    expect(types).toContain(LifecycleEvents.retentionExpired);
    expect(types).toContain(LifecycleEvents.retentionPolicyApplied);
    const summary = db.outbox.find((e) => e.eventType === LifecycleEvents.retentionPolicyApplied);
    expect(summary?.payload).toMatchObject({ deleted: 1, blocked: 1, archived: 0 });
    // Erasure proof carries the operation id for verified completion.
    const completed = db.outbox.find((e) => e.eventType === LifecycleEvents.deletionCompleted);
    expect((completed?.payload as Row).invalidatedIndexes).toEqual(['emails']);
    expect((completed?.payload as Row).operationId).toBeTruthy();
  });

  it('runRetentionSweep: ARCHIVE action moves to the Archive folder, never deletes', async () => {
    seedEmail(db, { receivedAt: new Date('2020-01-01') });
    db.policies.set('pol-1', {
      id: 'pol-1',
      userId: 'user-1',
      name: 'Archive old',
      durationDays: 30,
      targetFolders: ['ALL'],
      action: 'ARCHIVE',
      enabled: true,
    });

    const result = await runRetentionSweep(db as never, 'system', new Date('2026-10-08'));
    expect(result).toMatchObject({ archived: 1, deleted: 0 });
    const email = [...db.emails.values()][0];
    expect(email.deletedAt).toBeNull();
    expect(String(email.folderId)).toContain('folder-');
    const archiveFolder = db.folders.get(String(email.folderId));
    expect(archiveFolder?.type).toBe('ARCHIVE');
  });

  it('runRetentionSweep: disabled policies are ignored; batch is bounded', async () => {
    for (let i = 0; i < 3; i++) seedEmail(db, { receivedAt: new Date('2020-01-01') });
    db.policies.set('pol-off', {
      id: 'pol-off',
      userId: 'user-1',
      name: 'Off',
      durationDays: 1,
      targetFolders: ['ALL'],
      action: 'PERMANENT_DELETE',
      enabled: false,
    });
    const result = await runRetentionSweep(db as never, 'system', new Date('2026-10-08'));
    expect(result.policiesRun).toBe(0);
    expect(RETENTION_SWEEP_BATCH_LIMIT).toBe(500);
  });

  it('recordDeletionBlocked: refusal is an audit fact with a blocked operation', async () => {
    const { operationId } = await recordDeletionBlocked(db as never, {
      targetId: 'email-1',
      targetKind: 'Email',
      actor: 'user-1',
      blockCode: 'LOCKED_LEGAL_HOLD',
      holdId: 'hold-9',
      reason: 'custodian under hold',
    });
    expect(db.outbox).toHaveLength(1);
    expect(db.outbox[0].eventType).toBe(LifecycleEvents.deletionBlocked);
    expect((db.outbox[0].payload as Row).blockCode).toBe('LOCKED_LEGAL_HOLD');
    const op = db.operations.get(operationId);
    expect(op?.status).toBe('blocked');
  });

  it('verified completion: consumer acks and projector checkpoints', async () => {
    const { operationId } = await recordDeletionBlocked(db as never, {
      targetId: 'email-1',
      targetKind: 'Email',
      actor: 'user-1',
      blockCode: 'LOCKED_LEGAL_HOLD',
    });
    // A consumer acking completion AFTER its side effects are durable.
    await ackLifecycleOperation(db as never, operationId, 'completed');
    expect(db.operations.get(operationId)?.status).toBe('completed');
    expect(db.operations.get(operationId)?.completedAt).toBeInstanceOf(Date);

    await expect(ackLifecycleOperation(db as never, 'missing', 'completed')).rejects.toThrow(
      'Lifecycle operation not found',
    );

    // Projector checkpoints: idempotent, resume-from-here.
    expect(await getProjectorCheckpoint(db as never, 'search-indexer:invalidation')).toBeNull();
    await recordProjectorCheckpoint(db as never, 'search-indexer:invalidation', 'evt-42');
    await recordProjectorCheckpoint(db as never, 'search-indexer:invalidation', 'evt-43');
    expect(await getProjectorCheckpoint(db as never, 'search-indexer:invalidation')).toBe('evt-43');
  });

  it('lifecycle payloads: invalid payloads fail closed before the outbox', () => {
    expect(() =>
      parseLifecyclePayload(LifecycleEvents.legalHoldPlaced, { actor: '', holdId: 'h' }),
    ).toThrow();
    expect(() =>
      parseLifecyclePayload(LifecycleEvents.deletionBlocked, {
        actor: 'u',
        targetId: 't',
        targetKind: 'Email',
        blockCode: '',
      }),
    ).toThrow();
    // Valid payloads pass.
    expect(() =>
      parseLifecyclePayload(LifecycleEvents.exportCompleted, {
        actor: 'u',
        exportId: 'e',
        scope: 'mailbox-inventory',
        operationId: 'op',
        artifactRef: 'inline-manifest:e',
      }),
    ).not.toThrow();
  });
});
