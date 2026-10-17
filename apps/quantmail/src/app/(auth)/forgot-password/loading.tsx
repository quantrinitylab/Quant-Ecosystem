// Instant skeleton for client-side navigations to /forgot-password
// (fix/qm-auth-pages-paint): the recovery shell's own geometry paints
// immediately — no "Loading QuantMail…" brand-splash spinner wall.
import { ForgotPasswordSkeleton } from './forgot-password-skeleton';

export default function Loading() {
  return <ForgotPasswordSkeleton />;
}
