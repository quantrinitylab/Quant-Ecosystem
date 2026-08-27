import type { Metadata } from 'next';
import { Inter, Pacifico } from 'next/font/google';
import './globals.css';
import './shell.css';
import './overrides.css';
import { quantMailBrandMetadata } from '../brand/identity';
import { AuthGuard } from '../components/AuthGuard';
import { CommandPalette } from '../components/CommandPalette';
import { InboxToastContainer } from '../components/InboxToast';
import { KeyboardProvider } from '../components/KeyboardProvider';
import { KeyboardShortcutsHelp } from '../components/KeyboardShortcutsHelp';
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
  } catch (error) {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
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
                      shortcut set state nothing was listening to. */}
                  <KeyboardProvider>
                    <main id="main-content">{children}</main>
                    <CommandPalette />
                    <KeyboardShortcutsHelp />
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
