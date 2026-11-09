import type { AppProps } from 'next/app';
import { ThemeProvider } from '@quant/shared-ui';
import '../app/globals.css';
import { QueryProvider } from '../providers/query-provider';
import { BrandProvider } from '../providers/brand-provider';
import { PagesAuthGate } from '../providers/auth-gate-pages';

/**
 * Pages-Router shell. The app's primary routes use the App Router (whose
 * root layout mounts QueryProvider / BrandProvider / AppProviders+AuthGate),
 * but the legacy Pages-Router pages under src/pages/ (calls, discover,
 * settings, bitmoji) rendered outside ALL of that:
 *
 *  - UNGATED (P0, live audit 2026-10-11): no AuthGate ran here, so
 *    /settings, /calls and /discover rendered fully logged-out — settings
 *    even exposed its Save buttons and "Delete My Account" UI to anonymous
 *    visitors. PagesAuthGate now applies the SAME gate (AuthGateCore +
 *    src/lib/route-access.ts registry) the App Router uses.
 *  - UNTHEMED: no ThemeProvider/BrandProvider meant these pages fell back
 *    to browser defaults while App Router pages were themed. They now get
 *    the same provider stack (theme "system", matching AppProviders).
 *  - UNSTYLED (fixed earlier): without this file's globals.css import the
 *    pages had no stylesheet at all; the per-page custom class names that
 *    were never defined anywhere have since been replaced with the app's
 *    Tailwind/token system page by page (calls, then settings/discover,
 *    bitmoji — QC-F-002 fast-follow, 2026-10-25).
 */
export default function QuantChatPagesApp({ Component, pageProps }: AppProps) {
  return (
    <QueryProvider>
      <BrandProvider>
        <ThemeProvider defaultTheme="system">
          <PagesAuthGate>
            <Component {...pageProps} />
          </PagesAuthGate>
        </ThemeProvider>
      </BrandProvider>
    </QueryProvider>
  );
}
