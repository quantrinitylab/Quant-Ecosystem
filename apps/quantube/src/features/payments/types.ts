// ============================================================================
// quantube — payments + payout surface DTOs (Layer 5 request/response contracts)
// ============================================================================
//
// Frontend-facing shapes for the payments / payout api-client hooks (Task 13.2).
// Mirror the JSON the quantube backend routes return
// (apps/quantube/backend/routes/{payments,payouts}.ts), wrapping the as-shipped
// `@quant/payments` Stripe gateway and the `@quant/creator-economy`
// `PayoutService`. Typed against the `{ success, data }` envelope via
// `APIResponse<T>` at the hook layer. NO secret material is ever surfaced to the
// client — only ids/status/test-mode metadata.

export type PayoutMethodName = 'bank_transfer' | 'paypal' | 'crypto' | 'quant_credits';
export type PayoutStatusName = 'pending' | 'processing' | 'completed' | 'failed';

// --- payments (Stripe gateway) --------------------------------------------

export interface CreatePaymentIntentInput {
  amount: number;
  currency: string;
  customerId?: string;
  metadata?: Record<string, string>;
}

export interface CreatePaymentIntentResponse {
  id: string;
  clientSecret: string | null;
  status: string;
}

export interface CreateCustomerInput {
  email: string;
  name: string;
  metadata?: Record<string, string>;
}

export interface CreateCustomerResponse {
  id: string;
  email: string | null;
}

export interface RefundInput {
  paymentIntentId: string;
  amount?: number;
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
}

export interface RefundResponse {
  id: string;
  status: string | null;
  amount: number;
}

export interface PaymentsConfigResponse {
  /** True when the backend runs against a Stripe TEST placeholder key. */
  testMode: boolean;
}

// --- payouts (creator-economy money movement) ------------------------------

export interface PayoutDTO {
  id: string;
  creatorId: string;
  amount: number;
  method: PayoutMethodName;
  status: PayoutStatusName;
  requestedAt: string;
}

export interface PayoutHistoryResponse {
  payouts: PayoutDTO[];
}

export interface PayoutBalanceResponse {
  available: number;
}

export interface RequestPayoutInput {
  amount: number;
  method: PayoutMethodName;
}

export interface RequestPayoutResponse {
  payout: PayoutDTO;
}

export interface PayoutStatusResponse {
  id: string;
  status: PayoutStatusName;
}

/** Variables for the admin process/complete mutations (dynamic path by id). */
export interface PayoutIdInput {
  id: string;
}

export interface PayoutMutationResponse {
  payout: PayoutDTO;
}
