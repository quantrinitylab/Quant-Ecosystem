export interface ContentItem {
  id: string;
  type: 'post' | 'video' | 'article' | 'product' | 'event';
  title: string;
  description?: string;
  tags?: string[];
  category?: string;
  creatorId: string;
  createdAt: Date;
  metadata?: Record<string, any>;
  score?: number;
}
