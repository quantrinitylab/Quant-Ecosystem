/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@quant/shared-ui',
    '@quant/common',
    '@quant/brand',
    '@quant/agentic',
    '@quant/ai',
  ],
  typescript: {
    ignoreBuildErrors: true,
  },

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
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
