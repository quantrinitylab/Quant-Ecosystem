import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ContactService,
  buildMergePlan,
  fingerprintMergePlan,
  duplicatePairKey,
} from '../services/contact.service';

/**
 * CODEX-REVIEW 2026-10-18 item 3 (#1328 follow-up) regressions:
 * the wizard preview filtered dismissals against the ORIGINAL (DB-order)
 * primary while the bulk path re-sorted members (different survivor) and
 * applied dismissal filtering differently — so "Auto-Merge All" merged
 * groups the preview never showed (or hid), and keep-separate pairs were
 * lost across service instances via the dismissal-blind POST /contacts/merge
 * path. The contract now: ONE post-dismissal, survivor-resolved merge plan
 * shared by preview and execution; stale previews 409 instead of silently
 * expanding; keep-separate enforced atomically in every merge entry point.
 */
describe('ContactService - shared merge plan (P1, #1328 follow-up)', () => {
  let service: ContactService;
  let mockPrisma: any;

  const makeContact = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    userId: 'user-1',
    name: 'Same Person',
    email: 'shared@example.com',
    phone: null,
    company: null,
    tags: [],
    frequency: 1,
    lastContactedAt: null,
    isFavorite: false,
    createdAt: new Date(1000),
    updatedAt: new Date(1000),
    ...overrides,
  });

  const mockContactsForMerge = (contacts: any[], dismissed: any[] = []) => {
    mockPrisma.contact.findMany.mockResolvedValue(contacts);
    mockPrisma.contact.findUnique.mockImplementation((args: any) =>
      Promise.resolve(contacts.find((c) => c.id === args.where.id) ?? null),
    );
    mockPrisma.contact.update.mockImplementation((args: any) =>
      Promise.resolve({
        ...contacts.find((c) => c.id === args.where.id),
        ...args.data,
      }),
    );
    mockPrisma.contact.delete.mockResolvedValue({});
    mockPrisma.dismissedDuplicatePair.findMany.mockResolvedValue(dismissed);
  };

  const deletedIds = () =>
    mockPrisma.contact.delete.mock.calls.map((call: any) => call[0].where.id);

  /**
   * Deep-fix helper: a mock Prisma layer that behaves like the real dismissal
   * table — upserts persist, deletes remove rows, and later findMany calls
   * (including from a FRESH service instance) see them. The static mock above
   * cannot reproduce the #1241 sequential-call scenario: a fixed findMany
   * array never reflects rows written by an earlier merge.
   */
  const mockPersistentStore = (contacts: any[], initialDismissedKeys: string[] = []) => {
    const liveContacts = [...contacts];
    const liveDismissed = new Set(initialDismissedKeys);
    const store = {
      contact: {
        findMany: vi.fn(async () => [...liveContacts]),
        findFirst: vi.fn(async (args: any) =>
          liveContacts.find((c) => c.id === args.where.id) ?? null,
        ),
        findUnique: vi.fn(async (args: any) =>
          liveContacts.find((c) => c.id === args.where.id) ?? null,
        ),
        create: vi.fn(),
        update: vi.fn(async (args: any) => {
          const row = liveContacts.find((c) => c.id === args.where.id);
          if (!row) return null;
          Object.assign(row, args.data);
          return { ...row };
        }),
        delete: vi.fn(async (args: any) => {
          const idx = liveContacts.findIndex((c) => c.id === args.where.id);
          if (idx >= 0) liveContacts.splice(idx, 1);
          return {};
        }),
      },
      dismissedDuplicatePair: {
        findMany: vi.fn(async () =>
          [...liveDismissed].map((pairKey) => ({ userId: 'user-1', pairKey })),
        ),
        upsert: vi.fn(async (args: any) => {
          liveDismissed.add(args.create.pairKey);
          return { ...args.create, id: 'dismissed-1', createdAt: new Date() };
        }),
      },
      liveContacts,
      liveDismissed,
    };
    return store;
  };

  beforeEach(() => {
    mockPrisma = {
      contact: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      dismissedDuplicatePair: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
      },
    };
    service = new ContactService(mockPrisma as any);
  });

  it('bulk executes EXACTLY the previewed plan: same survivor, same merge set', async () => {
    // Reported shape: preview showed D/E under the original primary; bulk
    // re-sorted and deleted a different set. Dismissals are recorded against
    // the DB-order primary A; B and C sort earlier by createdAt.
    const contacts = [
      makeContact('A', { createdAt: new Date(3000) }),
      makeContact('B', { createdAt: new Date(1000) }),
      makeContact('C', { createdAt: new Date(2000) }),
      makeContact('D', { createdAt: new Date(4000) }),
      makeContact('E', { createdAt: new Date(5000) }),
    ];
    mockContactsForMerge(contacts, [
      { userId: 'user-1', pairKey: duplicatePairKey('A', 'B') },
      { userId: 'user-1', pairKey: duplicatePairKey('A', 'C') },
    ]);

    const preview = await service.findDuplicates('user-1');
    expect(preview).toHaveLength(1);
    const previewSurvivor = preview[0]!.primaryContact.id;
    const previewMergeIds = preview[0]!.duplicates.map((c) => c.id).sort();

    const result = await service.deduplicateContacts('user-1');

    expect(result.mergedCount).toBe(previewMergeIds.length);
    expect(deletedIds().sort()).toEqual(previewMergeIds);
    // The survivor is the one contact NOT deleted; it must be the preview's.
    const survivors = contacts.map((c) => c.id).filter((id) => !deletedIds().includes(id));
    expect(survivors).toContain(previewSurvivor);
    // A keeps separate from B and C: A is never absorbed into B/C's record.
    expect(previewMergeIds).not.toContain('A');
  });

  it('a group hidden by dismissals in the preview is identical in bulk, never wider', async () => {
    // All pairs against the DB-order primary A are dismissed, so the old
    // preview showed NOTHING — but the old bulk re-sort still merged B<-C.
    // With one shared plan the preview and the bulk outcome are identical.
    const contacts = [
      makeContact('A', { createdAt: new Date(2000) }),
      makeContact('B', { createdAt: new Date(1000) }),
      makeContact('C', { createdAt: new Date(3000) }),
    ];
    mockContactsForMerge(contacts, [
      { userId: 'user-1', pairKey: duplicatePairKey('A', 'B') },
      { userId: 'user-1', pairKey: duplicatePairKey('A', 'C') },
    ]);

    const preview = await service.findDuplicates('user-1');
    const result = await service.deduplicateContacts('user-1');

    const previewMergeIds = preview.flatMap((g) => g.duplicates.map((c) => c.id)).sort();
    expect(result.mergedCount).toBe(previewMergeIds.length);
    expect(deletedIds().sort()).toEqual(previewMergeIds);
    // The dismissed pair (A,B) is never collapsed, whichever contact survives.
    if (preview.length > 0) {
      expect(preview[0]!.primaryContact.id).toBe('B');
      expect(previewMergeIds).toEqual(['C']);
    }
  });

  it('stale previews conflict (409 STALE_MERGE_PLAN) instead of silently expanding', async () => {
    const contacts = [makeContact('A'), makeContact('B')];
    mockContactsForMerge(contacts);
    const { planFingerprint: staleFingerprint } = await service.findDuplicatePlan('user-1');

    // Data changes under the preview: a new duplicate appears.
    const grown = [...contacts, makeContact('C')];
    mockContactsForMerge(grown);

    await expect(
      service.deduplicateContacts('user-1', { expectedFingerprint: staleFingerprint }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'STALE_MERGE_PLAN' });
    expect(mockPrisma.contact.delete).not.toHaveBeenCalled();

    // A fresh fingerprint proceeds and merges exactly the current plan.
    const fresh = await service.findDuplicatePlan('user-1');
    const result = await service.deduplicateContacts('user-1', {
      expectedFingerprint: fresh.planFingerprint,
    });
    expect(result.mergedCount).toBe(2);
    expect(deletedIds().sort()).toEqual(['B', 'C']);
  });

  it('deduplicateContacts returns a stable plan fingerprint matching the preview', async () => {
    mockContactsForMerge([makeContact('A'), makeContact('B')]);
    const preview = await service.findDuplicatePlan('user-1');
    const result = await service.deduplicateContacts('user-1');
    expect(result.planFingerprint).toBe(preview.planFingerprint);
  });

  it('mergeContacts refuses a dismissed pair, even via a fresh service instance (#1241)', async () => {
    // #1241: the keep-separate decision was lost on a second call with a new
    // service instance because POST /contacts/merge never consulted the
    // dismissal table — a stale wizard cluster could absorb A then B into a
    // third primary and collapse the dismissed pair into one record.
    const contacts = [
      makeContact('P', { email: 'p@example.com', name: 'Primary' }),
      makeContact('A'),
      makeContact('B'),
    ];
    mockContactsForMerge(contacts, [
      { userId: 'user-1', pairKey: duplicatePairKey('A', 'B') },
    ]);

    const freshService = new ContactService(mockPrisma as any);

    await expect(freshService.mergeContacts('user-1', 'P', ['A', 'B'])).rejects.toMatchObject({
      statusCode: 409,
      code: 'KEEP_SEPARATE_CONFLICT',
    });
    expect(mockPrisma.contact.update).not.toHaveBeenCalled();
    expect(mockPrisma.contact.delete).not.toHaveBeenCalled();
  });

  it('mergeContacts refuses merging a dismissed pair directly into each other', async () => {
    mockContactsForMerge([makeContact('A'), makeContact('B')], [
      { userId: 'user-1', pairKey: duplicatePairKey('A', 'B') },
    ]);

    await expect(service.mergeContacts('user-1', 'A', ['B'])).rejects.toMatchObject({
      statusCode: 409,
      code: 'KEEP_SEPARATE_CONFLICT',
    });
    expect(mockPrisma.contact.update).not.toHaveBeenCalled();
    expect(mockPrisma.contact.delete).not.toHaveBeenCalled();
  });

  it('mergeContacts still merges when no dismissal touches the requested pairs', async () => {
    const primary = makeContact('A', { tags: ['work'], frequency: 5 });
    const dup = makeContact('B', { tags: ['home'], frequency: 2 });
    mockPrisma.contact.findMany.mockResolvedValue([primary, dup]);
    mockPrisma.contact.findUnique.mockImplementation((args: any) =>
      Promise.resolve([primary, dup].find((c) => c.id === args.where.id) ?? null),
    );
    mockPrisma.contact.update.mockImplementation((args: any) =>
      Promise.resolve({ ...primary, ...args.data }),
    );
    mockPrisma.contact.delete.mockResolvedValue({});
    mockPrisma.dismissedDuplicatePair.findMany.mockResolvedValue([
      // Dismissal on an unrelated pair must not block this merge.
      { userId: 'user-1', pairKey: duplicatePairKey('X', 'Y') },
    ]);

    const merged = await service.mergeContacts('user-1', 'A', ['B']);
    expect(merged).toBeDefined();
    expect(mockPrisma.contact.delete).toHaveBeenCalledWith({ where: { id: 'B' } });
  });

  it('the merge plan is deterministic regardless of input order', () => {
    const mk = (id: string, createdMs: number) =>
      makeContact(id, { createdAt: new Date(createdMs) }) as any;
    const dismissed = new Set([duplicatePairKey('A', 'C')]);
    const order1 = [mk('A', 1000), mk('B', 2000), mk('C', 3000), mk('D', 4000)];
    const order2 = [mk('D', 4000), mk('C', 3000), mk('B', 2000), mk('A', 1000)];
    expect(fingerprintMergePlan(buildMergePlan(order1, dismissed))).toBe(
      fingerprintMergePlan(buildMergePlan(order2, dismissed)),
    );
  });

  it('a dismissal-exhausted group never surfaces in the preview nor merges', async () => {
    mockContactsForMerge([makeContact('A'), makeContact('B')], [
      { userId: 'user-1', pairKey: duplicatePairKey('A', 'B') },
    ]);
    const preview = await service.findDuplicates('user-1');
    expect(preview).toHaveLength(0);
    const result = await service.deduplicateContacts('user-1');
    expect(result.mergedCount).toBe(0);
    expect(mockPrisma.contact.delete).not.toHaveBeenCalled();
  });

  it('sequential calls with fresh instances: A→P then B→P refuses the second merge (#1241)', async () => {
    // The defect the single-call test cannot see: POST /contacts/merge used
    // to check only the ids of the CURRENT call, so absorbing A into a third
    // primary P and then absorbing B into P on a second call — new service
    // instance, same persisted table — silently collapsed the dismissed pair
    // (A,B) into one record. The keep-separate decision must travel with the
    // absorbed record: merging A into P records (P,B), so the second call 409s.
    const contacts = [
      makeContact('P', { email: 'p@example.com', name: 'Primary' }),
      makeContact('A', { email: 'a@example.com', name: 'Alpha' }),
      makeContact('B', { email: 'b@example.com', name: 'Beta' }),
    ];
    const store = mockPersistentStore(contacts, [duplicatePairKey('A', 'B')]);
    mockPrisma = store as any;

    const first = new ContactService(mockPrisma as any);
    await first.mergeContacts('user-1', 'P', ['A']);
    expect(store.liveContacts.map((c: any) => c.id).sort()).toEqual(['B', 'P']);
    expect(store.liveDismissed.has(duplicatePairKey('P', 'B'))).toBe(true);

    const second = new ContactService(mockPrisma as any);
    await expect(second.mergeContacts('user-1', 'P', ['B'])).rejects.toMatchObject({
      statusCode: 409,
      code: 'KEEP_SEPARATE_CONFLICT',
    });
    expect(store.liveContacts.map((c: any) => c.id).sort()).toEqual(['B', 'P']);
    expect(
      mockPrisma.contact.delete.mock.calls.map((call: any) => call[0].where.id),
    ).not.toContain('B');
  });

  it('bulk propagation: a contact dropped by the plan cannot later merge into the survivor', async () => {
    // Same closure through the bulk path: the plan keeps S,B and drops C
    // (dismissed vs kept B), bulk deletes B — and B's dismissal must now
    // attach to S, or a later direct C→S merge would collapse B+C into S.
    const contacts = [
      makeContact('S', { createdAt: new Date(1000) }),
      makeContact('B', { createdAt: new Date(2000) }),
      makeContact('C', { createdAt: new Date(3000) }),
    ];
    const store = mockPersistentStore(contacts, [duplicatePairKey('B', 'C')]);
    mockPrisma = store as any;

    const bulkService = new ContactService(mockPrisma as any);
    const result = await bulkService.deduplicateContacts('user-1');
    expect(result.mergedCount).toBe(1);
    expect(store.liveContacts.map((c: any) => c.id).sort()).toEqual(['C', 'S']);
    expect(store.liveDismissed.has(duplicatePairKey('S', 'C'))).toBe(true);

    const direct = new ContactService(mockPrisma as any);
    await expect(direct.mergeContacts('user-1', 'S', ['C'])).rejects.toMatchObject({
      statusCode: 409,
      code: 'KEEP_SEPARATE_CONFLICT',
    });
    expect(store.liveContacts.map((c: any) => c.id).sort()).toEqual(['C', 'S']);
  });

  it('preview plan == execution plan exactly on resort-sensitive multi-group input', async () => {
    // Group 1 re-sorts (DB order A,B,C,D vs createdAt order B,C,A,D) and a
    // dismissal (A,C) drops A from the plan; group 2 is a plain pair. The
    // bulk run must delete exactly the preview's merge set — same survivor
    // set, same fingerprint — nothing extra, nothing missing.
    const contacts = [
      makeContact('A', { createdAt: new Date(3000) }),
      makeContact('B', { createdAt: new Date(1000) }),
      makeContact('C', { createdAt: new Date(2000) }),
      makeContact('D', { createdAt: new Date(4000) }),
      makeContact('E', { email: 'other@example.com', createdAt: new Date(1000) }),
      makeContact('F', { email: 'other@example.com', createdAt: new Date(2000) }),
    ];
    mockContactsForMerge(contacts, [
      { userId: 'user-1', pairKey: duplicatePairKey('A', 'C') },
    ]);

    const preview = await service.findDuplicatePlan('user-1');
    const previewMergeIds = preview.groups.flatMap((g) => g.duplicates.map((c) => c.id)).sort();
    const previewSurvivors = preview.groups.map((g) => g.primaryContact.id).sort();

    const result = await service.deduplicateContacts('user-1', {
      expectedFingerprint: preview.planFingerprint,
    });
    expect(result.planFingerprint).toBe(preview.planFingerprint);
    expect(result.mergedCount).toBe(previewMergeIds.length);
    expect(deletedIds().sort()).toEqual(previewMergeIds);
    // Survivors are exactly the preview's survivors plus the plan-dropped
    // contact A, which bulk must never delete.
    const survivors = contacts.map((c) => c.id).filter((id) => !deletedIds().includes(id));
    expect(survivors.sort()).toEqual([...previewSurvivors, 'A'].sort());
  });

  it('dismissed pair survives when neither member is the survivor', async () => {
    // The dismissal (X,Z) touches neither the DB-order primary X's successor
    // nor the resolved survivor Y (favorite): the old preview filtered only
    // against the original primary, so this shape is where the two paths
    // used to disagree. The plan keeps Y,Z and drops X; bulk deletes only Z.
    const contacts = [
      makeContact('X', { createdAt: new Date(3000) }),
      makeContact('Y', { createdAt: new Date(1000), isFavorite: true }),
      makeContact('Z', { createdAt: new Date(2000) }),
    ];
    mockContactsForMerge(contacts, [
      { userId: 'user-1', pairKey: duplicatePairKey('X', 'Z') },
    ]);

    const preview = await service.findDuplicates('user-1');
    expect(preview).toHaveLength(1);
    expect(preview[0]!.primaryContact.id).toBe('Y');
    expect(preview[0]!.duplicates.map((c) => c.id)).toEqual(['Z']);

    const result = await service.deduplicateContacts('user-1');
    expect(result.mergedCount).toBe(1);
    expect(deletedIds()).toEqual(['Z']);
    expect(deletedIds()).not.toContain('X');
  });

  it('full tiebreak: identical favorite/frequency/createdAt → smallest id survives, any input order', () => {
    const mk = (id: string) => makeContact(id) as any;
    const order1 = [mk('c3'), mk('c1'), mk('c2')];
    const order2 = [mk('c2'), mk('c3'), mk('c1')];
    const plan1 = buildMergePlan(order1, new Set());
    const plan2 = buildMergePlan(order2, new Set());
    expect(plan1).toHaveLength(1);
    expect(plan1[0]!.survivor.id).toBe('c1');
    expect(plan1[0]!.mergeIds).toEqual(['c2', 'c3']);
    expect(plan2[0]!.survivor.id).toBe('c1');
    expect(plan2[0]!.mergeIds).toEqual(['c2', 'c3']);
    expect(fingerprintMergePlan(plan2)).toBe(fingerprintMergePlan(plan1));
  });

  it('mixed partial rows still yield one deterministic plan', () => {
    // The NaN trap needs MIXED rows: undefined frequency vs a number, or an
    // invalid createdAt vs a valid one, makes the comparator return NaN,
    // which V8's sort treats as "equal" — so the survivor silently follows
    // DB row order instead of the tiebreak chain. The chain must be total:
    // missing frequency counts as 0, an invalid createdAt counts as epoch.
    const mk = (id: string, overrides: Record<string, unknown> = {}) =>
      ({ ...makeContact(id), ...overrides }) as any;
    const group = () => [
      mk('a', { frequency: undefined, createdAt: new Date(1000) }),
      mk('b', { frequency: 5, createdAt: new Date(NaN) }),
      mk('c', { frequency: 5, createdAt: new Date(1000) }),
    ];
    const shuffled = () => [
      mk('c', { frequency: 5, createdAt: new Date(1000) }),
      mk('a', { frequency: undefined, createdAt: new Date(1000) }),
      mk('b', { frequency: 5, createdAt: new Date(NaN) }),
    ];
    const plan1 = buildMergePlan(group(), new Set());
    const plan2 = buildMergePlan(shuffled(), new Set());
    expect(plan1[0]!.survivor.id).toBe('b');
    expect(plan1[0]!.mergeIds).toEqual(['c', 'a']);
    expect(plan2[0]!.survivor.id).toBe('b');
    expect(plan2[0]!.mergeIds).toEqual(['c', 'a']);
    expect(fingerprintMergePlan(plan2)).toBe(fingerprintMergePlan(plan1));
  });
});
