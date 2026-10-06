import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
// Off-canvas AppShell nav (`.quant-shell-*`) ships with the component in
// @quant/shared-ui — every AppShell consumer must import it once, here.
import '@quant/shared-ui/src/components/Layout/quant-shell.css';
import { QueryProvider } from '../providers/query-provider';
import { AppProviders } from '../providers/app-providers';
import { BrandProvider } from '../providers/brand-provider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'QuantChat',
  description: 'Snapchat-like messaging with stories, snaps, calls, AR filters, and AI integration',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 0 1-4.255-.96L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" stroke="%2310B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="12" r="1" fill="%2310B981"/><circle cx="12" cy="12" r="1" fill="%2310B981"/><circle cx="16" cy="12" r="1" fill="%2310B981"/></svg>',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <QueryProvider>
          <BrandProvider>
            <AppProviders>{children}</AppProviders>
          </BrandProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
