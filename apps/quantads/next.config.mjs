/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@quant/shared-ui', '@quant/brand', '@quant/common', '@quant/auth', '@quant/realtime', '@quant/privacy-ads', '@quant/api-client'],
  reactStrictMode: true,
};
export default nextConfig;
