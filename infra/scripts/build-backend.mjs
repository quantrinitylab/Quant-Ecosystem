// Bundles an app's Fastify backend into a single self-contained ESM file.
// The monorepo uses moduleResolution=bundler (extensionless imports), so raw
// tsc/tsx output can't run under Node's ESM resolver; bundling resolves all
// workspace + npm deps at build time. Native / generated deps (Prisma client +
// query engine, argon2, etc.) stay external and are provided by node_modules.
//
// Usage: node infra/scripts/build-backend.mjs <appDir> <entry> <outfile>
//   e.g. node infra/scripts/build-backend.mjs apps/quantmail backend/server.ts apps/quantmail/backend/dist/server.mjs
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const [appDir, entry, outfile] = process.argv.slice(2);
if (!appDir || !entry || !outfile) {
  console.error('usage: build-backend.mjs <appDir> <entry> <outfile>');
  process.exit(1);
}

// Deps that must NOT be bundled: native addons and generated/binary-backed
// packages that esbuild cannot inline. They are resolved from node_modules at
// runtime (the production image ships full node_modules incl. the generated
// Prisma client + query-engine binary).
const external = [
  '@prisma/client',
  '.prisma',
  '.prisma/client',
  'prisma',
  'argon2',
  '@node-rs/argon2',
  'bcrypt',
  'ioredis',
  'bullmq',
  'nats',
  'ws',
  'sharp',
  'fsevents',
  // Deprecated transitive libs with non-resolvable legacy subpath imports.
  'request',
  'uuid/v4',
  'uuid/v1',
];

await build({
  entryPoints: [path.join(appDir, entry)],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile,
  external,
  logLevel: 'info',
  banner: {
    js: "import{createRequire}from'module';import{fileURLToPath as __f}from'url';import{dirname as __d}from'path';const require=createRequire(import.meta.url);const __filename=__f(import.meta.url);const __dirname=__d(__filename);",
  },
});

console.log('bundled', outfile);
