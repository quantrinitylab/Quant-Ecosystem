export interface ModerationResult {
  contentId: string;
  isApproved: boolean;
  toxicityScore: number;
  confidence: number;
  flags: string[];
  reviewedAt: Date;
  reviewer: string;
  notes?: string;
}
