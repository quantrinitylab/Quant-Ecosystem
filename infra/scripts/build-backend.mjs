// Bundles an app's Fastify backend into a single self-contained ESM file.
// The monorepo uses moduleResolution=bundler (extensionless imports), so raw
// tsc/tsx output can't run under Node's ESM resolver; bundling resolves all
// workspace + npm deps at build time. Only truly-native / generated packages
// stay external (provided by node_modules in the runtime image): the Prisma
// client + query-engine binary, argon2/bcrypt native addons, sharp.
//
// Usage: node infra/scripts/build-backend.mjs <appDir> <entry> <outfile>
import { build } from 'esbuild';
import path from 'node:path';

const [appDir, entry, outfile] = process.argv.slice(2);
if (!appDir || !entry || !outfile) {
  console.error('usage: build-backend.mjs <appDir> <entry> <outfile>');
  process.exit(1);
}

// Only native/generated packages that esbuild cannot inline. Everything else
// (fastify, bullmq, ioredis, nats, ws, jose, zod, workspace @quant/*, ...) is
// bundled so the output is self-contained regardless of pnpm's layout.
const external = [
  '@prisma/client',
  '.prisma',
  '.prisma/client',
  'prisma',
  'argon2',
  '@node-rs/argon2',
  'bcrypt',
  'sharp',
  'fsevents',
];

const appAbs = path.resolve(appDir);

// Most @quant/* workspace packages publish their entry as TypeScript source
// (main: src/index.ts), so esbuild bundles them straight from source. A few
// packages (e.g. @quant/agentic) instead point their package.json `exports`
// at compiled `dist/`, which does NOT exist in the backend image's bundle
// stage (we run `prisma generate` + this bundler, never a full `tsc` build of
// every package). Aliasing those to their `src` entry lets esbuild resolve and
// bundle them from source like the rest, without changing the package's
// published entry (which the Next frontends' transpile config depends on).
const srcEntryAliases = {
  '@quant/agentic': path.resolve('packages/agentic/src/index.ts'),
};

// The deprecated `request` lib imports non-existent `uuid/v4` / `uuid/v1`
// subpaths. This plugin maps them onto modern uuid's named exports, resolving
// `uuid` from the app's own node_modules.
// The deprecated `request`/`request-promise` libs (pulled in transitively by
// matrix-bot-sdk, used only by the optional Matrix-federation bridge) are
// incompatible with modern uuid and unmaintained. Stub them so the bundle
// builds and boots; the Matrix bridge (a niche feature) degrades to throwing
// only if actually invoked, without blocking the core app.
const deprecatedStubPlugin = {
  name: 'stub-deprecated',
  setup(b) {
    b.onResolve({ filter: /^(request|request-promise|request-promise-core)$/ }, (args) => ({
      path: args.path,
      namespace: 'stub-deprecated',
    }));
    b.onLoad({ filter: /.*/, namespace: 'stub-deprecated' }, () => ({
      contents:
        'const unavailable = () => { throw new Error("HTTP `request` lib is stubbed in the bundle (Matrix federation bridge disabled)"); };' +
        'module.exports = new Proxy(unavailable, { get: () => unavailable });',
      loader: 'js',
    }));
  },
};

await build({
  entryPoints: [path.join(appDir, entry)],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile,
  external,
  alias: srcEntryAliases,
  logLevel: 'error',
  plugins: [deprecatedStubPlugin],
  banner: {
    js: "import{createRequire}from'module';import{fileURLToPath as __f}from'url';import{dirname as __d}from'path';const require=createRequire(import.meta.url);const __filename=__f(import.meta.url);const __dirname=__d(__filename);",
  },
});

console.log('bundled', outfile);
