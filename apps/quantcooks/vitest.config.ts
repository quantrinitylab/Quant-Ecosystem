import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

// Plain-object config (no `vitest/config` import): unit tests run under an
// npx-provided vitest without a local node_modules, so the config file itself
// must only use node builtins.
//
// Unit tests run without the Next.js package installed (the real `next/server`
// is only needed at build/serve time). Alias it to a hermetic test-only stub
// that implements the small surface the app-router routes use
// (NextRequest/NextResponse.json on top of the Fetch API).
export default {
  resolve: {
    alias: {
      'next/server': resolve(here, 'src/__tests__/stubs/next-server.ts'),
    },
  },
};
