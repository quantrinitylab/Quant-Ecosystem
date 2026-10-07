import { describe, it, expect, vi } from 'vitest';
import { UserIndexHandler, type UserEvent } from './user.handler';
import type { SearchClient } from '@quant/search';

function createMockSearchClient() {
  return {
    indexDocument: vi.fn().mockResolvedValue(undefined),
  } as unknown as SearchClient;
}

function createUserEvent(overrides: Partial<UserEvent> = {}): UserEvent {
  return {
    id: 'user-1',
    username: 'johndoe',
    displayName: 'John Doe',
    bio: 'Software engineer who loves building search engines',
    role: 'user',
    status: 'active',
    createdAt: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

describe('UserIndexHandler', () => {
  it('indexes user to MeiliSearch with all profile fields', async () => {
    const searchClient = createMockSearchClient();
    const handler = new UserIndexHandler(searchClient);
    const event = createUserEvent();

    await handler.handle(event);

    expect(searchClient.indexDocument).toHaveBeenCalledWith('users', {
      id: 'user-1',
      username: 'johndoe',
      displayName: 'John Doe',
      bio: 'Software engineer who loves building search engines',
      role: 'user',
      status: 'active',
      createdAt: '2024-01-15T10:00:00Z',
    });
  });

  it('handles user.updated events (same indexing logic)', async () => {
    const searchClient = createMockSearchClient();
    const handler = new UserIndexHandler(searchClient);
    const event = createUserEvent({ displayName: 'John D.', bio: 'Updated bio' });

    await handler.handle(event);

    expect(searchClient.indexDocument).toHaveBeenCalledWith(
      'users',
      expect.objectContaining({
        displayName: 'John D.',
        bio: 'Updated bio',
      }),
    );
  });

  it('does not use vector client (no embedding for user profiles)', async () => {
    const searchClient = createMockSearchClient();
    const handler = new UserIndexHandler(searchClient);
    const event = createUserEvent();

    await handler.handle(event);

    // Only searchClient should be called, no vectorClient dependency
    expect(searchClient.indexDocument).toHaveBeenCalledTimes(1);
  });

  it('throws on invalid payload', async () => {
    const searchClient = createMockSearchClient();
    const handler = new UserIndexHandler(searchClient);

    await expect(handler.handle({ id: 'bad' })).rejects.toThrow();
  });
});
