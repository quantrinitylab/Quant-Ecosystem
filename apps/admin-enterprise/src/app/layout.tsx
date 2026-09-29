import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Quant Enterprise Admin Console',
  description:
    'Multi-tenant administration platform for corporate organizations on the Quant Ecosystem.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-white text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
