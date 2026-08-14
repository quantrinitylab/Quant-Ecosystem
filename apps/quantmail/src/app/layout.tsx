import type { Metadata } from 'next';
import { Inter, Pacifico } from 'next/font/google';
import './globals.css';
import './shell.css';
import './overrides.css';
import { quantMailBrandMetadata } from '../brand/identity';
import { AuthGuard } from '../components/AuthGuard';
import { GlobalShortcutsProvider } from '../components/GlobalShortcutsProvider';
import { InboxToastContainer } from '../components/InboxToast';
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
    icon: '/quantrinity-mark.svg',
    shortcut: '/quantrinity-mark.svg',
    apple: '/quantrinity-mark.svg',
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
                  <GlobalShortcutsProvider>
                    <main id="main-content">{children}</main>
                  </GlobalShortcutsProvider>
                  <KeyboardShortcutsHelp />
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
