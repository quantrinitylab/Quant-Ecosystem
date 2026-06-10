export interface PaymentMethod {
  id: string;
  userId: string;
  type: 'card' | 'paypal' | 'crypto';
  details: Record<string, any>;
  isDefault: boolean;
}
