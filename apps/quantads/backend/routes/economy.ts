import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { CoinWallet, BuyCoinService, EarnCoinService } from '@quant/quant-economy';

const createWalletSchema = z.object({
  userId: z.string().min(1),
});

const buyCoinsSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().positive(),
  gateway: z.enum(['stripe', 'razorpay', 'upi']),
  paymentRef: z.string().min(1),
});

const dailyLoginSchema = z.object({
  userId: z.string().min(1),
});

const referralSchema = z.object({
  referrerId: z.string().min(1),
  referredId: z.string().min(1),
});

export default async function economyRoutes(fastify: FastifyInstance) {
  const wallet = new CoinWallet();
  const buyCoinService = new BuyCoinService(wallet);
  const earnCoinService = new EarnCoinService(wallet);

  fastify.post('/', async (request, reply) => {
    const parseResult = createWalletSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    try {
      const result = wallet.createWallet(parseResult.data.userId);
      return reply.status(201).send({ success: true, data: result });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to create wallet';
      throw createAppError(message, 400, 'WALLET_CREATE_FAILED');
    }
  });

  fastify.get<{ Params: { userId: string } }>('/wallet/:userId', async (request, reply) => {
    try {
      const balance = wallet.getBalance(request.params.userId);
      return reply.send({ success: true, data: { userId: request.params.userId, balance } });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Wallet not found';
      throw createAppError(message, 404, 'WALLET_NOT_FOUND');
    }
  });

  fastify.post('/wallet/buy', async (request, reply) => {
    const parseResult = buyCoinsSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const { userId, amount, gateway, paymentRef } = parseResult.data;

    const mockAdapter = {
      createOrder: async (amt: number, currency: string) => ({
        orderId: `order-${crypto.randomUUID()}`,
        amount: amt,
        currency,
      }),
      verifyPayment: async () => true,
    };

    try {
      let result;
      if (gateway === 'stripe') {
        result = await buyCoinService.buyWithStripe(userId, amount, paymentRef, mockAdapter);
      } else if (gateway === 'razorpay') {
        result = await buyCoinService.buyWithRazorpay(userId, amount, paymentRef, mockAdapter);
      } else {
        result = await buyCoinService.buyWithUPI(userId, amount, paymentRef, mockAdapter);
      }
      return reply.status(201).send({ success: true, data: result });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Buy coins failed';
      throw createAppError(message, 400, 'BUY_COINS_FAILED');
    }
  });

  fastify.post('/wallet/earn/daily', async (request, reply) => {
    const parseResult = dailyLoginSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    try {
      const result = earnCoinService.claimDailyLogin(parseResult.data.userId);
      return reply.send({ success: true, data: result });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Daily login claim failed';
      throw createAppError(message, 400, 'DAILY_LOGIN_FAILED');
    }
  });

  fastify.post('/wallet/earn/referral', async (request, reply) => {
    const parseResult = referralSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    try {
      const result = earnCoinService.claimReferralBonus(
        parseResult.data.referrerId,
        parseResult.data.referredId,
      );
      return reply.send({ success: true, data: result });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Referral claim failed';
      throw createAppError(message, 400, 'REFERRAL_CLAIM_FAILED');
    }
  });
}
