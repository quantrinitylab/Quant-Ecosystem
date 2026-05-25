/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Narrow PrismaClient interface for QuantSync services.
 * Constrains the available models and operations to only those
 * actually used by the service layer, while allowing flexible
 * return types since each service defines its own domain interfaces.
 * At runtime, the actual PrismaClient from @prisma/client is injected.
 */
export interface PrismaClient {
  post: {
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<any>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    count: (args: Record<string, unknown>) => Promise<number>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
  };
  community: {
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<any>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    count: (args: Record<string, unknown>) => Promise<number>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
  };
  communityMember: {
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    findFirst: (args: { where: Record<string, unknown> }) => Promise<any>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    count: (args: Record<string, unknown>) => Promise<number>;
    delete: (args: { where: Record<string, unknown> }) => Promise<any>;
  };
  userRelationship: {
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
  };
}
