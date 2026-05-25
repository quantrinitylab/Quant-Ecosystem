/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Narrow PrismaClient interface for QuantNeon services.
 * Constrains the available models and operations to only those
 * actually used by the service layer, while allowing flexible
 * return types since each service defines its own domain interfaces.
 * At runtime, the actual PrismaClient from @prisma/client is injected.
 */
export interface PrismaClient {
  photo: {
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<any>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    count: (args: Record<string, unknown>) => Promise<number>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
  };
  photoAlbum: {
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<any>;
  };
  story: {
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<any>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
    deleteMany: (args: { where: Record<string, unknown> }) => Promise<{ count: number }>;
  };
}
