import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { createCoinPaymentAdapter } from '../services/coin-payment-adapter.js';
import { QuantAdsCreditsWallet } from '../services/credits-wallet.js';
import { BuyCoinLedgerService, EarnCoinLedgerService } from '../services/coin-services.js';

const createWalletSchema = z.object({
  userId: z.string().min(1),
});

const buyCoinsSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().positive(),
  gateway: z.enum(['stripe', 'razorpay', 'upi']),
  paymentRef: z.string().min(1),
  // Razorpay checkout callback fields — required for real (signed) verification.
  // Absent in dev => verification fails closed (no coins granted).
  paymentId: z.string().min(1).optional(),
  signature: z.string().min(1).optional(),
});

const dailyLoginSchema = z.object({
  userId: z.string().min(1),
});

const referralSchema = z.object({
  referrerId: z.string().min(1),
  referredId: z.string().min(1),
});

export default async function economyRoutes(fastify: FastifyInstance) {
  const wallet = new QuantAdsCreditsWallet((fastify as unknown as { prisma: unknown }).prisma);
  const buyCoinService = new BuyCoinLedgerService(wallet);
  const earnCoinService = new EarnCoinLedgerService(wallet);

  fastify.post(
    '/',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parseResult = createWalletSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw parseResult.error;
      }

      try {
        // The credit ledger has no explicit "create wallet" step — a wallet is
        // implicit and starts at a zero balance. Return the current balance.
        const balance = await wallet.getBalance(parseResult.data.userId);
        return reply
          .status(201)
          .send({ success: true, data: { userId: parseResult.data.userId, balance } });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to create wallet';
        throw createAppError(message, 400, 'WALLET_CREATE_FAILED');
      }
    },
  );

  fastify.get<{ Params: { userId: string } }>(
    '/wallet/:userId',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      try {
        const balance = await wallet.getBalance(request.params.userId);
        return reply.send({ success: true, data: { userId: request.params.userId, balance } });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Wallet not found';
        throw createAppError(message, 404, 'WALLET_NOT_FOUND');
      }
    },
  );

  fastify.post(
    '/wallet/buy',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parseResult = buyCoinsSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw parseResult.error;
      }

      const { userId, amount, gateway, paymentRef } = parseResult.data;

      // Real, fail-closed payment verification. Without live Razorpay
      // credentials and a valid (orderId, paymentId, signature) the adapter
      // rejects the purchase — no coins are granted (the previous mock returned
      // true unconditionally, granting free coins).
      const paymentAdapter = createCoinPaymentAdapter({
        ...(parseResult.data.paymentId ? { paymentId: parseResult.data.paymentId } : {}),
        ...(parseResult.data.signature ? { signature: parseResult.data.signature } : {}),
      });

      try {
        let result;
        if (gateway === 'stripe') {
          result = await buyCoinService.buyWithStripe(userId, amount, paymentRef, paymentAdapter);
        } else if (gateway === 'razorpay') {
          result = await buyCoinService.buyWithRazorpay(userId, amount, paymentRef, paymentAdapter);
        } else {
          result = await buyCoinService.buyWithUPI(userId, amount, paymentRef, paymentAdapter);
        }
        return reply.status(201).send({ success: true, data: result });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Buy coins failed';
        throw createAppError(message, 400, 'BUY_COINS_FAILED');
      }
    },
  );

  fastify.post(
    '/wallet/earn/daily',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parseResult = dailyLoginSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw parseResult.error;
      }

      try {
        const result = await earnCoinService.claimDailyLogin(parseResult.data.userId);
        return reply.send({ success: true, data: result });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Daily login claim failed';
        throw createAppError(message, 400, 'DAILY_LOGIN_FAILED');
      }
    },
  );

  fastify.post(
    '/wallet/earn/referral',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parseResult = referralSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw parseResult.error;
      }

      try {
        const result = await earnCoinService.claimReferralBonus(
          parseResult.data.referrerId,
          parseResult.data.referredId,
        );
        return reply.send({ success: true, data: result });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Referral claim failed';
        throw createAppError(message, 400, 'REFERRAL_CLAIM_FAILED');
      }
    },
  );
}

// Security: CodeQL #178: /wallet/earn/daily has an explicit per-route rate limit.
