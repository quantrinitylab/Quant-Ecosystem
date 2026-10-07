// ============================================================================
// User Index Handler - Indexes user events to MeiliSearch only
// ============================================================================

import { z } from 'zod';
import type { SearchClient } from '@quant/search';

export const UserEventSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  bio: z.string(),
  role: z.string(),
  status: z.string(),
  createdAt: z.string(),
});

export type UserEvent = z.infer<typeof UserEventSchema>;

const USERS_INDEX = 'users';

/**
 * UserIndexHandler
 *
 * Handles user.created and user.updated events by indexing user profile
 * data to MeiliSearch only (no vector embedding needed for user profiles).
 */
export class UserIndexHandler {
  constructor(private readonly searchClient: SearchClient) {}

  async handle(payload: unknown): Promise<void> {
    const event = UserEventSchema.parse(payload);

    await this.searchClient.indexDocument(USERS_INDEX, {
      id: event.id,
      username: event.username,
      displayName: event.displayName,
      bio: event.bio,
      role: event.role,
      status: event.status,
      createdAt: event.createdAt,
    });
  }
}
