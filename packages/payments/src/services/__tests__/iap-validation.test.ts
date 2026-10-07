// ============================================================================
// Payments - IAP validator tests (real server-side validation logic)
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  AppleReceiptValidator,
  GooglePlayReceiptValidator,
  type FetchLike,
} from '../iap-validation';
import type { IAPReceipt } from '../../types';

function fakeFetch(responses: Array<{ ok?: boolean; status?: number; json: unknown }>): FetchLike {
  let i = 0;
  return async () => {
    const r = responses[Math.min(i, responses.length - 1)]!;
    i++;
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: async () => r.json,
    };
  };
}

const appleReceipt: IAPReceipt = {
  platform: 'apple',
  receiptData: 'base64-receipt-data-here',
  transactionId: 'txn_1',
  productId: 'com.quant.pro_monthly',
};

describe('AppleReceiptValidator', () => {
  it('returns valid for a status-0 receipt containing the product', async () => {
    const future = String(Date.now() + 30 * 86400000);
    const v = new AppleReceiptValidator(
      'secret',
      fakeFetch([
        {
          json: {
            status: 0,
            latest_receipt_info: [
              {
                product_id: 'com.quant.pro_monthly',
                transaction_id: 'txn_real',
                expires_date_ms: future,
              },
            ],
            pending_renewal_info: [{ product_id: 'com.quant.pro_monthly', auto_renew_status: '1' }],
          },
        },
      ]),
    );

    const result = await v.validate(appleReceipt);
    expect(result.valid).toBe(true);
    expect(result.transactionId).toBe('txn_real');
    expect(result.autoRenewing).toBe(true);
  });

  it('fails closed for a non-zero status', async () => {
    const v = new AppleReceiptValidator('secret', fakeFetch([{ json: { status: 21003 } }]));
    const result = await v.validate(appleReceipt);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('21003');
  });

  it('retries against sandbox on status 21007', async () => {
    const future = String(Date.now() + 30 * 86400000);
    const v = new AppleReceiptValidator(
      'secret',
      fakeFetch([
        { json: { status: 21007 } },
        {
          json: {
            status: 0,
            latest_receipt_info: [{ product_id: 'com.quant.pro_monthly', expires_date_ms: future }],
          },
        },
      ]),
    );
    const result = await v.validate(appleReceipt);
    expect(result.valid).toBe(true);
  });

  it('fails closed for an expired subscription', async () => {
    const past = String(Date.now() - 1000);
    const v = new AppleReceiptValidator(
      'secret',
      fakeFetch([
        {
          json: {
            status: 0,
            latest_receipt_info: [{ product_id: 'com.quant.pro_monthly', expires_date_ms: past }],
          },
        },
      ]),
    );
    const result = await v.validate(appleReceipt);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('expired');
  });

  it('fails closed when the network throws', async () => {
    const v = new AppleReceiptValidator('secret', async () => {
      throw new Error('network down');
    });
    const result = await v.validate(appleReceipt);
    expect(result.valid).toBe(false);
  });
});

describe('GooglePlayReceiptValidator', () => {
  const googleReceipt: IAPReceipt = {
    platform: 'google',
    receiptData: 'purchase-token',
    transactionId: 'GPA.1',
    productId: 'com.quant.pro_yearly',
  };

  it('returns valid for a paid, unexpired subscription', async () => {
    const future = String(Date.now() + 365 * 86400000);
    const v = new GooglePlayReceiptValidator({
      packageName: 'com.quant.app',
      accessTokenProvider: async () => 'token',
      fetchImpl: fakeFetch([
        { json: { paymentState: 1, expiryTimeMillis: future, autoRenewing: true } },
      ]),
    });
    const result = await v.validate(googleReceipt);
    expect(result.valid).toBe(true);
    expect(result.autoRenewing).toBe(true);
  });

  it('fails closed when payment state is not paid', async () => {
    const v = new GooglePlayReceiptValidator({
      packageName: 'com.quant.app',
      accessTokenProvider: async () => 'token',
      fetchImpl: fakeFetch([{ json: { paymentState: 0 } }]),
    });
    const result = await v.validate(googleReceipt);
    expect(result.valid).toBe(false);
  });

  it('fails closed on a non-ok HTTP response', async () => {
    const v = new GooglePlayReceiptValidator({
      packageName: 'com.quant.app',
      accessTokenProvider: async () => 'token',
      fetchImpl: fakeFetch([{ ok: false, status: 401, json: {} }]),
    });
    const result = await v.validate(googleReceipt);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('401');
  });
});
