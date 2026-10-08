/**
 * QM-BACK-006 — derived-index invalidation (doc 23 EC-03).
 *
 * When lifecycle transitions erase data, the derived search indexes must drop
 * the document — otherwise search keeps returning deleted data. Purges are
 * idempotent, and the handler checkpoints the event cursor after each durable
 * purge so a crashed consumer resumes from the checkpoint.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LifecycleInvalidationHandler,
  MemoryCheckpointStore,
  INVALIDATION_CONSUMER_ID,
} from './lifecycle.handler';

function createClients() {
  const searchClient = { deleteDocument: vi.fn(async () => {}) };
  const vectorClient = { deletePoints: vi.fn(async () => {}) };
  return { searchClient, vectorClient };
}

describe('LifecycleInvalidationHandler', () => {
  let clients: ReturnType<typeof createClients>;
  let checkpoints: MemoryCheckpointStore;
  let handler: LifecycleInvalidationHandler;

  beforeEach(() => {
    clients = createClients();
    checkpoints = new MemoryCheckpointStore();
    handler = new LifecycleInvalidationHandler(
      clients.searchClient,
      clients.vectorClient,
      checkpoints,
    );
  });

  it('purges the derived document on hard mail deletion and checkpoints', async () => {
    const outcome = await handler.handleInvalidation({
      id: 'evt-1',
      eventType: 'mail.message.deleted.v1',
      aggregateType: 'Email',
      aggregateId: 'email-1',
      payload: { hard: true, emailId: 'email-1', userId: 'user-1' },
    });

    expect(outcome).toEqual({ action: 'purged', target: 'emails:email-1' });
    expect(clients.searchClient.deleteDocument).toHaveBeenCalledWith('emails', 'email-1');
    expect(clients.vectorClient.deletePoints).toHaveBeenCalledWith('emails', ['email-1']);
    expect(await checkpoints.getCheckpoint(INVALIDATION_CONSUMER_ID)).toBe('evt-1');
  });

  it('falls back to the envelope aggregateId when the payload lacks emailId', async () => {
    const outcome = await handler.handleInvalidation({
      id: 'evt-2',
      eventType: 'mail.message.deleted.v1',
      aggregateType: 'Email',
      aggregateId: 'email-9',
      payload: { hard: true },
    });
    expect(outcome).toEqual({ action: 'purged', target: 'emails:email-9' });
  });

  it('skips soft deletes (trash moves stay searchable) without checkpointing', async () => {
    const outcome = await handler.handleInvalidation({
      id: 'evt-3',
      eventType: 'mail.message.deleted.v1',
      aggregateType: 'Email',
      aggregateId: 'email-1',
      payload: { hard: false, emailId: 'email-1' },
    });

    expect(outcome.action).toBe('skipped');
    expect(clients.searchClient.deleteDocument).not.toHaveBeenCalled();
    expect(clients.vectorClient.deletePoints).not.toHaveBeenCalled();
    expect(await checkpoints.getCheckpoint(INVALIDATION_CONSUMER_ID)).toBeNull();
  });

  it('purges on data.deletion.completed.v1 by targetKind/targetId', async () => {
    const outcome = await handler.handleInvalidation({
      id: 'evt-4',
      eventType: 'data.deletion.completed.v1',
      aggregateType: 'Email',
      aggregateId: 'email-7',
      payload: {
        actor: 'system:retention-sweep',
        targetId: 'email-7',
        targetKind: 'Email',
        operationId: 'op-1',
        invalidatedIndexes: ['emails'],
      },
    });

    expect(outcome).toEqual({ action: 'purged', target: 'emails:email-7' });
    expect(await checkpoints.getCheckpoint(INVALIDATION_CONSUMER_ID)).toBe('evt-4');
  });

  it('is idempotent: duplicate events purge again without error', async () => {
    const event = {
      id: 'evt-5',
      eventType: 'data.deletion.completed.v1',
      aggregateType: 'Email',
      aggregateId: 'email-7',
      payload: { targetId: 'email-7', targetKind: 'Email' },
    };
    await handler.handleInvalidation(event);
    const outcome = await handler.handleInvalidation(event);
    expect(outcome.action).toBe('purged');
    expect(clients.searchClient.deleteDocument).toHaveBeenCalledTimes(2);
  });

  it('skips unknown aggregate types and unparseable payloads', async () => {
    const unknown = await handler.handleInvalidation({
      id: 'evt-6',
      eventType: 'data.deletion.completed.v1',
      aggregateType: 'Unicorn',
      aggregateId: 'u-1',
      payload: { targetId: 'u-1', targetKind: 'Unicorn' },
    });
    expect(unknown.action).toBe('skipped');
    expect(clients.searchClient.deleteDocument).not.toHaveBeenCalled();

    const bad = await handler.handleInvalidation({
      id: 'evt-7',
      eventType: 'data.deletion.completed.v1',
      aggregateType: 'Email',
      aggregateId: 'email-1',
      payload: { nonsense: true },
    });
    expect(bad.action).toBe('skipped');

    const other = await handler.handleInvalidation({
      id: 'evt-8',
      eventType: 'mail.message.received.v1',
      aggregateType: 'Email',
      aggregateId: 'email-1',
      payload: {},
    });
    expect(other.action).toBe('skipped');
  });

  it('checkpoint advances monotonically across events', async () => {
    for (const id of ['evt-10', 'evt-11', 'evt-12']) {
      await handler.handleInvalidation({
        id,
        eventType: 'data.deletion.completed.v1',
        aggregateType: 'Email',
        aggregateId: 'email-1',
        payload: { targetId: 'email-1', targetKind: 'Email' },
      });
    }
    expect(await checkpoints.getCheckpoint(INVALIDATION_CONSUMER_ID)).toBe('evt-12');
  });
});
