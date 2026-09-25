/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@quant/shared-ui', '@quant/brand', '@quant/common', '@quant/auth', '@quant/realtime', '@quant/privacy-ads', '@quant/api-client'],
  reactStrictMode: true,
  // `/login` is the canonical sign-in route across the ecosystem. QuantAds only
  // ever served `/auth/login`, which is why https://quantads.quantrinity.in/login
  // returned 404 while the app itself answered 200. A 308 keeps every existing
  // `/auth/login` link working; Next forwards the query string on a redirect, so
  // an old `/auth/login?returnTo=/campaigns` still lands on the right page.
  async redirects() {
    return [{ source: '/auth/login', destination: '/login', permanent: true }];
  },
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
