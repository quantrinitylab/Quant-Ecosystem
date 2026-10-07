import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AdAuctionService } from '../services/ad-auction.service';

// ============================================================================
// QuantAd bidding/serving routes (mounted at /bidding).
//
//   POST /bidding/ad-request  -> run a second-price auction, return winning ad
//
// The auction is a pure service; here we pull ACTIVE campaigns from the DB,
// map them to candidates, and run the auction for the requested placement.
// ============================================================================

const adRequestSchema = z.object({
  placementId: z.string().min(1),
  reservePriceCents: z.coerce.number().int().min(1).optional(),
  context: z
    .object({
      interests: z.array(z.string().max(64)).max(50).optional(),
      geo: z.string().max(8).optional(),
    })
    .optional(),
});

export default async function biddingRoutes(fastify: FastifyInstance) {
  const auction = new AdAuctionService();

  fastify.post('/ad-request', async (request, reply) => {
    const parsed = adRequestSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;

    const prisma = (
      fastify as unknown as {
        prisma: { campaign: { findMany: (a: unknown) => Promise<Record<string, unknown>[]> } };
      }
    ).prisma;
    const campaigns = await prisma.campaign.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      take: 500,
    });

    const candidates = auction.campaignsToCandidates(campaigns);
    const result = auction.runAuction(parsed.data, candidates);

    // No-fill is a normal 200 outcome (the caller shows house/fallback content).
    return reply.send({ success: true, data: result });
  });
}
