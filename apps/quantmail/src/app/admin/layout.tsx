import type { Metadata } from 'next';
import { AdminGuard } from '../../components/AdminGuard';

/**
 * QuantMail admin route segment.
 *
 * Per-app platform-presence restructure (Phase 1 pilot): QuantMail carries its
 * own admin console at `/admin` instead of a shared `admin-enterprise` shell.
 * This layout is a Server Component so it can own the segment's metadata; the
 * role gate is the client `AdminGuard` (auth is already enforced by the root
 * layout's `AuthGuard`). The root layout supplies the `%s · QuantMail` title
 * template, so `title` below renders as "Admin Console · QuantMail".
 */
export const metadata: Metadata = {
  title: 'Admin Console',
  description: 'QuantMail administration — accounts, moderation, deliverability, and platform health.',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>;
}
