export interface Interaction {
  userId: string;
  contentId: string;
  type: 'view' | 'like' | 'share' | 'comment' | 'click' | 'purchase' | 'save';
  value?: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}
