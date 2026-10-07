import { OrderTracker } from '../shopping/order-tracker.js';
import { Order, OrderStatus, ShoppingMerchant } from '../types.js';

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'ord-1',
    merchantOrderId: 'AMZ-12345',
    merchant: ShoppingMerchant.amazon,
    items: ['item-1', 'item-2'],
    status: OrderStatus.placed,
    trackingUrl: 'https://track.example.com/ord-1',
    estimatedDelivery: Date.now() + 172800000,
    orderedAt: Date.now(),
    lastUpdate: Date.now(),
    ...overrides,
  };
}

describe('OrderTracker', () => {
  let tracker: OrderTracker;

  beforeEach(() => {
    tracker = new OrderTracker();
  });

  it('should add and retrieve orders', () => {
    tracker.addOrder(makeOrder());
    expect(tracker.getOrderHistory()).toHaveLength(1);
  });

  it('should update order status', () => {
    tracker.addOrder(makeOrder({ id: 'ord-1' }));
    const updated = tracker.updateStatus('ord-1', OrderStatus.shipped);
    expect(updated).toBe(true);
    expect(tracker.getOrderHistory()[0]!.status).toBe(OrderStatus.shipped);
  });

  it('should return false when updating non-existent order', () => {
    expect(tracker.updateStatus('not-found', OrderStatus.shipped)).toBe(false);
  });

  it('should get active orders (placed, confirmed, shipped, outForDelivery)', () => {
    tracker.addOrder(makeOrder({ id: 'ord-1', status: OrderStatus.placed }));
    tracker.addOrder(makeOrder({ id: 'ord-2', status: OrderStatus.shipped }));
    tracker.addOrder(makeOrder({ id: 'ord-3', status: OrderStatus.delivered }));
    const active = tracker.getActiveOrders();
    expect(active).toHaveLength(2);
  });

  it('should estimate delivery based on merchant', () => {
    const orderedAt = 1700000000000;
    const dayMs = 86400000;
    const estimate = tracker.estimateDelivery(ShoppingMerchant.amazon, orderedAt);
    expect(estimate).toBe(orderedAt + 2 * dayMs);

    const flipkart = tracker.estimateDelivery(ShoppingMerchant.flipkart, orderedAt);
    expect(flipkart).toBe(orderedAt + 3 * dayMs);
  });

  it('should initiate return for delivered orders', () => {
    tracker.addOrder(makeOrder({ id: 'ord-1', status: OrderStatus.delivered }));
    const result = tracker.trackReturn('ord-1');
    expect(result.initiated).toBe(true);
    expect(tracker.getOrderHistory()[0]!.status).toBe(OrderStatus.returned);
  });

  it('should reject return for non-delivered orders', () => {
    tracker.addOrder(makeOrder({ id: 'ord-1', status: OrderStatus.shipped }));
    const result = tracker.trackReturn('ord-1');
    expect(result.initiated).toBe(false);
  });

  it('should get refund status for returned order', () => {
    tracker.addOrder(makeOrder({ id: 'ord-1', status: OrderStatus.returned }));
    const result = tracker.getRefundStatus('ord-1');
    expect(result.status).toBe('pending');
  });

  it('should get refund status for refunded order', () => {
    tracker.addOrder(makeOrder({ id: 'ord-1', status: OrderStatus.refunded }));
    const result = tracker.getRefundStatus('ord-1');
    expect(result.status).toBe('completed');
  });
});
