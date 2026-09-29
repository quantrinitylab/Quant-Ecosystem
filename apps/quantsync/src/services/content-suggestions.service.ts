// ============================================================================
// QuantSync - Content Suggestions Service
// Generate content ideas, trending topics, and optimal posting times
// ============================================================================

export interface ContentSuggestion {
  id: string;
  topic: string;
  hook: string;
  format: 'text' | 'image' | 'video' | 'poll' | 'thread';
  estimatedEngagement: number;
  trendingScore: number;
}

export class ContentSuggestionsService {
  private suggestionCounter = 0;

  private readonly hookTemplates: string[] = [
    'Did you know that {{topic}} is changing everything?',
    'Here are 5 things about {{topic}} nobody talks about',
    "The truth about {{topic}} that experts won't tell you",
    "I spent 30 days researching {{topic}}. Here's what I found",
    'Stop scrolling. This is important about {{topic}}',
    "Unpopular opinion: {{topic}} is overrated. Here's why",
    'The biggest misconception about {{topic}}',
    '{{topic}} is evolving fast. Are you keeping up?',
  ];

  private readonly trendingData: { topic: string; volume: number; growth: number }[] = [
    { topic: 'AI productivity', volume: 15000, growth: 45 },
    { topic: 'Remote work', volume: 12000, growth: 20 },
    { topic: 'Web development', volume: 18000, growth: 15 },
    { topic: 'Startup culture', volume: 9000, growth: 30 },
    { topic: 'Personal branding', volume: 11000, growth: 35 },
    { topic: 'Tech layoffs', volume: 8000, growth: 50 },
    { topic: 'Open source', volume: 7000, growth: 10 },
    { topic: 'Machine learning', volume: 14000, growth: 25 },
  ];

  getSuggestions(topic: string, count: number): ContentSuggestion[] {
    const formats: ContentSuggestion['format'][] = ['text', 'image', 'video', 'poll', 'thread'];
    const suggestions: ContentSuggestion[] = [];

    const effectiveCount = Math.min(count, this.hookTemplates.length);

    for (let i = 0; i < effectiveCount; i++) {
      this.suggestionCounter += 1;
      const template = this.hookTemplates[i % this.hookTemplates.length];
      const hook = template ? template.replace('{{topic}}', topic) : topic;
      const format = formats[i % formats.length] ?? 'text';

      suggestions.push({
        id: `suggestion-${this.suggestionCounter}`,
        topic,
        hook,
        format,
        estimatedEngagement: Math.round(50 + Math.random() * 50),
        trendingScore: Math.round(30 + Math.random() * 70),
      });
    }

    return suggestions;
  }

  getTrendingTopics(limit: number): { topic: string; volume: number; growth: number }[] {
    return [...this.trendingData].sort((a, b) => b.growth - a.growth).slice(0, limit);
  }

  getOptimalPostTime(_userId: string): { hour: number; day: number; score: number }[] {
    // Return optimal posting times based on typical engagement data
    return [
      { hour: 9, day: 1, score: 85 },
      { hour: 12, day: 2, score: 90 },
      { hour: 17, day: 3, score: 88 },
      { hour: 19, day: 4, score: 92 },
      { hour: 10, day: 5, score: 80 },
    ];
  }

  generateHooks(topic: string): string[] {
    return this.hookTemplates.map((template) => template.replace('{{topic}}', topic));
  }
}
