// ============================================================================
// Legacy document share URLs — /documents/public/share/<token>.
//
// Document share links issued before the /drive/share/<token> unification
// pointed here. Redirect them to the ONE canonical landing page so old links
// keep working instead of 404ing.
// ============================================================================
import { redirect } from 'next/navigation';

export default async function LegacyDocumentShareRedirect({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(`/drive/share/${encodeURIComponent(token)}`);
}
