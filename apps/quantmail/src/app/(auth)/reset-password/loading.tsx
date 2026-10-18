// Instant skeleton for client-side navigations to /reset-password
// (fix/qm-auth-pages-paint): the new-password shell's own geometry paints
// immediately — no "Loading QuantMail…" brand-splash spinner wall.
import { ResetPasswordSkeleton } from './reset-password-skeleton';

export default function Loading() {
  return <ResetPasswordSkeleton />;
}
