import {
  getUserWallet,
  deductCreatorDiamonds,
  creditCreatorDiamonds,
} from './virtual-gifts.service';

export type PayoutMethod = 'upi' | 'bank_transfer' | 'paypal' | 'stripe';
export type PayoutStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';

export interface PayoutDetails {
  method: PayoutMethod;
  upiId?: string;
  bankAccountNumber?: string;
  ifscOrSwiftCode?: string;
  paypalEmail?: string;
}

export interface PayoutRequest {
  id: string;
  creatorId: string;
  diamondsAmount: number;
  usdAmount: number;
  status: PayoutStatus;
  details: PayoutDetails;
  requestedAt: string;
  processedAt?: string;
  failureReason?: string;
}

export const MINIMUM_PAYOUT_DIAMONDS = 1000; // $10.00 USD
export const DIAMOND_TO_USD_RATE = 0.01; // $0.01 per diamond

const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// In-memory ledger for payout requests
const payoutRequests: PayoutRequest[] = [];

/**
 * Validates payout destination details based on payment method.
 */
export function validatePayoutDetails(details: PayoutDetails): { valid: boolean; error?: string } {
  if (!details || !details.method) {
    return { valid: false, error: 'Payout method is required' };
  }

  switch (details.method) {
    case 'upi': {
      if (!details.upiId || typeof details.upiId !== 'string') {
        return { valid: false, error: 'UPI ID is required for UPI payout' };
      }
      const trimmedUpi = details.upiId.trim();
      if (!UPI_REGEX.test(trimmedUpi)) {
        return {
          valid: false,
          error: 'Invalid UPI ID format. Expected format: username@bank (e.g. creator@upi)',
        };
      }
      return { valid: true };
    }

    case 'bank_transfer': {
      if (!details.bankAccountNumber || typeof details.bankAccountNumber !== 'string') {
        return { valid: false, error: 'Bank account number is required' };
      }
      if (details.bankAccountNumber.trim().length < 6) {
        return {
          valid: false,
          error: 'Invalid bank account number (must be at least 6 characters)',
        };
      }
      if (!details.ifscOrSwiftCode || typeof details.ifscOrSwiftCode !== 'string') {
        return { valid: false, error: 'IFSC or SWIFT code is required' };
      }
      if (details.ifscOrSwiftCode.trim().length < 4) {
        return {
          valid: false,
          error: 'Invalid IFSC or SWIFT code (must be at least 4 characters)',
        };
      }
      return { valid: true };
    }

    case 'paypal': {
      if (!details.paypalEmail || typeof details.paypalEmail !== 'string') {
        return { valid: false, error: 'PayPal email address is required' };
      }
      const trimmedEmail = details.paypalEmail.trim();
      if (!EMAIL_REGEX.test(trimmedEmail)) {
        return { valid: false, error: 'Invalid PayPal email address format' };
      }
      return { valid: true };
    }

    case 'stripe': {
      if (!details.paypalEmail && !details.bankAccountNumber && !details.upiId) {
        return {
          valid: false,
          error: 'Stripe payout requires a linked email or bank account',
        };
      }
      return { valid: true };
    }

    default:
      return {
        valid: false,
        error: `Unsupported payout method: ${(details as { method?: string }).method}`,
      };
  }
}

/**
 * Initiates a creator diamond payout request.
 * - Validates minimum threshold (1,000 Diamonds = $10.00 USD)
 * - Validates payout details
 * - Verifies creator diamond balance and deducts/locks them in escrow
 */
export function requestPayout(
  creatorId: string,
  diamonds: number,
  details: PayoutDetails,
): PayoutRequest {
  if (diamonds < MINIMUM_PAYOUT_DIAMONDS) {
    throw new Error(
      `Minimum payout threshold is ${MINIMUM_PAYOUT_DIAMONDS} diamonds ($${(
        MINIMUM_PAYOUT_DIAMONDS * DIAMOND_TO_USD_RATE
      ).toFixed(2)} USD)`,
    );
  }

  const validation = validatePayoutDetails(details);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid payout details');
  }

  const wallet = getUserWallet(creatorId);
  if (wallet.diamondsBalance < diamonds) {
    throw new Error('INSUFFICIENT_DIAMONDS');
  }

  // Deduct & escrow diamonds from creator balance
  deductCreatorDiamonds(creatorId, diamonds);

  const usdAmount = Number((diamonds * DIAMOND_TO_USD_RATE).toFixed(2));
  const request: PayoutRequest = {
    id: `payout_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    creatorId,
    diamondsAmount: diamonds,
    usdAmount,
    status: 'PENDING',
    details: { ...details },
    requestedAt: new Date().toISOString(),
  };

  payoutRequests.push(request);
  return { ...request };
}

/**
 * Processes a payout request lifecycle.
 * - Can transition to PROCESSING, COMPLETED, or REJECTED
 * - If REJECTED, automatically refunds escrowed diamonds back to the creator balance
 */
export function processPayout(
  requestId: string,
  status: 'PROCESSING' | 'COMPLETED' | 'REJECTED',
  reason?: string,
): PayoutRequest {
  const request = payoutRequests.find((r) => r.id === requestId);
  if (!request) {
    throw new Error(`Payout request with id ${requestId} not found`);
  }

  if (request.status === 'COMPLETED' || request.status === 'REJECTED') {
    throw new Error(`Payout request has already been finalized with status ${request.status}`);
  }

  request.status = status;
  request.processedAt = new Date().toISOString();

  if (reason) {
    request.failureReason = reason;
  }

  // Refund escrowed diamonds if rejected
  if (status === 'REJECTED') {
    creditCreatorDiamonds(request.creatorId, request.diamondsAmount);
  }

  return { ...request };
}

/**
 * Returns payout history for a creator, sorted newest first.
 */
export function getCreatorPayoutHistory(creatorId: string): PayoutRequest[] {
  return payoutRequests
    .filter((r) => r.creatorId === creatorId)
    .map((r) => ({ ...r, details: { ...r.details } }))
    .reverse();
}

/**
 * Clears in-memory payout records (for testing purposes).
 */
export function clearPayoutsForTesting(): void {
  payoutRequests.length = 0;
}
