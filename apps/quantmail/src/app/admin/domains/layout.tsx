import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin · Domains',
  description: 'QuantMail staff administration — accepted mail domains and DNS verification (M19).',
  robots: { index: false, follow: false },
};

export default function AdminDomainsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
