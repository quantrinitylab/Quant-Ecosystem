'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Card,
  Button,
  Badge,
  LoadingState,
  ErrorState,
  EmptyState,
  PageTransition,
  StaggerList,
} from '@quant/shared-ui';
import { spring } from '@quant/brand';
import { quantAdsAPI } from '../../services/api-client';
import { SignInRequired } from '../../components/SignInRequired';
import { isUnauthorizedError } from '../../lib/auth-errors';
import type { Invoice, PaymentMethod } from '../../types';

const staggerItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', ...spring.gentle } },
};

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  const statusVariant =
    invoice.status === 'paid'
      ? 'success'
      : invoice.status === 'overdue'
        ? 'danger'
        : invoice.status === 'refunded'
          ? 'warning'
          : 'default';

  return (
    <motion.div variants={staggerItem}>
      <Card className="p-4 mb-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">${invoice.amount.toLocaleString()}</h3>
              <Badge variant={statusVariant}>{invoice.status}</Badge>
            </div>
            <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">
              {new Date(invoice.periodStart).toLocaleDateString()} -{' '}
              {new Date(invoice.periodEnd).toLocaleDateString()}
            </p>
          </div>
          <p className="text-xs text-[var(--quant-muted-foreground)]">
            Due: {new Date(invoice.dueDate).toLocaleDateString()}
          </p>
        </div>
      </Card>
    </motion.div>
  );
}

function PaymentMethodCard({ method }: { method: PaymentMethod }) {
  return (
    <Card className="p-3 mb-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium capitalize">{method.type.replace('_', ' ')}</span>
          <span className="text-xs text-[var(--quant-muted-foreground)]">
            ending in {method.last4}
          </span>
          {method.isDefault && <Badge variant="default">Default</Badge>}
        </div>
        {method.expiryMonth && method.expiryYear && (
          <span className="text-xs text-[var(--quant-muted-foreground)]">
            Exp {method.expiryMonth}/{method.expiryYear}
          </span>
        )}
      </div>
    </Card>
  );
}

export default function BillingPage() {
  const {
    data: invoices,
    isLoading: invoicesLoading,
    isError: invoicesError,
    error: invoicesErr,
    refetch: refetchInvoices,
  } = useQuery({
    queryKey: ['billing-invoices'],
    queryFn: async () => {
      const response = await quantAdsAPI.listInvoices();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load invoices');
      }
      return response.data || [];
    },
  });

  const {
    data: paymentMethods,
    isLoading: methodsLoading,
    isError: methodsError,
  } = useQuery({
    queryKey: ['billing-payment-methods'],
    queryFn: async () => {
      const response = await quantAdsAPI.listPaymentMethods();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load payment methods');
      }
      return response.data || [];
    },
  });

  const isLoading = invoicesLoading || methodsLoading;

  return (
    <PageTransition>
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Billing</h1>
          <Button
            variant="primary"
            size="sm"
            className="min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)]"
          >
            Add Payment Method
          </Button>
        </div>

        {isLoading && <LoadingState text="Loading billing information..." />}

        {invoicesError &&
          (isUnauthorizedError(invoicesErr) ? (
            <SignInRequired />
          ) : (
            <ErrorState
              message={
                invoicesErr instanceof Error ? invoicesErr.message : 'Failed to load billing'
              }
              onRetry={() => refetchInvoices()}
            />
          ))}

        {!isLoading && !invoicesError && !methodsError && (
          <>
            <h2 className="text-lg font-semibold mb-3">Payment Methods</h2>
            {paymentMethods && paymentMethods.length > 0 ? (
              <div className="mb-8">
                {paymentMethods.map((method: PaymentMethod) => (
                  <PaymentMethodCard key={method.id} method={method} />
                ))}
              </div>
            ) : (
              <div className="mb-8">
                <EmptyState
                  title="No payment methods"
                  description="Add a payment method to start running campaigns."
                />
              </div>
            )}

            <h2 className="text-lg font-semibold mb-3">Invoices</h2>
            {invoices && invoices.length === 0 && (
              <EmptyState
                title="No invoices yet"
                description="Invoices will appear here once you start running campaigns."
              />
            )}

            {invoices && invoices.length > 0 && (
              <StaggerList className="space-y-0">
                {invoices.map((invoice: Invoice) => (
                  <InvoiceRow key={invoice.id} invoice={invoice} />
                ))}
              </StaggerList>
            )}
          </>
        )}
      </main>
    </PageTransition>
  );
}
