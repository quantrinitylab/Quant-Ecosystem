/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@quant/agentic', '@quant/brand', '@quant/shared-ui', '@quant/common'],
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
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
