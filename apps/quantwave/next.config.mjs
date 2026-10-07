/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@quant/agentic', '@quant/shared-ui', '@quant/brand', '@quant/common', '@quant/auth', '@quant/realtime', '@quant/api-client'],
  reactStrictMode: true,
  webpack: (config) => {
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
    return config;
  },
};
export default nextConfig;
