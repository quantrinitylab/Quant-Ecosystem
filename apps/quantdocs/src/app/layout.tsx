import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { QueryProvider } from '../providers/query-provider';
import { AppProviders } from '../providers/app-providers';
import { quantdocs, generateFaviconSvg } from '@quant/brand';

const inter = Inter({ subsets: ['latin'] });

const faviconSvg = generateFaviconSvg('quantdocs');
const faviconDataUrl = `data:image/svg+xml,${encodeURIComponent(faviconSvg)}`;

export const metadata: Metadata = {
  title: `${quantdocs.name} | Quant`,
  description: quantdocs.description,
  icons: {
    icon: faviconDataUrl,
  },
  other: {
    'theme-color': quantdocs.color,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content={quantdocs.color} />
      </head>
      <body className={inter.className}>
        <QueryProvider>
          <AppProviders>{children}</AppProviders>
        </QueryProvider>
      </body>
    </html>
  );
}
