import '../app.css';
import '../shell.css';
import '../overrides.css';
import '../workplace.css';

/**
 * fix/qm-auth-css-payload-7: authenticated app route group.
 *
 * Imports the app-only styles that were split out of the root layout, so the
 * public auth shell stops shipping them. Cascade order is preserved exactly
 * (core globals.css from the root layout, then app < shell < overrides <
 * workplace) — app routes render byte-identical CSS to before the split.
 */
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
