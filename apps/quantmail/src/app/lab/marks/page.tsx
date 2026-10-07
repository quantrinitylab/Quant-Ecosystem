import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MarkLab } from './MarkLab';

/**
 * The material lab: four QuantGit candidates side by side, so the family's
 * material gets picked by eye once instead of being argued about six times.
 *
 * NOT A PRODUCT ROUTE. There is no `middleware.ts` in this app and the root
 * layout does not gate on auth, so an internal page under `/lab` would otherwise
 * be world-readable on the live deployment. It 404s unless `QUANT_ENABLE_LABS`
 * is set, and `force-dynamic` is what makes that a *request-time* check — a
 * statically prerendered page would bake in whatever the build machine's
 * environment happened to say.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mark material lab',
  robots: { index: false, follow: false },
};

export default function MarksLabPage() {
  const enabled = process.env.QUANT_ENABLE_LABS === '1' || process.env.NODE_ENV !== 'production';
  if (!enabled) notFound();

  return <MarkLab />;
}
