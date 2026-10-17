// Instant skeleton for client-side navigations to /register
// (fix/qm-auth-pages-paint): the sign-up shell's own geometry paints
// immediately — no "Loading QuantMail…" brand-splash spinner wall.
import { RegisterSkeleton } from './register-skeleton';

export default function Loading() {
  return <RegisterSkeleton />;
}
