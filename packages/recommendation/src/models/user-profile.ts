export interface UserProfile {
  userId: string;
  interests: string[];
  preferredCategories: string[];
  demographics?: {
    age?: number;
    location?: string;
    language?: string;
  };
  behavior?: {
    activeHours?: number[];
    deviceType?: string;
    averageSessionDuration?: number;
  };
  lastUpdated: Date;
}
