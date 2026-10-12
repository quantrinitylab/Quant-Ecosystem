import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Inter } from 'next/font/google';
import './globals.css';
import './shell.css';
import './overrides.css';
import { quantMailBrandMetadata } from '../brand/identity';
import { AUTH_SHELL_HEADER } from '../lib/edge-public-paths';
import { AuthGuard } from '../components/AuthGuard';
import { KeyboardProvider } from '../components/KeyboardProvider';
import { KeyboardSurfaces } from '../components/KeyboardSurfaces';
import { AppProviders } from '../providers/app-providers';
import { AuthProvider } from '../providers/auth-provider';
import { BrandProvider } from '../providers/brand-provider';
import { QueryProvider } from '../providers/query-provider';
import { LazyInboxToasts, LazyOfflineBar } from '../components/LazyChrome';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: quantMailBrandMetadata.title,
    template: `%s · ${quantMailBrandMetadata.applicationName}`,
  },
  description: quantMailBrandMetadata.description,
  applicationName: quantMailBrandMetadata.applicationName,
  icons: {
    // The QuantMail "M" mark as vector, first. The Quanty ghost is the mascot,
    // not the app icon — it stays as a mascot asset, never as favicon.
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    shortcut: '/favicon.svg',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
  themeColor: 'var(--quant-surface-subtle)',
};

/**
 * P1-1 (mobile): `interactiveWidget: 'resizes-content'` makes iOS Safari
 * shrink the layout viewport when the keyboard opens instead of overlaying
 * it — so the ThreadComposer is pushed above the keyboard rather than
 * hidden behind it. width/initialScale preserve the default viewport.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  interactiveWidget: 'resizes-content',
};

const themeBootstrap = `
(function () {
  try {
    var stored = localStorage.getItem('quant-theme');
    var theme = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
    var resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    var root = document.documentElement;
    root.setAttribute('data-theme', resolved);
    root.classList.toggle('dark', resolved === 'dark');
    root.style.colorScheme = resolved;
    // Row density, for the same reason the theme is resolved here: applied after
    // paint it would show one frame of comfortable rows and then jump.
    var density = localStorage.getItem('quant-density');
    root.setAttribute(
      'data-density',
      density === 'compact' || density === 'cozy' ? density : 'comfortable',
    );
  } catch (error) {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
    document.documentElement.setAttribute('data-density', 'comfortable');
  }
})();
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // fix/qm-auth-providers-minimal: the edge middleware tags the public
  // auth-form pages (/login, /register, /forgot-password, /reset-password)
  // with `x-quant-shell: auth`; they render the lean auth shell (brand +
  // auth session only) instead of the full authenticated provider stack.
  // /login was measured at 792KB raw / 256KB gzip across 25 chunks because
  // this layout used to mount QueryClientProvider, the API-client layer, the
  // keyboard system, toasts and the offline bar on EVERY route. An absent tag
  // renders the full shell — the safe default, so a missed tag can only cost
  // bytes, never break a page.
  //
  // NOTE: reading `headers()` opts the root layout — and therefore every
  // route — into dynamic rendering. /marketing was the only intentionally
  // static page; the trade buys every signed-out visitor a leaner /login.
  const isAuthShell = (await headers()).get(AUTH_SHELL_HEADER) === 'auth';

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className={`${inter.className} quantmail-root`}>
        <a href="#main-content" className="skip-to-content">
          Skip to content
        </a>
        {/* Hoisted above the shell branch on purpose: the same provider
            instance — and the session state — survives the /login → /
            transition, so sign-in never flashes "Authenticating..." while a
            fresh provider re-hydrates. It reaches the query client through the
            module registry (`lib/query-client-registry.ts`) instead of
            `useQueryClient()`, which is what lets the auth shell omit
            QueryClientProvider entirely. */}
        <AuthProvider>
          {isAuthShell ? (
            /* Lean auth shell: brand CSS + auth session only. No
               QueryClientProvider, no theme/sidekick providers, no AuthGuard
               (the middleware already guards server-side), no keyboard system,
               no toasts, no offline bar. */
            <BrandProvider>{children}</BrandProvider>
          ) : (
            <>
              <LazyOfflineBar />
              <QueryProvider>
                <BrandProvider>
                  <AppProviders>
                    <AuthGuard>
                      {/* The palette and the shortcuts sheet read their open state
                          from this provider, so both must live inside it. Both sit at
                          the layout root rather than inside `AppShell`: `mod+k` is
                          registered globally, and the palette used to render only on
                          routes that happened to mount a shell — so on the others the
                          shortcut set state nothing was listening to.

                          `KeyboardSurfaces` is a client host that code-splits both of
                          them out of the root chunk; it cannot be inlined here because
                          this layout is a Server Component. */}
                      {/* `children` is deliberately not wrapped in a landmark here.
                          Every route already renders its own `<main>` — `AppShell` for
                          the twenty-eight shell routes, `AuthShell` for the four auth
                          screens, and its own for `/invite/[token]` and `/lab/marks` —
                          so a wrapper here made two `<main>` elements on every page and
                          handed `#main-content` to the outer one. The skip link then
                          landed above the header, the drawer and the search field:
                          four more tabbables to cross on `/`, three on `/drive`. The id
                          lives on the innermost landmark instead, next to the content it
                          names. */}
                      <KeyboardProvider>
                        {children}
                        <KeyboardSurfaces />
                      </KeyboardProvider>
                      <LazyInboxToasts />
                    </AuthGuard>
                  </AppProviders>
                </BrandProvider>
              </QueryProvider>
            </>
          )}
        </AuthProvider>
      </body>
    </html>
  );
}
