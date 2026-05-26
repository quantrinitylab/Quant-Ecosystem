/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Narrow PrismaClient interface for QuantMax services.
 * Constrains the available models and operations to only those
 * actually used by the service layer, while allowing flexible
 * return types since each service defines its own domain interfaces.
 * At runtime, the actual PrismaClient from @prisma/client is injected.
 */
export interface PrismaClient {
  datingProfile: {
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<any>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
  };
  swipe: {
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    findFirst: (args: Record<string, unknown>) => Promise<any>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
  };
  match: {
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    findFirst: (args: Record<string, unknown>) => Promise<any>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}
