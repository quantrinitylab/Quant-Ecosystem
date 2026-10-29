// @prisma/client stub for the P0-6 gate's generated vitest config (extract /
// no-install environments only — see scripts/phase0-gate.mjs).
//
// In an environment without a generated Prisma client (engines unavailable),
// package sources that import @prisma/client cannot load at all. Every
// service under test receives a DI'd fake prisma, so the real client is only
// ever imported, never used. This stub makes that import survivable and
// honest: any actual query attempt throws, so nothing can silently "work"
// against it. In a proper install (CI) the gate does not use this stub — the
// real generated client resolves normally.
export class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        if (prop in target) return target[prop];
        return async () => {
          throw new Error(
            '@prisma/client is stubbed in this test environment — inject a fake prisma',
          );
        };
      },
    });
  }
  async $connect() {}
  async $disconnect() {}
}
export const Prisma = {
  PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {},
  PrismaClientValidationError: class PrismaClientValidationError extends Error {},
};
export default { PrismaClient, Prisma };
