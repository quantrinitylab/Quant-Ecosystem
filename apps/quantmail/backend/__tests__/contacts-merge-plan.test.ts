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
});
