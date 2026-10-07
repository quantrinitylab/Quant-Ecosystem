import { Order, OrderStatus, ShoppingMerchant } from '../types.js';

export class OrderTracker {
  private orders: Order[] = [];

  addOrder(order: Order): void {
    this.orders.push(order);
  }

  updateStatus(orderId: string, status: OrderStatus): boolean {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return false;
    order.status = status;
    order.lastUpdate = Date.now();
    return true;
  }

  getActiveOrders(): Order[] {
    const active = [
      OrderStatus.placed,
      OrderStatus.confirmed,
      OrderStatus.shipped,
      OrderStatus.outForDelivery,
    ];
    return this.orders.filter((o) => active.includes(o.status));
  }

  getOrderHistory(): Order[] {
    return [...this.orders];
  }

  estimateDelivery(merchant: ShoppingMerchant, orderedAt: number): number {
    const day = 86400000;
    const est: Record<ShoppingMerchant, number> = {
      [ShoppingMerchant.amazon]: 2 * day,
      [ShoppingMerchant.flipkart]: 3 * day,
      [ShoppingMerchant.myntra]: 4 * day,
      [ShoppingMerchant.ajio]: 5 * day,
      [ShoppingMerchant.meesho]: 6 * day,
    };
    return orderedAt + est[merchant];
  }

  trackReturn(orderId: string): { initiated: boolean; message: string } {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return { initiated: false, message: 'Order not found' };
    if (order.status !== OrderStatus.delivered)
      return { initiated: false, message: 'Only delivered orders can be returned' };
    order.status = OrderStatus.returned;
    order.lastUpdate = Date.now();
    return { initiated: true, message: 'Return initiated for order ' + orderId };
  }

  getRefundStatus(orderId: string): { status: string; message: string } {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return { status: 'unknown', message: 'Order not found' };
    if (order.status === OrderStatus.refunded)
      return { status: 'completed', message: 'Refund processed' };
    if (order.status === OrderStatus.returned)
      return { status: 'pending', message: 'Return received, refund in progress' };
    return { status: 'not_applicable', message: 'No return/refund initiated' };
  }
}
