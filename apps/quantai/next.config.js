/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@quant/shared-ui', '@quant/common', '@quant/quant-tools'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack(config) {
    // Allow .js extension in imports to resolve to .ts source files
    // (required for @quant/quant-tools which uses ESM .js extension convention)
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
  async headers() {
    // F-212: Content-Security-Policy — strict but app-compatible.
    // - script-src keeps 'unsafe-inline': the Next.js runtime bootstraps with
    //   inline scripts; nonce-based tightening is follow-up work. External
    //   script hosts stay BLOCKED (no cdn.* allowlist at page level).
    // - style-src keeps 'unsafe-inline': 24 components use inline style={{}}.
    // - The artifact preview iframe is sandbox="allow-scripts allow-modals"
    //   (opaque origin, does not inherit this page policy) and carries its
    //   own deterministic `csp` attribute, so its tailwind CDN script keeps
    //   working while staying contained.
    // - connect-src allows https: so user-configured voice-flow webhooks keep
    //   working; exfiltration still requires script execution (locked down).
    // - Violations are reported to /api/csp-report for tuning (report-only
    //   noise is avoided: the policy ENFORCES from day one).
    const contentSecurityPolicy = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "media-src 'self' blob: data:",
      "frame-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      'upgrade-insecure-requests',
      'report-uri /api/csp-report',
    ].join('; ');
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy,
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
