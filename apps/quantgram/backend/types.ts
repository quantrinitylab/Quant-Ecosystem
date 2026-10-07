/**
 * Narrow PrismaClient interface for QuantNeon services.
 * Constrains the available models and operations to only those
 * actually used by the service layer, while allowing flexible
 * return types since each service defines its own domain interfaces.
 * At runtime, the actual PrismaClient from @prisma/client is injected.
 */

/**
 * A generic Prisma model delegate exposing the standard CRUD surface.
 * Return types are intentionally `any` because each service maps the rows
 * onto its own domain interfaces, and Prisma's real delegate types are far
 * stricter than what the service layer needs at the seam.
 */
export interface PrismaDelegate {
  create: (args: Record<string, unknown>) => Promise<any>;
  findUnique: (args: Record<string, unknown>) => Promise<any>;
  findFirst: (args?: Record<string, unknown>) => Promise<any>;
  findMany: (args?: Record<string, unknown>) => Promise<any[]>;
  count: (args?: Record<string, unknown>) => Promise<number>;
  update: (args: Record<string, unknown>) => Promise<any>;
  updateMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
  delete: (args: Record<string, unknown>) => Promise<any>;
  deleteMany: (args?: Record<string, unknown>) => Promise<{ count: number }>;
  upsert: (args: Record<string, unknown>) => Promise<any>;
}

export interface PrismaClient {
  post: PrismaDelegate;
  comment: PrismaDelegate;
  like: PrismaDelegate;
  savedPost: PrismaDelegate;
  story: PrismaDelegate;
  storyView: PrismaDelegate;
  reel: PrismaDelegate;
  reelLike: PrismaDelegate;
  reelComment: PrismaDelegate;
  userRelationship: PrismaDelegate;
  closeFriend: PrismaDelegate;
  notification: PrismaDelegate;
  conversation: PrismaDelegate;
  conversationMember: PrismaDelegate;
  message: PrismaDelegate;
  user: PrismaDelegate;
  photo: PrismaDelegate;
  photoAlbum: PrismaDelegate;
  $transaction: <T>(fn: (tx: PrismaClient) => Promise<T>) => Promise<T>;
}
