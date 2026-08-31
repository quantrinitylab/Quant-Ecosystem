import { RouteSkeleton } from '../../components/RouteSkeleton';

export default function Loading() {
  // Literal rather than `appDisplayName('code')`: this is a server component and
  // that helper lives in a `'use client'` module, so importing it here would
  // hand back a client reference and throw when called during server render.
  return <RouteSkeleton variant="board" label="QuantGit" />;
}
