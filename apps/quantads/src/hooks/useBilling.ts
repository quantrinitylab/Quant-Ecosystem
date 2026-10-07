// ============================================================================
// QuantAds - Billing Hooks (React Query)
// Billing data, invoices, payment methods
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { quantAdsAPI } from '../services/api-client';

export const billingKeys = {
  all: ['billing'] as const,
  balance: ['billing', 'balance'] as const,
  invoices: ['billing', 'invoices'] as const,
  paymentMethods: ['billing', 'payment-methods'] as const,
};

export function useBalance() {
  return useQuery({
    queryKey: billingKeys.balance,
    queryFn: async () => {
      const response = await quantAdsAPI.getBalance();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load balance');
      }
      return response.data;
    },
  });
}

export function useInvoices() {
  return useQuery({
    queryKey: billingKeys.invoices,
    queryFn: async () => {
      const response = await quantAdsAPI.listInvoices();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load invoices');
      }
      return response.data || [];
    },
  });
}

export function usePaymentMethods() {
  return useQuery({
    queryKey: billingKeys.paymentMethods,
    queryFn: async () => {
      const response = await quantAdsAPI.listPaymentMethods();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load payment methods');
      }
      return response.data || [];
    },
  });
}

export function useAddPaymentMethod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Parameters<typeof quantAdsAPI.addPaymentMethod>[0]) => {
      const response = await quantAdsAPI.addPaymentMethod(data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to add payment method');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.paymentMethods });
    },
  });
}

export default useBalance;
