import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthGuard } from '../components/AuthGuard';
import { AppProviders } from '../providers/app-providers';
import { AuthProvider } from '../providers/auth-provider';
import { BrandProvider } from '../providers/brand-provider';
import { QueryProvider } from '../providers/query-provider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'QuantMail by Quantrinity',
    template: '%s · QuantMail',
  },
  description: 'A focused, intelligent inbox by Quantrinity — built in India for the world.',
  applicationName: 'QuantMail',
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
      <body className={`${inter.className} quantmail-root`}>
        <QueryProvider>
          <BrandProvider>
            <AuthProvider>
              <AppProviders>
                <AuthGuard>{children}</AuthGuard>
              </AppProviders>
            </AuthProvider>
          </BrandProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
