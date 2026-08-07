import type { PrismaClient } from '@quant/database';

export class ReplicaRouter {
  private readonly primary: PrismaClient;
  private readonly replica: PrismaClient;
  private forcePrimary = false;

  constructor(primary: PrismaClient, replica: PrismaClient) {
    this.primary = primary;
    this.replica = replica;
  }

  forRead(): PrismaClient {
    if (this.forcePrimary) {
      return this.primary;
    }
    return this.replica;
  }

  forWrite(): PrismaClient {
    return this.primary;
  }

  withPrimary<T>(fn: (client: PrismaClient) => T): T {
    const prev = this.forcePrimary;
    this.forcePrimary = true;
    try {
      return fn(this.primary);
    } finally {
      this.forcePrimary = prev;
    }
  }
}

export function createReplicaRouter(primary: PrismaClient, replica: PrismaClient): ReplicaRouter {
  return new ReplicaRouter(primary, replica);
}
