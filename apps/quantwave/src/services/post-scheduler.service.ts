// ============================================================================
// QuantSync - Post Scheduler Service
// Schedule posts for future publication with timezone-aware scheduling
// ============================================================================

export interface ScheduledPost {
  id: string;
  content: string;
  media?: string[];
  scheduledAt: number;
  timezone: string;
  status: 'scheduled' | 'published' | 'failed' | 'cancelled';
  platforms: string[];
}

export class PostSchedulerService {
  private posts: Map<string, ScheduledPost> = new Map();
  private postCounter = 0;

  schedule(post: Omit<ScheduledPost, 'id' | 'status'>): ScheduledPost {
    if (post.scheduledAt <= Date.now()) {
      throw new Error('Scheduled time must be in the future');
    }

    if (post.platforms.length === 0) {
      throw new Error('At least one platform must be specified');
    }

    this.postCounter += 1;
    const scheduled: ScheduledPost = {
      ...post,
      id: `post-${this.postCounter}`,
      status: 'scheduled',
    };

    this.posts.set(scheduled.id, scheduled);
    return scheduled;
  }

  cancel(id: string): boolean {
    const post = this.posts.get(id);
    if (!post) {
      return false;
    }

    if (post.status !== 'scheduled') {
      return false;
    }

    this.posts.set(id, { ...post, status: 'cancelled' });
    return true;
  }

  update(id: string, changes: Partial<ScheduledPost>): ScheduledPost | null {
    const post = this.posts.get(id);
    if (!post) {
      return null;
    }

    if (post.status !== 'scheduled') {
      return null;
    }

    if (changes.scheduledAt !== undefined && changes.scheduledAt <= Date.now()) {
      throw new Error('Scheduled time must be in the future');
    }

    const updated: ScheduledPost = {
      ...post,
      ...changes,
      id: post.id, // Prevent id change
      status: post.status, // Prevent status change via update
    };

    this.posts.set(id, updated);
    return updated;
  }

  getScheduled(): ScheduledPost[] {
    return Array.from(this.posts.values())
      .filter((p) => p.status === 'scheduled')
      .sort((a, b) => a.scheduledAt - b.scheduledAt);
  }

  getOptimalTimes(_dayOfWeek: number): number[] {
    // Suggest optimal posting times (hour of day in 24h format)
    // Based on typical social media engagement patterns
    return [9, 12, 17, 19, 21];
  }

  checkAndPublish(): ScheduledPost[] {
    const now = Date.now();
    const published: ScheduledPost[] = [];

    for (const [id, post] of this.posts.entries()) {
      if (post.status === 'scheduled' && post.scheduledAt <= now) {
        const updated: ScheduledPost = { ...post, status: 'published' };
        this.posts.set(id, updated);
        published.push(updated);
      }
    }

    return published;
  }
}
