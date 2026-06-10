export * from './core/moderation-engine';
export * from './models/moderation-result';

import { ModerationEngine } from './core/moderation-engine';

export const moderationEngine = new ModerationEngine();
