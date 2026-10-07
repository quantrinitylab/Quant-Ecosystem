import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuantSyncAgent } from '../agents/quantsync.agent.js';
import { HttpClient } from '../clients/http-client.js';

describe('QuantSyncAgent - real HTTP calls', () => {
  let mockClient: HttpClient;
  let agent: QuantSyncAgent;

  beforeEach(() => {
    mockClient = {
      post: vi.fn(),
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      setAuthToken: vi.fn(),
      getBaseUrl: vi.fn().mockReturnValue('http://localhost:3005'),
    } as unknown as HttpClient;

    agent = new QuantSyncAgent(mockClient);
  });

  describe('quantsync_create_post', () => {
    it('calls POST /api/posts with correct parameters', async () => {
      (mockClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 201,
        data: { id: 'post-001', url: 'https://sync.quant.app/post/post-001' },
      });

      const tool = (agent as any).tools.get('quantsync_create_post');
      const result = await tool.execute({
        content: 'Excited about the new release!',
        visibility: 'public',
        communityId: 'tech-founders',
      });

      expect(mockClient.post).toHaveBeenCalledWith('/api/posts', {
        content: 'Excited about the new release!',
        visibility: 'public',
        communityId: 'tech-founders',
      });
      expect(result.success).toBe(true);
      expect(result.postId).toBe('post-001');
      expect(result.url).toBe('https://sync.quant.app/post/post-001');
    });

    it('returns error object on failure without crashing', async () => {
      (mockClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 403,
        data: null,
        error: 'Not authorized to post in this community',
      });

      const tool = (agent as any).tools.get('quantsync_create_post');
      const result = await tool.execute({ content: 'test', communityId: 'restricted' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not authorized to post in this community');
    });
  });

  describe('quantsync_trending', () => {
    it('calls GET /api/trending and returns topics/communities', async () => {
      (mockClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          topics: ['AI Agents', 'TypeScript 6', 'Edge Computing'],
          communities: ['AI Researchers', 'Web Developers'],
        },
      });

      const tool = (agent as any).tools.get('quantsync_trending');
      const result = await tool.execute({});

      expect(mockClient.get).toHaveBeenCalledWith('/api/trending');
      expect(result.trendingTopics).toEqual(['AI Agents', 'TypeScript 6', 'Edge Computing']);
      expect(result.trendingCommunities).toEqual(['AI Researchers', 'Web Developers']);
    });

    it('returns empty arrays on failure', async () => {
      (mockClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        data: null,
        error: 'Search indexer down',
      });

      const tool = (agent as any).tools.get('quantsync_trending');
      const result = await tool.execute({});

      expect(result.trendingTopics).toEqual([]);
      expect(result.trendingCommunities).toEqual([]);
      expect(result.error).toBe('Search indexer down');
    });
  });
});
