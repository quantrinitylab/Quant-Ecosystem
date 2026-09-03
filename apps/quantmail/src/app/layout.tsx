import type { Metadata } from 'next';
import { Inter, Pacifico } from 'next/font/google';
import './globals.css';
import './shell.css';
import './overrides.css';
import { quantMailBrandMetadata } from '../brand/identity';
import { AuthGuard } from '../components/AuthGuard';
import { InboxToastContainer } from '../components/InboxToast';
import { KeyboardProvider } from '../components/KeyboardProvider';
import { KeyboardSurfaces } from '../components/KeyboardSurfaces';
import { OfflineBar } from '../components/OfflineBar';
import { AppProviders } from '../providers/app-providers';
import { AuthProvider } from '../providers/auth-provider';
import { BrandProvider } from '../providers/brand-provider';
import { QueryProvider } from '../providers/query-provider';

const inter = Inter({ subsets: ['latin'] });

// Brand script face: the QuantMail wordmark IS the logo (Instagram-style cursive).
const brandScript = Pacifico({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-brand',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: quantMailBrandMetadata.title,
    template: `%s · ${quantMailBrandMetadata.applicationName}`,
  },
  description: quantMailBrandMetadata.description,
  applicationName: quantMailBrandMetadata.applicationName,
  icons: {
    icon: [
      { url: '/quantmail-mascot.svg', type: 'image/svg+xml' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/quantmail-mascot.svg',
    apple: '/quantmail-mascot.svg',
  },
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
    root.setAttribute('data-density', density === 'compact' ? 'compact' : 'comfortable');
  } catch (error) {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
    document.documentElement.setAttribute('data-density', 'comfortable');
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className={`${inter.className} ${brandScript.variable} quantmail-root`}>
        <a href="#main-content" className="skip-to-content">
          Skip to content
        </a>
        <OfflineBar />
        <QueryProvider>
          <BrandProvider>
            <AuthProvider>
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
                  <InboxToastContainer />
                </AuthGuard>
              </AppProviders>
            </AuthProvider>
          </BrandProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
