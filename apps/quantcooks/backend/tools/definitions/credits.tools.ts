// ============================================================================
// QuantCooks CP-1 — Group G: credits (tools 31–33, Tier A shape; the
// quote engine is CP-1's, the ledger reads settle in CP-2 — §6.6).
//
// Tool 31 is live now for FREE / FLAT / PER_SECOND / not_wired rules and
// refuses honestly for PROVIDER rules. Tools 32–33 refuse with
// CREDITS_NOT_CONFIGURED until CP-2 wires the CreditsExecutionPort — a
// fabricated balance is the one output these tools must never produce.
// Tool 33's executor already reads the ledger through the port-era shape
// (the §6.2 history mapping) for the day CP-2 flips the port on.
// ============================================================================

import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import type { ToolRegistry } from '../registry';
import { serializeQuote } from '../registry';
import { out } from './shared';

const creditsAvailability = (deps: { credits: unknown }) =>
  deps.credits
    ? { available: true }
    : { available: false, reason: 'CREDITS_NOT_CONFIGURED' };

function requireCredits(deps: { credits: unknown }): void {
  if (!deps.credits) {
    throw createAppError(
      'The Quant Credits ledger is not wired on this deployment yet (CP-2)',
      503,
      'CREDITS_NOT_CONFIGURED',
    );
  }
}

export function registerCreditTools(registry: ToolRegistry): void {
  registry.register({
    name: 'quantcooks.get_credit_quote',
    group: 'credits',
    description:
      'Price any registered credit-bearing tool’s exact params WITHOUT executing or reserving. Quotes expire after 15 minutes. For a provider-priced tool with no provider configured this refuses with PROVIDER_NOT_CONFIGURED and no number — never an estimate dressed as a quote. Free.',
    mode: 'sync',
    tier: 'A',
    permissionTier: 0,
    inputSchema: z.object({
      tool: z.string().min(1),
      params: z.record(z.string(), z.unknown()).optional().default({}),
    }),
    outputSchema: out({
      quoteId: z.string(),
      tool: z.string(),
      credits: z.number(),
      breakdown: z.array(z.unknown()),
      expiresAt: z.string(),
      availability: z.string(),
    }),
    example: {
      input: { tool: 'quantcooks.suggest_titles', params: { description: 'Biryani film' } },
    },
    execute: async (input, ctx, deps) => {
      const quote = await deps.registry!.quote(input.tool, input.params, ctx);
      return {
        ...serializeQuote(quote),
        ...('metering' in quote ? { metering: quote.metering } : {}),
      };
    },
  });

  registry.register({
    name: 'quantcooks.get_credit_balance',
    group: 'credits',
    description:
      'Read the caller’s Quant Credits balance (daily / monthly / purchased buckets, total, and the amount currently held by open reservations). Refuses with CREDITS_NOT_CONFIGURED until the ledger is wired (CP-2). Free.',
    mode: 'sync',
    tier: 'A',
    permissionTier: 0,
    availability: (deps) => creditsAvailability(deps),
    inputSchema: z.object({}),
    outputSchema: out({
      daily: z.number(),
      monthly: z.number(),
      purchased: z.number(),
      total: z.number(),
      held: z.number(),
    }),
    example: { input: {} },
    execute: async (input, ctx, deps) => {
      requireCredits(deps);
      const balance = await deps.credits!.getBalance(ctx.actorUserId);
      return { ...balance };
    },
  });

  registry.register({
    name: 'quantcooks.list_credit_history',
    group: 'credits',
    description:
      'List the caller’s credit ledger entries, newest first (powers the Account → Usage table). Refuses with CREDITS_NOT_CONFIGURED until the ledger is wired (CP-2). Free.',
    mode: 'sync',
    tier: 'A',
    permissionTier: 0,
    availability: (deps) => creditsAvailability(deps),
    inputSchema: z.object({
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    }),
    outputSchema: out({ entries: z.array(z.unknown()), total: z.number() }),
    example: { input: {}, output: { entries: [], total: 0 } },
    execute: async (input, ctx, deps) => {
      requireCredits(deps);
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 20;
      const ledger = (
        deps.prisma as {
          creditLedgerEntry?: {
            findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
            count: (args: Record<string, unknown>) => Promise<number>;
          };
        }
      ).creditLedgerEntry;
      if (!ledger) {
        throw createAppError(
          'The Quant Credits ledger is not wired on this deployment yet (CP-2)',
          503,
          'CREDITS_NOT_CONFIGURED',
        );
      }
      const where = { ownerRef: ctx.actorUserId };
      const [rows, total] = await Promise.all([
        ledger.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        ledger.count({ where }),
      ]);
      return {
        entries: rows.map((row) => ({
          id: row['id'],
          entryType: row['entryType'],
          bucket: row['bucket'],
          amount: row['amount'],
          reason: row['reason'],
          sourceRef: row['sourceRef'],
          createdAt: row['createdAt'],
        })),
        total,
      };
    },
  });
}
