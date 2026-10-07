import { Agent } from '../core/agent.js';
import { logger } from '@quant/common';
import { HttpClient, createQuantSyncClient } from '../clients/http-client.js';

export class QuantSyncAgent extends Agent {
  private httpClient: HttpClient;

  constructor(httpClient?: HttpClient) {
    super({
      id: 'quantsync-agent',
      name: 'QuantSync Agent',
      personality: 'Social, trend-aware, content curation specialist',
      capabilities: [
        'create_post',
        'curate_feed',
        'manage_communities',
        'suggest_connections',
        'content_moderation',
        'trend_analysis',
      ],
    });

    this.httpClient = httpClient ?? createQuantSyncClient();
    this.registerSyncTools();
  }

  private registerSyncTools() {
    this.addTool({
      name: 'quantsync_create_post',
      description: 'Create a social post',
      parameters: {
        content: 'string',
        visibility: 'string',
        communityId: 'string',
      },
      execute: async (params: any) => {
        logger.log('[QuantSyncAgent] Creating post:', params);

        const response = await this.httpClient.post('/api/posts', {
          content: params.content,
          visibility: params.visibility || 'public',
          communityId: params.communityId,
        });

        if (!response.ok) {
          logger.warn('[QuantSyncAgent] Failed to create post:', response.error);
          return { success: false, error: response.error };
        }

        return {
          success: true,
          postId: response.data?.id || response.data?.postId,
          url: response.data?.url,
        };
      },
    });

    this.addTool({
      name: 'quantsync_trending',
      description: 'Get trending topics and communities',
      parameters: {},
      execute: async () => {
        logger.log('[QuantSyncAgent] Fetching trending topics');

        const response = await this.httpClient.get('/api/trending');

        if (!response.ok) {
          logger.warn('[QuantSyncAgent] Failed to get trending:', response.error);
          // Graceful fallback
          return {
            trendingTopics: [],
            trendingCommunities: [],
            error: response.error,
          };
        }

        return {
          trendingTopics: response.data?.topics || response.data?.trendingTopics || [],
          trendingCommunities:
            response.data?.communities || response.data?.trendingCommunities || [],
        };
      },
    });
  }
}
