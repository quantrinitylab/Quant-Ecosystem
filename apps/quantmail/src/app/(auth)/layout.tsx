import './auth.css';

/**
 * fix/qm-auth-css-payload-7: public auth route group
 * (/login, /register, /forgot-password, /reset-password).
 *
 * Imports ONLY the auth stylesheet. The core globals.css comes from the root
 * layout above. The ~250KB app CSS bundle (app.css / shell.css /
 * overrides.css / workplace.css) is imported by the (app) route-group layout
 * instead — so the public auth pages never download it. Do not import any
 * app stylesheet here.
 */
export default function AuthGroupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
