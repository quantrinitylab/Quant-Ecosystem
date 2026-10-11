import { redirect } from 'next/navigation';

// QuantChat does not host its own password recovery: Quant accounts live on
// QuantMail, the identity host that also powers "Continue with Quant
// Account" (SSO) and /register. This route exists so /forgot-password —
// and the "Forgot password?" link on the login page's password form —
// never dead-ends back into /login (P1, live audit 2026-10-11: there was
// no recovery path on QuantChat at all). It hands the visitor to
// QuantMail's real recovery flow (/forgot-password → /reset-password),
// mirroring src/app/register/page.tsx. The path is in the route registry's
// PUBLIC_PATHS so the auth gate lets logged-out visitors reach this
// handoff instead of bouncing them to /login first.
const SSO_BASE_URL = process.env.NEXT_PUBLIC_QUANTMAIL_SSO_URL || 'https://quantmail.in';

export default function ForgotPasswordPage() {
  redirect(`${SSO_BASE_URL}/forgot-password`);
}
