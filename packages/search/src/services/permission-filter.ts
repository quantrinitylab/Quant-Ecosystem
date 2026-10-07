// ============================================================================
// Permission Filter - Post-query access control
// ============================================================================

import { z } from 'zod';

export const VisibilitySchema = z.enum(['public', 'private', 'shared']);
export type Visibility = z.infer<typeof VisibilitySchema>;

export const SearchResultWithPermissionsSchema = z.object({
  id: z.string(),
  ownerUserId: z.string(),
  visibility: VisibilitySchema,
  sharedWith: z.array(z.string()).optional(),
  score: z.number(),
  document: z.record(z.unknown()),
});

export type SearchResultWithPermissions = z.infer<typeof SearchResultWithPermissionsSchema>;

export const UserPermissionsSchema = z.object({
  userId: z.string(),
  isAdmin: z.boolean().default(false),
  groupIds: z.array(z.string()).optional(),
});

export type UserPermissions = z.infer<typeof UserPermissionsSchema>;

/**
 * PermissionFilter - Defense-in-depth post-query access control
 *
 * Filters search results based on document visibility and user permissions.
 * Removes any results the requesting user should not see.
 */
export class PermissionFilter {
  filterResults(
    results: SearchResultWithPermissions[],
    userId: string,
    userPermissions: UserPermissions,
  ): SearchResultWithPermissions[] {
    return results.filter((result) => this.isAccessible(result, userId, userPermissions));
  }

  private isAccessible(
    result: SearchResultWithPermissions,
    userId: string,
    userPermissions: UserPermissions,
  ): boolean {
    // Admins can see everything
    if (userPermissions.isAdmin) {
      return true;
    }

    // Owner can always see their own documents
    if (result.ownerUserId === userId) {
      return true;
    }

    switch (result.visibility) {
      case 'public':
        return true;
      case 'private':
        return false;
      case 'shared':
        return result.sharedWith?.includes(userId) ?? false;
      default:
        return false;
    }
  }
}
