/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@quant/brand', '@quant/shared-ui', '@quant/common'],
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
};

export default nextConfig;
