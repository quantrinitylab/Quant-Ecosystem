export interface PaymentMethod {
  id: string;
  userId: string;
  type: 'card' | 'paypal' | 'crypto';
  details: Record<string, any>;
  isDefault: boolean;
}

export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  type: 'subscription' | 'one_time' | 'refund';
  status: 'pending' | 'completed' | 'failed';
  metadata?: Record<string, any>;
  createdAt: Date;
}

export class PaymentEngine {
  private methods: Map<string, PaymentMethod[]> = new Map();
  private transactions: Transaction[] = [];

  async addPaymentMethod(
    userId: string,
    method: Omit<PaymentMethod, 'id' | 'userId'>,
  ): Promise<PaymentMethod> {
    const newMethod: PaymentMethod = {
      ...method,
      id: `pm_${Date.now()}`,
      userId,
    };

    const userMethods = this.methods.get(userId) || [];
    userMethods.push(newMethod);
    this.methods.set(userId, userMethods);

    return newMethod;
  }

  async processPayment(
    userId: string,
    amount: number,
    currency: string,
    type: Transaction['type'],
    metadata?: Record<string, any>,
  ): Promise<Transaction> {
    const transaction: Transaction = {
      id: `tx_${Date.now()}`,
      userId,
      amount,
      currency,
      type,
      status: 'pending',
      metadata,
      createdAt: new Date(),
    };

    // Simulate payment processing
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 95% success rate simulation
    transaction.status = Math.random() > 0.05 ? 'completed' : 'failed';

    this.transactions.push(transaction);
    return transaction;
  }

  async getUserTransactions(userId: string): Promise<Transaction[]> {
    return this.transactions.filter((t) => t.userId === userId);
  }

  async getUserPaymentMethods(userId: string): Promise<PaymentMethod[]> {
    return this.methods.get(userId) || [];
  }
}

export const paymentEngine = new PaymentEngine();
