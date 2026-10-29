/** @type {import('next').NextConfig} */
const nextConfig = {
  // Photo Editor bundle (public/photo-editor/, C-3 + shared-file batch
  // #4): the embedded editor build's HOSTING.md/_headers require .wasm
  // served as application/wasm, its gzipped parts served byte-for-byte
  // with no Content-Encoding transform (Next's static serving does not
  // add one), hashed files cached immutably, and the name-stable files
  // (index.html, app/photocraft-web.js, app/parts.txt) revalidated.
  // Scoped to the bundle only: X-Content-Type-Options lives here too,
  // not app-wide.
  async headers() {
    return [
      {
        source: '/photo-editor/:path*',
        headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }],
      },
      {
        source: '/photo-editor/:file*.wasm',
        headers: [
          { key: 'Content-Type', value: 'application/wasm' },
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/photo-editor/app/:part*.part-:hash',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/photo-editor/photocraft-web-boot-:hash.js',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/photo-editor/index.html',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
      {
        source: '/photo-editor/app/photocraft-web.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
      {
        source: '/photo-editor/app/parts.txt',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
      // Design editor bundle (public/design-editor/0.12.1/, C-7): the
      // embedded design build's HOSTING.md/_headers require the same
      // treatment as the photo bundle — .wasm as application/wasm,
      // content-hashed assets (the glue module, the eframe snippet)
      // cached immutably, index.html revalidated, nosniff scoped to
      // the bundle. The bundle is version-pinned under 0.12.1/, so a
      // future engine version lands as a sibling path, never an
      // in-place swap under cached URLs.
      {
        source: '/design-editor/:path*',
        headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }],
      },
      {
        source: '/design-editor/0.12.1/:file*.wasm',
        headers: [
          { key: 'Content-Type', value: 'application/wasm' },
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/design-editor/0.12.1/figcraft-web-:hash.js',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/design-editor/0.12.1/snippets/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/design-editor/0.12.1/index.html',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
    ];
  },
  transpilePackages: ['@quant/agentic', '@quant/shared-ui', '@quant/common', '@quant/brand'],
  serverExternalPackages: ['nats'],
  webpack: (config, { isServer }) => {
    // Resolve workspace TS packages that use NodeNext `.js` import specifiers
    // (e.g. @quant/bharat-ai pulled in via @quant/shared-ui) to their `.ts` sources.
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.jsx': ['.tsx', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        dns: false,
        fs: false,
        http: false,
        https: false,
        stream: false,
        crypto: false,
        zlib: false,
        child_process: false,
        os: false,
        path: false,
        events: false,
        buffer: false,
        url: false,
        util: false,
      };
      config.externals = [...(config.externals || []), 'nats', 'ws', 'ioredis'];
    }
    return config;
  },
};
module.exports = nextConfig;
