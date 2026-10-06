import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import './globals.css';
// Off-canvas AppShell nav (`.quant-shell-*`) ships with the component in
// @quant/shared-ui — every AppShell consumer must import it once, here.
import '@quant/shared-ui/src/components/Layout/quant-shell.css';
import { QueryProvider } from '../providers/query-provider';
import { AppProviders } from '../providers/app-providers';
import { QuantAIThemeProvider } from '../providers/theme-provider';
import { BrandProvider } from '../components/BrandProvider';
import { brandNameForHost } from '../lib/branding';

const inter = Inter({ subsets: ['latin'] });

// Host-aware tab title: quanty.quantrinity.in shows "Quanty | Quant" while
// quantai.quantrinity.in keeps "QuantAI | Quant" (both hosts are served by
// this same deployment — see infra/k8s/staging-quantchat-quantai.yaml).
export async function generateMetadata(): Promise<Metadata> {
  const host = (await headers()).get('host');
  const brand = brandNameForHost(host);
  return {
    title: `${brand} | Quant`,
    description:
      'Central AI hub for device automation, workflow orchestration, and intelligent assistance',
    icons: {
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="%238B5CF6"/><text x="16" y="22" font-size="18" font-weight="bold" text-anchor="middle" fill="white">Q</text></svg>',
    },
  };
}

// Phase 0: proper mobile viewport — without this, mobile loads at ~980px
// zoomed-out and safe-area insets don't apply.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#000000',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const host = (await headers()).get('host');
  const brand = brandNameForHost(host);
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <BrandProvider brand={brand}>
          <QueryProvider>
            <AppProviders>
              <QuantAIThemeProvider>{children}</QuantAIThemeProvider>
            </AppProviders>
          </QueryProvider>
        </BrandProvider>
      </body>
    </html>
  );
}
