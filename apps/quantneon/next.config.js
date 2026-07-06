/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@quant/agentic', '@quant/shared-ui', '@quant/common'],
  serverExternalPackages: ['nats'],
  webpack: (config, { isServer }) => {
    // Resolve workspace TypeScript sources that use `.js` import specifiers
    // (e.g. @quant/bharat-ai, @quant/onboarding pulled in via @quant/shared-ui)
    // under Next's webpack pipeline.
    config.resolve.extensionAlias = {
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
