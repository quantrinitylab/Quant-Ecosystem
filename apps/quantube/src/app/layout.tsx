import '../styles/globals.css';
import React, { type ReactNode } from 'react';
import { QueryProvider } from '../providers/query-provider';
import { ThemeProvider } from '../providers/theme-provider';
import { AuthProvider } from '../providers/auth-provider';
import { AudioPlayerProvider } from '../components/audio/AudioPlayerContext';
import { GlobalAudioPlayerDock } from '../components/audio/GlobalAudioPlayerDock';

export const metadata = {
  title: 'QuantTube - Sovereign Video & Audio',
  description: 'Spotify-class music streaming and adaptive HLS video platform',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-[var(--quant-background)] text-[var(--quant-foreground)] antialiased">
        <QueryProvider>
          <AuthProvider>
            <ThemeProvider>
              <AudioPlayerProvider>
                <main className="min-h-screen pb-24">{children}</main>
                <GlobalAudioPlayerDock />
              </AudioPlayerProvider>
            </ThemeProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
