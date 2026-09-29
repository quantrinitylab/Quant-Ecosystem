import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { QueryProvider } from '../providers/query-provider';
import { AppProviders } from '../providers/app-providers';
import { MotionProvider } from '@quant/shared-ui';
import { AppLayout } from '../components/AppLayout';
import { VoiceCommandHost } from '../components/VoiceCommandHost';
import { registerQuantsyncVoice } from '../voice-registration';

registerQuantsyncVoice();

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'QuantWave | Quant',
  description:
    'QuantWave - Twitter/X + Threads + Reddit hybrid with real-time threads, communities, and live spaces',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="%231DA1F2"/><text x="16" y="22" font-size="18" font-weight="bold" text-anchor="middle" fill="white">Q</text></svg>',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={inter.className}>
        <QueryProvider>
          <AppProviders>
            <MotionProvider>
              <VoiceCommandHost appId="quantsync" userId="guest" />
              <AppLayout>{children}</AppLayout>
            </MotionProvider>
          </AppProviders>
        </QueryProvider>
      </body>
    </html>
  );
}
