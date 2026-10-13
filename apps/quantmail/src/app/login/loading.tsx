// Instant skeleton for client-side navigations to /login
// (fix/qm-login-paint-vs-gmail): the sign-in shell's own geometry paints
// immediately — no "Loading QuantMail…" brand-splash spinner wall.
import { LoginSkeleton } from './login-skeleton';

export default function Loading() {
  return <LoginSkeleton />;
}
