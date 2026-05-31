import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { QueryProvider } from '../providers/query-provider';
import { AuthProvider } from '../providers/auth-provider';
import { AppProviders } from '../providers/app-providers';
import { BrandProvider } from '../providers/brand-provider';
import { AuthGuard } from '../components/AuthGuard';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'QuantMail | Quant',
  description: 'Central email and communication hub for the Quant Ecosystem',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="20" height="14" rx="2" stroke="%233B82F6" stroke-width="2"/><path d="M2 7l10 6 10-6" stroke="%233B82F6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
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
