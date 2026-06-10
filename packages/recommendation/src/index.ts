export * from './core/recommendation-engine';
export * from './models/user-profile';
export * from './models/content-item';
export * from './models/interaction';

import { RecommendationEngine } from './core/recommendation-engine';

export const recommendationEngine = new RecommendationEngine();
