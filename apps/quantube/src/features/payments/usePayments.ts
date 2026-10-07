// ============================================================================
// quantube — payments + payout api-client hooks (Layer 5, Task 13.2)
// ============================================================================
//
// The ONLY sanctioned call path from a quantube UI surface to the
// `@quant/payments` Stripe gateway and the `@quant/creator-economy`
// `PayoutService`: typed react-query hooks over the same-origin Next proxy paths
// under `/api/payments/*` and `/api/payouts/*` (never inline fetch —
// Requirement 1.4). Each proxy forwards the bearer + x-request-id to the backend
// (Layer 4), which reaches the decorated engines behind the global auth hook
// (Layer 2/3). These complete the creator-economy paid surface whose payout
// (money-movement) hooks were deferred from Task 13.1.
import { useApiQuery, useApiMutation } from '@quant/api-client';
import type { UseApiQueryOptions } from '@quant/api-client';
import type {
  CreateCustomerInput,
  CreateCustomerResponse,
  CreatePaymentIntentInput,
  CreatePaymentIntentResponse,
  PaymentsConfigResponse,
  PayoutBalanceResponse,
  PayoutHistoryResponse,
  PayoutIdInput,
  PayoutMutationResponse,
  PayoutStatusResponse,
  RefundInput,
  RefundResponse,
  RequestPayoutInput,
  RequestPayoutResponse,
} from './types';

// --- payments (Stripe gateway) --------------------------------------------

/** POST /api/payments/intents — create a Stripe PaymentIntent. */
export function useCreatePaymentIntent() {
  return useApiMutation<CreatePaymentIntentInput, CreatePaymentIntentResponse>(
    '/api/payments/intents',
  );
}

/** POST /api/payments/customers — create a Stripe Customer. */
export function useCreateCustomer() {
  return useApiMutation<CreateCustomerInput, CreateCustomerResponse>('/api/payments/customers');
}

/** POST /api/payments/refunds — refund a Stripe PaymentIntent. */
export function useRefund() {
  return useApiMutation<RefundInput, RefundResponse>('/api/payments/refunds');
}

/** GET /api/payments/config — non-sensitive integration metadata (test-mode). */
export function usePaymentsConfig(options?: UseApiQueryOptions) {
  return useApiQuery<PaymentsConfigResponse>('/api/payments/config', options);
}

// --- payouts (creator-economy money movement) ------------------------------

/** GET /api/payouts — the caller's payout history. */
export function usePayoutHistory(options?: UseApiQueryOptions) {
  return useApiQuery<PayoutHistoryResponse>('/api/payouts', options);
}

/** GET /api/payouts/balance — the caller's available (withdrawable) balance. */
export function usePayoutBalance(options?: UseApiQueryOptions) {
  return useApiQuery<PayoutBalanceResponse>('/api/payouts/balance', options);
}

/** GET /api/payouts/:id — a single payout's status (disabled until id present). */
export function usePayoutStatus(id: string | undefined, options?: UseApiQueryOptions) {
  return useApiQuery<PayoutStatusResponse>(`/api/payouts/${id ?? ''}`, {
    ...options,
    enabled: (options?.enabled ?? true) && Boolean(id),
  });
}

/** POST /api/payouts/request — request a payout (money movement). */
export function useRequestPayout() {
  return useApiMutation<RequestPayoutInput, RequestPayoutResponse>('/api/payouts/request');
}

/** POST /api/payouts/:id/process — move a payout into processing (admin). */
export function useProcessPayout() {
  return useApiMutation<PayoutIdInput, PayoutMutationResponse>('/api/payouts', {
    path: (input) => `/api/payouts/${input.id}/process`,
  });
}

/** POST /api/payouts/:id/complete — settle a payout as completed (admin). */
export function useCompletePayout() {
  return useApiMutation<PayoutIdInput, PayoutMutationResponse>('/api/payouts', {
    path: (input) => `/api/payouts/${input.id}/complete`,
  });
}
