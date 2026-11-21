const { buildCspHeader } = require('./csp-policy');

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@quant/shared-ui',
    '@quant/common',
    '@quant/brand',
    '@quant/agentic',
    '@quant/ai',
  ],
  serverExternalPackages: ['nats'],
  webpack: (config, { isServer }) => {
    // @quant/agentic ships TS source only and uses NodeNext ESM imports with
    // explicit ".js" extensions that point at ".ts" files. Map ".js" back to
    // the TS/JS source extensions so webpack can resolve the transpiled sources.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias || {}),
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
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
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Permissions-Policy',
            // `(self)` — NOT `()`. QuantChat's own core surfaces live on these
            // three features: the camera tab, story creator, duet mode and
            // avatar capture call `getUserMedia` for camera+mic, voice notes
            // and calls/meet need the microphone, and the map needs
            // geolocation. An empty allowlist (`camera=()`) rejects those
            // calls on THIS origin too — before the browser ever shows its
            // permission prompt — and the resulting NotAllowedError looks to
            // the user like they denied permission, when it was really this
            // server header. `(self)` only lifts that self-block: the
            // browser's own permission prompt stays the real gate, and no
            // embedded third-party frame can ask unless a page explicitly
            // delegates via `allow=` (none does). Do not "harden" this back
            // to `()` — that silently kills every media surface above
            // (QC-F-153). Same lesson QuantMail learned for its microphone.
            value: 'camera=(self), microphone=(self), geolocation=(self)',
          },
          // QC-F-155: CSP Report-Only (Slice-1) — directives live in
          // ./csp-policy.js (single source, parity-pinned in tests).
          buildCspHeader(),
        ],
      },
    ];
  },
};
module.exports = nextConfig;
