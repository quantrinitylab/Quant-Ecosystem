/**
 * Narrow PrismaClient interface for QuantTube services.
 * Constrains the available models and operations to only those
 * actually used by the service layer, while allowing flexible
 * return types since each service defines its own domain interfaces.
 * At runtime, the actual PrismaClient from @prisma/client is injected.
 */
export interface PrismaClient {
  video: {
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    findUnique: (args: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
    }) => Promise<any>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    count: (args: Record<string, unknown>) => Promise<number>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
  };
  videoChannel: {
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<any>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    count: (args: Record<string, unknown>) => Promise<number>;
    update: (args: { where: Record<string, unknown>; data: unknown }) => Promise<any>;
  };
  musicAlbum: {
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    findUnique: (args: { where: Record<string, unknown>; include?: unknown }) => Promise<any>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    count: (args: Record<string, unknown>) => Promise<number>;
  };
  musicTrack: {
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<any>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    count: (args: Record<string, unknown>) => Promise<number>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
  };
}
