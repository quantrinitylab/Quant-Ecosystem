import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Quant Ecosystem — The Next NVIDIA of Software',
  description:
    'One sovereign account unlocking Mail, Git, Social, AI, Video, and Chat with a single personal AI agent and unified Quant Credits.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0D1117] text-[#E6EDF3] min-h-screen antialiased selection:bg-[#FF8C42]/20 selection:text-[#FF8C42]">
        {children}
      </body>
    </html>
  );
}
