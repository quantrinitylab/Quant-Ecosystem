import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { QueryProvider } from '../providers/query-provider';
import { AppProviders } from '../providers/app-providers';
import { AppLayout } from '../components/AppLayout';
import { quantads, generateFaviconSvg } from '@quant/brand';

const inter = Inter({ subsets: ['latin'] });

const faviconSvg = generateFaviconSvg(quantads.id);

export const metadata: Metadata = {
  title: 'QuantAds | Quant',
  description: 'Ecosystem-wide advertising platform with real-time bidding and AI optimization',
  icons: {
    icon: `data:image/svg+xml,${encodeURIComponent(faviconSvg)}`,
  },
  other: {
    'theme-color': quantads.color,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content={quantads.color} />
      </head>
      <body className={inter.className}>
        <QueryProvider>
          <AppProviders>
            <AppLayout>{children}</AppLayout>
          </AppProviders>
        </QueryProvider>
      </body>
    </html>
  );
}
