import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { ProductCatalog, ShoppingCartService } from '../services/shopping.service';

const addToCartSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(99).default(1),
});

const productsQuerySchema = z.object({
  category: z.string().optional(),
});

function getUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

/**
 * Real shopping routes. The catalog is empty until products are actually
 * listed — the frontend shows an honest empty state. Checkout is 501 until a
 * payment provider is wired; it never fabricates orders.
 */
export default async function shoppingRoutes(fastify: FastifyInstance) {
  const catalog = new ProductCatalog();
  const carts = new ShoppingCartService(catalog);

  // GET /shopping/products — the live product catalog.
  fastify.get('/products', async (request, reply) => {
    const queryResult = productsQuerySchema.safeParse(request.query);
    const query = queryResult.success ? queryResult.data : {};
    const products = catalog.listProducts(query.category);
    return reply.send({ success: true, data: { products } });
  });

  // GET /shopping/cart — the caller's cart.
  fastify.get('/cart', async (request, reply) => {
    const userId = getUserId(request);
    return reply.send({ success: true, data: carts.getCart(userId) });
  });

  // POST /shopping/cart — add a catalog product to the cart.
  fastify.post('/cart', async (request, reply) => {
    const userId = getUserId(request);
    const parseResult = addToCartSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }
    try {
      const cart = carts.addItem(userId, parseResult.data.productId, parseResult.data.quantity);
      return reply.send({ success: true, data: cart });
    } catch (e: unknown) {
      if (e instanceof Error && (e.message === 'PRODUCT_NOT_FOUND' || e.message === 'PRODUCT_OUT_OF_STOCK')) {
        throw createAppError(
          e.message === 'PRODUCT_NOT_FOUND' ? 'Product not found' : 'Product is out of stock',
          404,
          e.message,
        );
      }
      throw e;
    }
  });

  // DELETE /shopping/cart/:productId — remove a line item.
  fastify.delete<{ Params: { productId: string } }>('/cart/:productId', async (request, reply) => {
    const userId = getUserId(request);
    const cart = carts.removeItem(userId, request.params.productId);
    return reply.send({ success: true, data: cart });
  });

  // POST /shopping/checkout — honestly not implemented: no payment provider
  // is wired, so no order is created. 501 beats a fabricated order every time.
  fastify.post('/checkout', async (_request, reply) => {
    return reply.status(501).send({
      success: false,
      error: {
        code: 'CHECKOUT_NOT_IMPLEMENTED',
        message: 'Checkout is not available yet — no payment provider is wired.',
      },
    });
  });
}
