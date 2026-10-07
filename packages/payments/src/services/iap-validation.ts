// ============================================================================
// Payments - In-App Purchase server-side receipt validators
// ============================================================================
//
// SECURITY: these validators perform REAL server-side verification against the
// store APIs. They are FAIL-CLOSED by construction — any non-success response,
// network error, or unexpected payload yields `{ valid: false }`. They never
// fabricate a "valid" result. The owning service only constructs a validator
// when the corresponding provider credentials are configured; when no validator
// is configured the service itself fails closed.

import type { IAPReceipt, IAPValidationResult } from '../types';

/** Minimal fetch signature so tests can inject a fake transport. */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/** A platform-specific server-side IAP receipt validator. */
export interface IAPValidator {
  validate(receipt: IAPReceipt): Promise<IAPValidationResult>;
}

const APPLE_PRODUCTION_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';

interface AppleLatestReceiptInfo {
  product_id?: string;
  transaction_id?: string;
  original_transaction_id?: string;
  expires_date_ms?: string;
}

interface AppleVerifyResponse {
  status?: number;
  latest_receipt_info?: AppleLatestReceiptInfo[];
  pending_renewal_info?: Array<{ auto_renew_status?: string; product_id?: string }>;
}

/**
 * Real Apple App Store receipt validator (POST /verifyReceipt).
 * Handles the production -> sandbox retry (status 21007) per Apple's guidance.
 */
export class AppleReceiptValidator implements IAPValidator {
  constructor(
    private readonly sharedSecret: string,
    private readonly fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
  ) {}

  private async verify(url: string, receiptData: string): Promise<AppleVerifyResponse> {
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        'receipt-data': receiptData,
        password: this.sharedSecret,
        'exclude-old-transactions': true,
      }),
    });
    return (await res.json()) as AppleVerifyResponse;
  }

  async validate(receipt: IAPReceipt): Promise<IAPValidationResult> {
    const invalid = (error: string): IAPValidationResult => ({
      valid: false,
      platform: 'apple',
      productId: receipt.productId,
      transactionId: receipt.transactionId,
      error,
    });

    try {
      let body = await this.verify(APPLE_PRODUCTION_URL, receipt.receiptData);
      // 21007: receipt is from the sandbox but was sent to production.
      if (body.status === 21007) {
        body = await this.verify(APPLE_SANDBOX_URL, receipt.receiptData);
      }
      if (body.status !== 0) {
        return invalid(`Apple verifyReceipt status ${body.status ?? 'unknown'}`);
      }

      const info = (body.latest_receipt_info ?? []).find((i) => i.product_id === receipt.productId);
      if (!info) {
        return invalid('Receipt does not contain the requested product');
      }

      const expiresAt = info.expires_date_ms ? Number(info.expires_date_ms) : undefined;
      if (expiresAt !== undefined && expiresAt <= Date.now()) {
        return invalid('Subscription expired');
      }

      const autoRenewing = (body.pending_renewal_info ?? []).some(
        (r) => r.product_id === receipt.productId && r.auto_renew_status === '1',
      );

      return {
        valid: true,
        platform: 'apple',
        productId: receipt.productId,
        transactionId: info.transaction_id ?? receipt.transactionId,
        expiresAt,
        autoRenewing,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.warn(`[iap] Apple validation failed (fail-closed): ${message}`);
      return invalid('Apple validation error');
    }
  }
}

interface GoogleSubscriptionResponse {
  expiryTimeMillis?: string;
  startTimeMillis?: string;
  autoRenewing?: boolean;
  // 0 Payment pending, 1 Payment received, 2 Free trial, 3 Pending deferred
  paymentState?: number;
}

/**
 * Real Google Play subscription validator (Android Publisher API v3).
 * Requires an OAuth2 access token (provided by the deployment's service-account
 * token source) and the app package name.
 */
export class GooglePlayReceiptValidator implements IAPValidator {
  constructor(
    private readonly options: {
      packageName: string;
      accessTokenProvider: () => Promise<string>;
      fetchImpl?: FetchLike;
    },
  ) {}

  async validate(receipt: IAPReceipt): Promise<IAPValidationResult> {
    const fetchImpl = this.options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    const invalid = (error: string): IAPValidationResult => ({
      valid: false,
      platform: 'google',
      productId: receipt.productId,
      transactionId: receipt.transactionId,
      error,
    });

    try {
      const token = await this.options.accessTokenProvider();
      const url =
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
        `${encodeURIComponent(this.options.packageName)}/purchases/subscriptions/` +
        `${encodeURIComponent(receipt.productId)}/tokens/${encodeURIComponent(receipt.receiptData)}`;

      const res = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) {
        return invalid(`Google Play API responded ${res.status}`);
      }

      const body = (await res.json()) as GoogleSubscriptionResponse;
      // paymentState 1 (received) or 2 (free trial) are acceptable; 0/3 are not yet paid.
      if (body.paymentState !== 1 && body.paymentState !== 2) {
        return invalid('Subscription not in a paid state');
      }

      const expiresAt = body.expiryTimeMillis ? Number(body.expiryTimeMillis) : undefined;
      if (expiresAt !== undefined && expiresAt <= Date.now()) {
        return invalid('Subscription expired');
      }

      return {
        valid: true,
        platform: 'google',
        productId: receipt.productId,
        transactionId: receipt.transactionId,
        expiresAt,
        autoRenewing: body.autoRenewing ?? false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.warn(`[iap] Google Play validation failed (fail-closed): ${message}`);
      return invalid('Google validation error');
    }
  }
}

/** Build validators from environment configuration. Returns null entries when unconfigured. */
export function createIAPValidatorsFromEnv(): {
  apple: IAPValidator | null;
  google: IAPValidator | null;
} {
  const appleSecret = process.env['APPLE_IAP_SHARED_SECRET'];
  const apple = appleSecret ? new AppleReceiptValidator(appleSecret) : null;

  const packageName = process.env['GOOGLE_PLAY_PACKAGE_NAME'];
  const accessToken = process.env['GOOGLE_PLAY_ACCESS_TOKEN'];
  const google =
    packageName && accessToken
      ? new GooglePlayReceiptValidator({
          packageName,
          accessTokenProvider: async () => accessToken,
        })
      : null;

  return { apple, google };
}
