import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin · DLP & Audit',
  description: 'QuantMail staff administration — DLP policies and the append-only audit trail (M20).',
  robots: { index: false, follow: false },
};

export default function AdminDlpAuditLayout({ children }: { children: React.ReactNode }) {
  return children;
}
