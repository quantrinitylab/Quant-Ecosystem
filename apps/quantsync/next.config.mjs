/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@quant/shared-ui', '@quant/brand', '@quant/common', '@quant/auth', '@quant/realtime', '@quant/api-client'],
  reactStrictMode: true,
};
export default nextConfig;
