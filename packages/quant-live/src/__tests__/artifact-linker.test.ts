import { describe, it, expect } from 'vitest';
import { InMemorySessionStore } from '../persistence/memory-store.js';
import { ArtifactLinker } from '../persistence/artifact-linker.js';

describe('ArtifactLinker', () => {
  it('links an artifact to a session', async () => {
    const store = new InMemorySessionStore();
    await store.create({
      state: 'idle',
      createdAt: Date.now(),
      transcript: [],
      artifacts: [],
      userId: 'u1',
    });
    const linker = new ArtifactLinker(store);
    const artifact = await linker.link('ls-1', {
      type: 'email',
      title: 'Test',
      description: 'desc',
      resourceId: 'r1',
      appName: 'mail',
      createdAt: Date.now(),
    });
    expect(artifact.sessionId).toBe('ls-1');
  });

  it('retrieves artifacts by session', async () => {
    const store = new InMemorySessionStore();
    await store.create({
      state: 'idle',
      createdAt: Date.now(),
      transcript: [],
      artifacts: [],
      userId: 'u1',
    });
    const linker = new ArtifactLinker(store);
    await linker.link('ls-1', {
      type: 'email',
      title: 'E1',
      description: 'd',
      resourceId: 'r1',
      appName: 'mail',
      createdAt: 1,
    });
    await linker.link('ls-1', {
      type: 'document',
      title: 'D1',
      description: 'd',
      resourceId: 'r2',
      appName: 'docs',
      createdAt: 2,
    });
    const all = await linker.getBySession('ls-1');
    expect(all.length).toBe(2);
  });

  it('retrieves artifacts by type', async () => {
    const store = new InMemorySessionStore();
    await store.create({
      state: 'idle',
      createdAt: Date.now(),
      transcript: [],
      artifacts: [],
      userId: 'u1',
    });
    const linker = new ArtifactLinker(store);
    await linker.link('ls-1', {
      type: 'email',
      title: 'E1',
      description: 'd',
      resourceId: 'r1',
      appName: 'mail',
      createdAt: 1,
    });
    await linker.link('ls-1', {
      type: 'document',
      title: 'D1',
      description: 'd',
      resourceId: 'r2',
      appName: 'docs',
      createdAt: 2,
    });
    const emails = await linker.getByType('ls-1', 'email');
    expect(emails.length).toBe(1);
    expect(emails[0]!.type).toBe('email');
  });

  it('throws for non-existent session', async () => {
    const store = new InMemorySessionStore();
    const linker = new ArtifactLinker(store);
    await expect(
      linker.link('bad-id', {
        type: 'file',
        title: 'x',
        description: 'x',
        resourceId: 'x',
        appName: 'x',
        createdAt: 0,
      }),
    ).rejects.toThrow('Session not found');
  });
});
