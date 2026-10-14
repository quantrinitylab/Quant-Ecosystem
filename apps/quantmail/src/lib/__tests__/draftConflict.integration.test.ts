import { describe, it, expect, vi } from 'vitest';
import { DraftBroadcast, draftShareKey, type DraftBroadcastChannelLike, type DraftChannelMessage } from '../draftBroadcast';
import { ServerDraftRef, saveServerDraft, type GuardedApiResponse } from '../serverDraft';

/**
 * Protocol-level proof for the qm-draft-conflict-tabs finding:
 * two composer instances in sibling tabs, sharing only the broadcast channel
 * and the server API, converge on ONE server draft (no second POST), and a
 * retirement from one tab makes the other mint exactly one fresh draft.
 *
 * This drives the same primitives the composers wire up (ServerDraftRef +
 * saveServerDraft + DraftBroadcast), so a regression in the wiring contract
 * breaks here first.
 */

function makeStubBus() {
  const buses = new Map<string, Set<(event: { data: DraftChannelMessage }) => void>>();
  const factory = (name: string): DraftBroadcastChannelLike | null => {
    if (!buses.has(name)) buses.set(name, new Set());
    const listeners = buses.get(name)!;
    return {
      postMessage(message: DraftChannelMessage) {
        for (const l of [...listeners]) l({ data: message });
      },
      addEventListener(_t: 'message', listener: (e: { data: DraftChannelMessage }) => void) {
        listeners.add(listener);
      },
      removeEventListener(_t: 'message', listener: (e: { data: DraftChannelMessage }) => void) {
        listeners.delete(listener);
      },
      close() {},
    };
  };
  return factory;
}

function ok<T>(data: T): GuardedApiResponse<T> {
  return { success: true, data };
}

/** A fake server: drafts table with version column, guarded updates. */
function makeFakeServer() {
  const rows = new Map<string, { version: number }>();
  let next = 1;
  return {
    createCount: 0,
    updateCalls: [] as Array<{ id: string; expectedVersion?: number }>,
    create: vi.fn(async (): Promise<GuardedApiResponse<{ id: string; version?: number }>> => {
      const id = `d${next++}`;
      rows.set(id, { version: 0 });
      return ok({ id, version: 0 });
    }),
    update: vi.fn(
      async (id: string, expectedVersion: number | undefined): Promise<GuardedApiResponse<{ id: string; version?: number }>> => {
        const row = rows.get(id);
        if (!row) {
          return { success: false, error: { code: 'EMAIL_NOT_FOUND', message: 'gone', statusCode: 404 } };
        }
        if (expectedVersion !== undefined && expectedVersion !== row.version) {
          return {
            success: false,
            error: {
              code: 'VERSION_CONFLICT',
              message: 'conflict',
              statusCode: 409,
              details: { currentVersion: row.version },
            },
          };
        }
        row.version += 1;
        return ok({ id, version: row.version });
      },
    ),
  };
}

interface Tab {
  ref: ServerDraftRef;
  bc: DraftBroadcast;
  save: () => Promise<boolean>;
}

/** Build one composer's save closure the way DockedComposer/EmailComposer do. */
function makeTab(server: ReturnType<typeof makeFakeServer>, busFactory: (name: string) => DraftBroadcastChannelLike | null, shareKey: string | null): Tab {
  const ref = new ServerDraftRef();
  const bc = new DraftBroadcast(busFactory);
  if (shareKey) {
    bc.onAdoption(shareKey, ({ draftId, version }) => {
      if (!ref.getId()) ref.adopt(draftId, version ?? null);
    });
    bc.onRetirement(shareKey, ({ draftId }) => {
      if (ref.getId() === draftId) ref.clear();
    });
    // Mirror the components: a late subscriber asks once whether a draft
    // already exists for the key instead of minting a second one.
    if (!ref.getId()) bc.requestDraft(shareKey);
  }
  const save = () =>
    saveServerDraft({
      ref,
      create: async () => {
        const res = await server.create();
        if (res.success && res.data?.id && shareKey) {
          bc.announce(shareKey, res.data.id, res.data.version);
        }
        return res;
      },
      update: (id, expectedVersion) => {
        server.updateCalls.push({ id, expectedVersion });
        return server.update(id, expectedVersion);
      },
    });
  return { ref, bc, save };
}

describe('two tabs replying to the same thread', () => {
  it('converge on ONE server draft — no second POST', async () => {
    const server = makeFakeServer();
    const bus = makeStubBus();
    const key = draftShareKey('email_1');
    const tabA = makeTab(server, bus, key);
    const tabB = makeTab(server, bus, key);

    await tabA.save(); // creates d1, announces
    await tabB.save(); // adopts d1, updates it — never creates

    expect(server.create).toHaveBeenCalledTimes(1);
    expect(tabA.ref.getId()).toBe('d1');
    expect(tabB.ref.getId()).toBe('d1');
    expect(server.updateCalls).toHaveLength(1);
    expect(server.updateCalls[0]).toEqual({ id: 'd1', expectedVersion: 0 });
  });

  it('concurrent edits do not silently overwrite: 409 -> conflict noticed, last-writer-wins retry', async () => {
    const server = makeFakeServer();
    const bus = makeStubBus();
    const key = draftShareKey('email_2');
    const tabA = makeTab(server, bus, key);
    const tabB = makeTab(server, bus, key);

    await tabA.save(); // d1 v0
    await tabB.save(); // adopts d1, saves -> server row now v1
    // Tab A's ref still believes v0 (it only observed the create). Its next
    // save must hit a 409, report the conflict, and retry with the fresh
    // version — last-writer-wins with a notice, not a silent overwrite.
    const noticed: string[] = [];
    const okSave = await saveServerDraft({
      ref: tabA.ref,
      create: async () => ok({ id: 'unused' }),
      update: (id, v) => server.update(id, v),
      onConflict: () => noticed.push('conflict'),
    });

    expect(okSave).toBe(true);
    expect(noticed).toEqual(['conflict']);
    // Same draft id throughout — exactly one create ever happened.
    expect(tabA.ref.getId()).toBe('d1');
    expect(server.create).toHaveBeenCalledTimes(1);
  });

  it('a retirement from one tab stops the other minting duplicates on a dead id', async () => {
    const server = makeFakeServer();
    const bus = makeStubBus();
    const key = draftShareKey('email_3');
    const tabA = makeTab(server, bus, key);
    const tabB = makeTab(server, bus, key);

    await tabA.save(); // d1
    await tabB.save(); // adopts d1
    // Tab A discards the draft on the server and retires the id.
    tabA.bc.retire(key!, 'd1', 'discarded');
    expect(tabB.ref.getId()).toBeNull();
    // Tab B's next save mints exactly ONE fresh draft — no 404 loop, no dupes.
    await tabB.save();
    expect(server.create).toHaveBeenCalledTimes(2);
    expect(tabB.ref.getId()).toBe('d2');
  });

  it('fresh composes never adopt each other (two blank windows stay separate)', async () => {
    const server = makeFakeServer();
    const bus = makeStubBus();
    const tabA = makeTab(server, bus, null);
    const tabB = makeTab(server, bus, null);

    await tabA.save();
    await tabB.save();

    expect(server.create).toHaveBeenCalledTimes(2);
    expect(tabA.ref.getId()).not.toBe(tabB.ref.getId());
  });

  it('a late subscriber (mounted after the announcement) still adopts — no second POST', async () => {
    const server = makeFakeServer();
    const bus = makeStubBus();
    const key = draftShareKey('email_4');
    const tabA = makeTab(server, bus, key);

    await tabA.save(); // creates d1, announces — tabB does not exist yet

    // Tab B mounts later: its requestDraft triggers tabA's re-announcement,
    // which arrives through the normal adoption subscription.
    const tabB = makeTab(server, bus, key);
    expect(tabB.ref.getId()).toBe('d1');

    await tabB.save(); // updates d1 — never creates
    expect(server.create).toHaveBeenCalledTimes(1);
    expect(server.updateCalls).toHaveLength(1);
    expect(server.updateCalls[0]).toEqual({ id: 'd1', expectedVersion: 0 });
  });
});
