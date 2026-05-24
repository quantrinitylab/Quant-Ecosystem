// ============================================================================
// QuantTube API - Podcast Service
// RSS import, episode management, auto-transcription, chapters
// ============================================================================

interface Podcast {
  id: string;
  title: string;
  author: string;
  description: string;
  coverUrl: string;
  rssUrl: string | null;
  category: string;
  language: string;
  episodeCount: number;
  subscriberCount: number;
  rating: number;
  isExplicit: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Episode {
  id: string;
  podcastId: string;
  title: string;
  description: string;
  audioUrl: string;
  duration: number;
  publishedAt: string;
  episodeNumber: number;
  seasonNumber: number | null;
  transcription: string | null;
  chapters: EpisodeChapter[];
  isExplicit: boolean;
  playCount: number;
}

interface EpisodeChapter {
  title: string;
  startTime: number;
  endTime: number;
}

interface RSSFeed {
  title: string;
  author: string;
  description: string;
  imageUrl: string;
  episodes: RSSEpisode[];
}

interface RSSEpisode {
  title: string;
  description: string;
  audioUrl: string;
  duration: number;
  publishedAt: string;
}

interface PodcastSubscription {
  userId: string;
  podcastId: string;
  subscribedAt: string;
  notificationsEnabled: boolean;
  lastListenedEpisodeId: string | null;
}

class PodcastService {
  private podcasts: Map<string, Podcast> = new Map();
  private episodes: Map<string, Episode> = new Map();
  private subscriptions: Map<string, PodcastSubscription[]> = new Map();

  async importFromRSS(rssUrl: string, userId: string): Promise<Podcast> {
    const feed = await this.parseRSSFeed(rssUrl);
    const podcast: Podcast = {
      id: `pod_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      title: feed.title,
      author: feed.author,
      description: feed.description,
      coverUrl: feed.imageUrl,
      rssUrl: rssUrl,
      category: 'Technology',
      language: 'en',
      episodeCount: feed.episodes.length,
      subscriberCount: 0,
      rating: 0,
      isExplicit: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.podcasts.set(podcast.id, podcast);

    for (let i = 0; i < feed.episodes.length; i++) {
      const ep = feed.episodes[i];
      const episode: Episode = {
        id: `ep_${Date.now()}_${i}`,
        podcastId: podcast.id,
        title: ep.title,
        description: ep.description,
        audioUrl: ep.audioUrl,
        duration: ep.duration,
        publishedAt: ep.publishedAt,
        episodeNumber: feed.episodes.length - i,
        seasonNumber: null,
        transcription: null,
        chapters: [],
        isExplicit: false,
        playCount: 0,
      };
      this.episodes.set(episode.id, episode);
    }

    return podcast;
  }

  async getPodcast(podcastId: string): Promise<Podcast | null> {
    return this.podcasts.get(podcastId) || null;
  }

  async getEpisodes(podcastId: string, limit: number = 20, offset: number = 0): Promise<Episode[]> {
    return Array.from(this.episodes.values())
      .filter(ep => ep.podcastId === podcastId)
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(offset, offset + limit);
  }

  async subscribe(userId: string, podcastId: string): Promise<PodcastSubscription> {
    const sub: PodcastSubscription = {
      userId,
      podcastId,
      subscribedAt: new Date().toISOString(),
      notificationsEnabled: true,
      lastListenedEpisodeId: null,
    };
    const userSubs = this.subscriptions.get(userId) || [];
    userSubs.push(sub);
    this.subscriptions.set(userId, userSubs);

    const podcast = this.podcasts.get(podcastId);
    if (podcast) podcast.subscriberCount++;

    return sub;
  }

  async unsubscribe(userId: string, podcastId: string): Promise<void> {
    const userSubs = this.subscriptions.get(userId) || [];
    this.subscriptions.set(userId, userSubs.filter(s => s.podcastId !== podcastId));
    const podcast = this.podcasts.get(podcastId);
    if (podcast) podcast.subscriberCount = Math.max(0, podcast.subscriberCount - 1);
  }

  async getSubscriptions(userId: string): Promise<Podcast[]> {
    const userSubs = this.subscriptions.get(userId) || [];
    return userSubs.map(sub => this.podcasts.get(sub.podcastId)).filter((p): p is Podcast => p !== undefined);
  }

  async generateTranscription(episodeId: string): Promise<string> {
    const episode = this.episodes.get(episodeId);
    if (!episode) throw new Error('Episode not found');
    const transcription = `[Auto-generated transcription for "${episode.title}"]\n\n` +
      `This is a simulated transcription of the episode content.\n` +
      `Duration: ${Math.floor(episode.duration / 60)} minutes.\n`;
    episode.transcription = transcription;
    return transcription;
  }

  async generateChapters(episodeId: string): Promise<EpisodeChapter[]> {
    const episode = this.episodes.get(episodeId);
    if (!episode) throw new Error('Episode not found');
    const chapterCount = Math.max(3, Math.floor(episode.duration / 600));
    const chapterDuration = episode.duration / chapterCount;
    const chapters: EpisodeChapter[] = [];
    const titles = ['Introduction', 'Main Topic', 'Deep Dive', 'Discussion', 'Q&A', 'Closing Thoughts', 'Recap'];
    for (let i = 0; i < chapterCount; i++) {
      chapters.push({
        title: titles[i % titles.length],
        startTime: i * chapterDuration,
        endTime: (i + 1) * chapterDuration,
      });
    }
    episode.chapters = chapters;
    return chapters;
  }

  async search(query: string, category?: string): Promise<Podcast[]> {
    const lowerQuery = query.toLowerCase();
    let results = Array.from(this.podcasts.values());
    if (category) results = results.filter(p => p.category === category);
    return results.filter(p =>
      p.title.toLowerCase().includes(lowerQuery) ||
      p.author.toLowerCase().includes(lowerQuery) ||
      p.description.toLowerCase().includes(lowerQuery)
    );
  }

  async recordPlay(episodeId: string, userId: string): Promise<void> {
    const episode = this.episodes.get(episodeId);
    if (episode) episode.playCount++;
    const userSubs = this.subscriptions.get(userId) || [];
    const sub = userSubs.find(s => s.podcastId === episode?.podcastId);
    if (sub) sub.lastListenedEpisodeId = episodeId;
  }

  async browse(category: string, limit: number = 20): Promise<Podcast[]> {
    return Array.from(this.podcasts.values())
      .filter(p => p.category === category)
      .sort((a, b) => b.subscriberCount - a.subscriberCount)
      .slice(0, limit);
  }

  private async parseRSSFeed(url: string): Promise<RSSFeed> {
    return {
      title: 'Imported Podcast',
      author: 'Unknown Author',
      description: 'Imported via RSS feed',
      imageUrl: '/covers/default-podcast.jpg',
      episodes: [
        { title: 'Episode 1', description: 'First episode', audioUrl: '/audio/ep1.mp3', duration: 1800, publishedAt: '2024-01-01T00:00:00Z' },
        { title: 'Episode 2', description: 'Second episode', audioUrl: '/audio/ep2.mp3', duration: 2400, publishedAt: '2024-01-08T00:00:00Z' },
      ],
    };
  }
}

export const podcastService = new PodcastService();
export default PodcastService;
