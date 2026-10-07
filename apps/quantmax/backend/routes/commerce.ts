import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  FlightSearchEngine,
  TrainSearchEngine,
  MerchantAggregator,
  OrderTracker,
  PriceAlertManager,
  VisualSearchEngine,
  ShoppingMerchant,
  OrderStatus,
  SortBy,
} from '@quant/quant-commerce';
import type { Order } from '@quant/quant-commerce';

// ============================================================================
// quant-commerce seam — decorator service + scoped routes (quantmax, Task 14.4)
// ============================================================================
//
// Req 3.2. Wires `@quant/quant-commerce` into quantmax AS-SHIPPED (no rewrite —
// Req 9.1). quant-commerce `dependsOn @quant/payments`, so it is decorated AFTER
// `fastify.payments` in `buildApp()` (the money rail it builds checkout flows on
// top of). Composed once at boot into a decorated singleton (`fastify.commerce`,
// never per-request) bundling the engine's as-shipped exports: the travel
// search engines (`FlightSearchEngine`, `TrainSearchEngine`), the shopping
// `MerchantAggregator` + `OrderTracker` + `PriceAlertManager`, and the
// `VisualSearchEngine`. The engines are provider-pluggable aggregators (no live
// provider is registered here — Req 9.1 wires them as-is; searches return the
// aggregated set, empty until a provider is attached).
//
// AUTH (Req 7.1): every route sits behind the global `onRequest` auth hook from
// `createApp()` (401 unauthenticated). Mutating routes additionally declare a
// `commerce:write` scope via `requireAuth({ scopes })`. The `/commerce` prefix
// does NOT collide with any server-core PUBLIC_PATHS entry. Inputs are
// Zod-validated; every response uses the canonical `{ success, data }` envelope.
// Persistence is the engines' own in-memory state (no new schema — Req 9.5).

/**
 * The composite commerce service decorated onto the instance — the as-shipped
 * `@quant/quant-commerce` engines.
 */
export interface CommerceService {
  flights: FlightSearchEngine;
  trains: TrainSearchEngine;
  merchants: MerchantAggregator;
  orders: OrderTracker;
  priceAlerts: PriceAlertManager;
  visual: VisualSearchEngine;
}

// Layer 2 type augmentation.
declare module 'fastify' {
  interface FastifyInstance {
    commerce: CommerceService;
  }
}

/**
 * Construct the quant-commerce service bundle once at boot. Called from
 * quantmax `buildApp()` via `app.decorate('commerce', ...)`.
 */
export function createCommerceService(): CommerceService {
  return {
    flights: new FlightSearchEngine(),
    trains: new TrainSearchEngine(),
    merchants: new MerchantAggregator(),
    orders: new OrderTracker(),
    priceAlerts: new PriceAlertManager(),
    visual: new VisualSearchEngine(),
  };
}

const flightSearchSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  date: z.string().min(1),
  passengers: z.number().int().positive().optional().default(1),
  travelClass: z.string().min(1).optional().default('economy'),
});

const trainSearchSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  date: z.string().min(1),
});

const merchantSearchSchema = z.object({
  query: z.string().min(1),
  category: z.string().min(1).optional(),
  minPrice: z.number().nonnegative().optional(),
  maxPrice: z.number().nonnegative().optional(),
  sortBy: z.nativeEnum(SortBy).optional(),
  merchants: z.array(z.nativeEnum(ShoppingMerchant)).optional(),
});

const trackOrderSchema = z.object({
  merchantOrderId: z.string().min(1),
  merchant: z.nativeEnum(ShoppingMerchant),
  items: z.array(z.string().min(1)).min(1),
});

const priceAlertSchema = z.object({
  itemId: z.string().min(1),
  targetPrice: z.number().positive(),
  currentPrice: z.number().positive(),
  autoBuy: z.boolean().optional().default(false),
  maxAutoBuyAmount: z.number().positive().optional(),
});

export default async function commerceRoutes(fastify: FastifyInstance) {
  // --- travel search (FlightSearchEngine / TrainSearchEngine) ---------------

  // POST /commerce/flights/search — aggregate a flight search. Read (no side
  // effect); global auth hook only.
  fastify.post('/flights/search', async (request, reply) => {
    const parsed = flightSearchSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw parsed.error;
    }
    const flights = await fastify.commerce.flights.searchFlights(
      parsed.data.from,
      parsed.data.to,
      parsed.data.date,
      parsed.data.passengers,
      parsed.data.travelClass,
    );
    return reply.send({ success: true, data: { flights } });
  });

  // POST /commerce/trains/search — aggregate a train search. Read.
  fastify.post('/trains/search', async (request, reply) => {
    const parsed = trainSearchSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw parsed.error;
    }
    const trains = await fastify.commerce.trains.searchTrains(
      parsed.data.from,
      parsed.data.to,
      parsed.data.date,
    );
    return reply.send({ success: true, data: { trains } });
  });

  // --- shopping comparison (MerchantAggregator) -----------------------------

  // POST /commerce/shopping/search — cross-merchant price comparison. Read.
  fastify.post('/shopping/search', async (request, reply) => {
    const parsed = merchantSearchSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw parsed.error;
    }
    const comparison = await fastify.commerce.merchants.search(parsed.data);
    return reply.send({ success: true, data: { comparison } });
  });

  // --- order tracking (OrderTracker) ----------------------------------------

  // GET /commerce/orders — order history (read). 401 unauthenticated.
  fastify.get('/orders', async (_request, reply) => {
    const orders = fastify.commerce.orders.getOrderHistory();
    const active = fastify.commerce.orders.getActiveOrders();
    return reply.send({ success: true, data: { orders, active } });
  });

  // POST /commerce/orders — start tracking an order. Mutating → `commerce:write`.
  fastify.post(
    '/orders',
    { preHandler: fastify.requireAuth({ scopes: ['commerce:write'] }) },
    async (request, reply) => {
      const parsed = trackOrderSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }
      const now = Date.now();
      const order: Order = {
        id: `order-${now}-${request.auth.userId}`,
        merchantOrderId: parsed.data.merchantOrderId,
        merchant: parsed.data.merchant,
        items: parsed.data.items,
        status: OrderStatus.placed,
        trackingUrl: '',
        estimatedDelivery: fastify.commerce.orders.estimateDelivery(parsed.data.merchant, now),
        orderedAt: now,
        lastUpdate: now,
      };
      fastify.commerce.orders.addOrder(order);
      return reply.status(201).send({ success: true, data: { order } });
    },
  );

  // --- price alerts (PriceAlertManager) -------------------------------------

  // GET /commerce/price-alerts — the active price alerts (read).
  fastify.get('/price-alerts', async (_request, reply) => {
    const alerts = fastify.commerce.priceAlerts.getActiveAlerts();
    return reply.send({ success: true, data: { alerts } });
  });

  // POST /commerce/price-alerts — create a price alert. Mutating → `commerce:write`.
  fastify.post(
    '/price-alerts',
    { preHandler: fastify.requireAuth({ scopes: ['commerce:write'] }) },
    async (request, reply) => {
      const parsed = priceAlertSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }
      const alert = fastify.commerce.priceAlerts.addAlert(
        parsed.data.itemId,
        parsed.data.targetPrice,
        parsed.data.currentPrice,
        parsed.data.autoBuy,
        parsed.data.maxAutoBuyAmount,
      );
      return reply.status(201).send({ success: true, data: { alert } });
    },
  );
}
