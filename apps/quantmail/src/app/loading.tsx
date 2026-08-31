import { RouteSkeleton } from '../components/RouteSkeleton';

/**
 * Root fallback — and, because `app/page.tsx` shares this segment, the inbox's
 * own loading state.
 *
 * It used to be a full-screen `BrandLoader variant="splash"`, which every route
 * in the app inherited. That splash now lives in `components/RouteSplash.tsx` and
 * is mounted only by the auth routes, where "the app is starting" is actually
 * true. Everywhere else — here included — the honest answer is a silhouette of
 * the list that is arriving.
 */
export default function Loading() {
  return <RouteSkeleton variant="list" label="inbox" />;
}
