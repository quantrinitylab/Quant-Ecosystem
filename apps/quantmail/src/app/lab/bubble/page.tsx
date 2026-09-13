import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BubbleLab } from './BubbleLab';

/**
 * The Bubble Intelligence lab: all 35 avatar states side by side, live.
 *
 * Same policy as the mark lab next door — NOT A PRODUCT ROUTE. There is no
 * `middleware.ts` in this app and the root layout does not gate on auth, so an
 * internal page under `/lab` would otherwise be world-readable on the live
 * deployment. It 404s unless `QUANT_ENABLE_LABS` is set, and `force-dynamic`
 * makes that a request-time check rather than something baked in at build.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Bubble Intelligence lab',
  robots: { index: false, follow: false },
};

export default function BubbleLabPage() {
  const enabled = process.env.QUANT_ENABLE_LABS === '1' || process.env.NODE_ENV !== 'production';
  if (!enabled) notFound();

  return <BubbleLab />;
}
