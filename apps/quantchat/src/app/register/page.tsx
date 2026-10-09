import { redirect } from 'next/navigation';

// QuantChat does not host its own registration: Quant accounts are created on
// QuantMail, the identity host that also powers "Continue with Quant Account"
// (SSO). This route exists so /register never dead-ends into the login page —
// it hands the visitor to the real registration flow
// (quantmail.in/register → POST /api/auth/register). After registering there,
// the new user signs in and returns to QuantChat through the SSO handoff.
const SSO_BASE_URL = process.env.NEXT_PUBLIC_QUANTMAIL_SSO_URL || 'https://quantmail.in';

export default function RegisterPage() {
  redirect(`${SSO_BASE_URL}/register`);
}
