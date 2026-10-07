import { describe, it, expect } from 'vitest';
import { ReplicaRouter, createReplicaRouter } from '../src/replica-router.js';

describe('ReplicaRouter', () => {
  const primary = { _type: 'primary' } as never;
  const replica = { _type: 'replica' } as never;

  it('forRead returns replica client', () => {
    const router = new ReplicaRouter(primary, replica);
    expect(router.forRead()).toBe(replica);
  });

  it('forWrite returns primary client', () => {
    const router = new ReplicaRouter(primary, replica);
    expect(router.forWrite()).toBe(primary);
  });

  it('withPrimary forces reads to primary', () => {
    const router = new ReplicaRouter(primary, replica);

    router.withPrimary((client) => {
      expect(client).toBe(primary);
      expect(router.forRead()).toBe(primary);
      return null;
    });

    // After withPrimary, forRead goes back to replica
    expect(router.forRead()).toBe(replica);
  });

  it('withPrimary restores state even on error', () => {
    const router = new ReplicaRouter(primary, replica);

    expect(() => {
      router.withPrimary(() => {
        throw new Error('test error');
      });
    }).toThrow('test error');

    expect(router.forRead()).toBe(replica);
  });

  it('createReplicaRouter factory works', () => {
    const router = createReplicaRouter(primary, replica);
    expect(router).toBeInstanceOf(ReplicaRouter);
    expect(router.forRead()).toBe(replica);
    expect(router.forWrite()).toBe(primary);
  });
});
