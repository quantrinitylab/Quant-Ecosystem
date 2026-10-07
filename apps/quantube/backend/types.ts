/**
 * Narrow PrismaClient interface for QuantTube services.
 * Constrains the available models and operations to only those
 * actually used by the service layer, while allowing flexible
 * return types since each service defines its own domain interfaces.
 * At runtime, the actual PrismaClient from @prisma/client is injected.
 */
export interface PrismaClient {
  /**
   * Needed so a state change and the domain event announcing it commit together.
   * That atomicity is the entire point of the outbox pattern (Quant Foundation
   * Law 3): an event that can be written without its state change, or a state
   * change that can be written without its event, is a lie either way.
   */
  $transaction: <T>(fn: (tx: PrismaClient) => Promise<T>) => Promise<T>;
  /**
   * `outbox_events`. Written only inside `$transaction`, never on its own —
   * `services/cdc-relay` drains this table and publishes each row to a stream.
   */
  outboxEvent: {
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
  };
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
  videoChannelSubscription: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<any>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    delete: (args: { where: Record<string, unknown> }) => Promise<any>;
    count: (args: Record<string, unknown>) => Promise<number>;
  };
  videoLike: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<any>;
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    delete: (args: { where: Record<string, unknown> }) => Promise<any>;
    count: (args: Record<string, unknown>) => Promise<number>;
  };
  videoComment: {
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    count: (args: Record<string, unknown>) => Promise<number>;
  };
}
