import { describe, it, expect, vi } from 'vitest';
import { ProactiveRouter, ProactiveRequestSchema } from './proactive.router';
import type { ProactiveSearch } from '@quant/search';
import type { PermissionFilter } from '@quant/search';

function createMockDeps() {
  const proactiveSearch = {
    getRelatedItems: vi.fn().mockResolvedValue([
      {
        id: 'related-1',
        type: 'messages',
        score: 0.92,
        title: 'Chat about project X',
        snippet: 'Discussion with team about project X deadlines',
        metadata: { userId: 'user-1', visibility: 'public' },
      },
      {
        id: 'related-2',
        type: 'files',
        score: 0.87,
        title: 'Project X Roadmap.pdf',
        snippet: 'Q1 milestones and deliverables for project X',
        metadata: { userId: 'user-2', visibility: 'shared', sharedWith: ['user-1'] },
      },
      {
        id: 'related-3',
        type: 'emails',
        score: 0.81,
        title: 'Re: Project X Budget',
        snippet: 'Updated budget figures attached',
        metadata: { userId: 'user-3', visibility: 'private' },
      },
      {
        id: 'related-4',
        type: 'posts',
        score: 0.75,
        title: 'Project X Announcement',
        snippet: 'Excited to announce project X launch',
        metadata: { userId: 'user-4', visibility: 'public' },
      },
    ]),
  } as unknown as ProactiveSearch;

  const permissionFilter = {
    filterResults: vi.fn().mockImplementation((results, userId) => {
      return results.filter(
        (r: { ownerUserId: string; visibility: string; sharedWith?: string[] }) =>
          r.visibility === 'public' ||
          r.ownerUserId === userId ||
          (r.visibility === 'shared' && r.sharedWith?.includes(userId)),
      );
    }),
  } as unknown as PermissionFilter;

  return { proactiveSearch, permissionFilter };
}

describe('ProactiveRouter', () => {
  it('returns related items across different types when opening email context', async () => {
    const { proactiveSearch, permissionFilter } = createMockDeps();
    const router = new ProactiveRouter(proactiveSearch, permissionFilter);

    const response = await router.getRelatedItems({
      contextType: 'email',
      contextId: 'email-123',
      contentSnippet: 'Hey team, project X update for this week',
      userId: 'user-1',
      limit: 5,
    });

    // Should return 3+ related items (public + shared visible to user-1)
    expect(response.relatedItems.length).toBeGreaterThanOrEqual(3);
    expect(response.contextType).toBe('email');

    // Verify cross-app types present
    const types = response.relatedItems.map((item) => item.type);
    expect(types).toContain('messages');
    expect(types).toContain('files');
    expect(types).toContain('posts');
  });

  it('works with file context type', async () => {
    const { proactiveSearch, permissionFilter } = createMockDeps();
    const router = new ProactiveRouter(proactiveSearch, permissionFilter);

    const response = await router.getRelatedItems({
      contextType: 'file',
      contextId: 'file-456',
      contentSnippet: 'Quarterly report with project details',
      userId: 'user-1',
    });

    expect(response.contextType).toBe('file');
    expect(response.relatedItems).toBeDefined();
    expect(proactiveSearch.getRelatedItems).toHaveBeenCalledWith(
      {
        type: 'file',
        id: 'file-456',
        content: 'Quarterly report with project details',
      },
      { limit: 5 },
    );
  });

  it('works with calendar_event context type', async () => {
    const { proactiveSearch, permissionFilter } = createMockDeps();
    const router = new ProactiveRouter(proactiveSearch, permissionFilter);

    const response = await router.getRelatedItems({
      contextType: 'calendar_event',
      contextId: 'event-789',
      contentSnippet: 'Weekly standup meeting with engineering team',
      userId: 'user-1',
    });

    expect(response.contextType).toBe('calendar_event');
    expect(response.relatedItems).toBeDefined();
    expect(proactiveSearch.getRelatedItems).toHaveBeenCalledWith(
      {
        type: 'calendar_event',
        id: 'event-789',
        content: 'Weekly standup meeting with engineering team',
      },
      { limit: 5 },
    );
  });

  it('applies permission filter to proactive results', async () => {
    const { proactiveSearch, permissionFilter } = createMockDeps();
    const router = new ProactiveRouter(proactiveSearch, permissionFilter);

    const response = await router.getRelatedItems({
      contextType: 'email',
      contextId: 'email-123',
      contentSnippet: 'Project X discussion',
      userId: 'user-1',
    });

    // Permission filter should have been called
    expect(permissionFilter.filterResults).toHaveBeenCalled();

    // related-3 is private (owned by user-3), should be filtered out for user-1
    expect(response.relatedItems.some((item) => item.id === 'related-3')).toBe(false);

    // related-1 (public) and related-2 (shared with user-1) should be present
    expect(response.relatedItems.some((item) => item.id === 'related-1')).toBe(true);
    expect(response.relatedItems.some((item) => item.id === 'related-2')).toBe(true);
  });

  it('returns empty results gracefully for empty content', async () => {
    const proactiveSearch = {
      getRelatedItems: vi.fn().mockResolvedValue([]),
    } as unknown as ProactiveSearch;

    const permissionFilter = {
      filterResults: vi.fn().mockReturnValue([]),
    } as unknown as PermissionFilter;

    const router = new ProactiveRouter(proactiveSearch, permissionFilter);

    const response = await router.getRelatedItems({
      contextType: 'email',
      contextId: 'email-empty',
      contentSnippet: '',
      userId: 'user-1',
    });

    expect(response.relatedItems).toEqual([]);
    expect(response.contextType).toBe('email');
    expect(response.took).toBeGreaterThanOrEqual(0);
  });

  it('includes timing (took field) in response', async () => {
    const { proactiveSearch, permissionFilter } = createMockDeps();
    const router = new ProactiveRouter(proactiveSearch, permissionFilter);

    const response = await router.getRelatedItems({
      contextType: 'email',
      contextId: 'email-123',
      contentSnippet: 'Some content',
      userId: 'user-1',
    });

    expect(typeof response.took).toBe('number');
    expect(response.took).toBeGreaterThanOrEqual(0);
  });

  it('validates request with Zod schema', () => {
    const invalid = ProactiveRequestSchema.safeParse({
      contextType: 'invalid_type',
      contextId: 'id',
      contentSnippet: 'test',
      userId: 'user-1',
    });

    expect(invalid.success).toBe(false);
  });

  it('accepts valid context types', () => {
    const validTypes = ['email', 'message', 'post', 'video', 'file', 'calendar_event'] as const;

    for (const contextType of validTypes) {
      const result = ProactiveRequestSchema.safeParse({
        contextType,
        contextId: 'test-id',
        contentSnippet: 'test content',
        userId: 'user-1',
      });
      expect(result.success).toBe(true);
    }
  });
});
