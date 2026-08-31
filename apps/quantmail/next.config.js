/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';

/**
 * Defence-in-depth behind the DOMPurify pass in `sanitizeEmailHtml`. Inbound mail
 * is attacker-controlled, so the directives that matter most here are the ones a
 * sanitizer bypass would still run into: no external script origins, no plugin
 * embeds, no `<base>` hijack, and no off-site form posts from a message body.
 *
 * `'unsafe-inline'` is currently unavoidable — the theme bootstrap in
 * `app/layout.tsx` and the brand stylesheet in `brand-provider.tsx` are both
 * inline, and Next's own hydration bootstrap is too. Moving to a nonce means
 * per-request middleware and forfeiting static rendering on every route, which
 * would cost more load time than the residual risk is worth. `img-src https:`
 * stays open because real mail carries remote images; `referrerpolicy=no-referrer`
 * on those images (set during sanitization) is what limits the leak.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https: ${isDev ? 'ws: wss:' : 'wss:'}`,
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const nextConfig = {
  transpilePackages: ['@quant/shared-ui', '@quant/common', '@quant/brand', '@quant/bharat-ai'],
  experimental: {
    // framer-motion is imported at 121 sites; without this every one of them
    // pulls the whole barrel into its route chunk.
    optimizePackageImports: ['@quant/shared-ui', 'framer-motion'],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Workspace TS packages (e.g. @quant/bharat-ai pulled in via @quant/shared-ui)
  // use NodeNext-style `.js` extension specifiers that point at `.ts` sources.
  // Teach webpack to resolve those `.js`/`.mjs` specifiers to their TS sources
  // so `next build` can bundle the transpiled workspace packages.
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };
    return config;
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy,
          },
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
            // `microphone=(self)` — not `()`. Voice dictation and the voice
            // assistant need `getUserMedia({ audio: true })`, and a
            // Permissions-Policy of `microphone=()` makes that call reject on
            // this origin no matter what the user grants in the browser prompt,
            // with an error ("Permissions policy violation") that looks like a
            // denied permission rather than a server header. `(self)` still
            // blocks every embedded third-party frame from asking, and the
            // browser's own permission prompt remains the gate for the user.
            // Camera and geolocation stay fully closed — nothing here uses them.
            value: 'camera=(), microphone=(self), geolocation=()',
          },
        ],
      },
    ];
  },
};
export default nextConfig;
