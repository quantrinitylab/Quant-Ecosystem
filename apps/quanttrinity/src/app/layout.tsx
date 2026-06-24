import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { QueryProvider } from '../providers/query-provider';
import { OwnerProvider } from '../providers/owner-provider';
import { TrinityLayout } from '../components/TrinityLayout';
import { QuantSidekickProvider, QuantSidekick } from '@quant/shared-ui';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'QuantTrinity | Owner Command Center',
  description:
    'QuantTrinity — the owner command center for the Quant Ecosystem: cross-app control, team & AI-employee provisioning, economy and model governance, and the owner personal QuantAI.',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="%236D28D9"/><text x="16" y="22" font-size="16" font-weight="bold" text-anchor="middle" fill="white">QT</text></svg>',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <QueryProvider>
          <OwnerProvider>
            <QuantSidekickProvider>
              <TrinityLayout>{children}</TrinityLayout>
              <QuantSidekick />
            </QuantSidekickProvider>
          </OwnerProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
