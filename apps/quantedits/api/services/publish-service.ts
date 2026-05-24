// ============================================================================
// QuantEdits - Publish Service
// Cross-app publishing to QuantNeon, QuantTube, QuantSync, QuantMax
// ============================================================================

import type { PublishTarget, ExportJob } from '../../src/types';

interface PublishResult {
  id: string;
  target: PublishTarget;
  status: 'pending' | 'publishing' | 'published' | 'failed';
  postId?: string;
  postUrl?: string;
  error?: string;
  publishedAt?: string;
}

interface PublishHistory {
  id: string;
  projectId: string;
  userId: string;
  results: PublishResult[];
  createdAt: string;
}

const APP_ENDPOINTS: Record<string, { url: string; maxFileSize: number; formats: string[] }> = {
  quantneon: { url: 'https://neon.quant.app/api/posts', maxFileSize: 50 * 1024 * 1024, formats: ['jpg', 'png', 'webp', 'mp4', 'mov'] },
  quantube: { url: 'https://tube.quant.app/api/videos', maxFileSize: 2048 * 1024 * 1024, formats: ['mp4', 'mov', 'webm'] },
  quantsync: { url: 'https://sync.quant.app/api/posts', maxFileSize: 25 * 1024 * 1024, formats: ['jpg', 'png', 'gif', 'mp4'] },
  quantmax: { url: 'https://max.quant.app/api/videos', maxFileSize: 100 * 1024 * 1024, formats: ['mp4', 'mov'] },
};

export class PublishService {
  private history: Map<string, PublishHistory> = new Map();

  async publishToTargets(projectId: string, userId: string, exportUrl: string, targets: PublishTarget[]): Promise<PublishHistory> {
    const publishHistory: PublishHistory = {
      id: `pub_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
      projectId,
      userId,
      results: [],
      createdAt: new Date().toISOString(),
    };

    for (const target of targets) {
      const result = await this.publishToApp(target, exportUrl, userId);
      publishHistory.results.push(result);
    }

    this.history.set(publishHistory.id, publishHistory);
    return publishHistory;
  }

  private async publishToApp(target: PublishTarget, exportUrl: string, userId: string): Promise<PublishResult> {
    const appConfig = APP_ENDPOINTS[target.app];
    if (!appConfig) {
      return {
        id: `pr_${Date.now().toString(36)}`,
        target,
        status: 'failed',
        error: `Unknown target app: ${target.app}`,
      };
    }

    const result: PublishResult = {
      id: `pr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      target,
      status: 'publishing',
    };

    try {
      // Simulate publishing to the target app
      await new Promise(resolve => setTimeout(resolve, 100));

      const postId = `post_${target.app}_${Date.now().toString(36)}`;
      result.status = 'published';
      result.postId = postId;
      result.postUrl = `${appConfig.url}/${postId}`;
      result.publishedAt = new Date().toISOString();

      if (target.schedule) {
        result.status = 'pending';
        result.publishedAt = undefined;
      }
    } catch (error: any) {
      result.status = 'failed';
      result.error = error.message || 'Publishing failed';
    }

    return result;
  }

  getPublishHistory(userId: string, projectId?: string): PublishHistory[] {
    let results = Array.from(this.history.values()).filter(h => h.userId === userId);
    if (projectId) results = results.filter(h => h.projectId === projectId);
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getAvailableTargets(): { app: string; name: string; maxFileSize: number; formats: string[] }[] {
    return [
      { app: 'quantneon', name: 'QuantNeon', ...APP_ENDPOINTS['quantneon'] },
      { app: 'quantube', name: 'QuantTube', ...APP_ENDPOINTS['quantube'] },
      { app: 'quantsync', name: 'QuantSync', ...APP_ENDPOINTS['quantsync'] },
      { app: 'quantmax', name: 'QuantMax', ...APP_ENDPOINTS['quantmax'] },
    ];
  }

  validateTarget(target: PublishTarget, format: string, fileSize: number): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const appConfig = APP_ENDPOINTS[target.app];
    if (!appConfig) { errors.push(`Invalid target app: ${target.app}`); return { valid: false, errors }; }
    if (!appConfig.formats.includes(format)) errors.push(`Format ${format} not supported by ${target.app}`);
    if (fileSize > appConfig.maxFileSize) errors.push(`File size exceeds ${target.app} limit`);
    if (!target.title) errors.push('Title is required');
    return { valid: errors.length === 0, errors };
  }
}

export const publishService = new PublishService();
