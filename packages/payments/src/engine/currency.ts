/**
 * Runtime predicate for a well-formed currency code.
 *
 * Adopted from `@quant/payment` (consolidated into `@quant/payments` under K8):
 * a pragmatic ISO-4217 alpha-shape check — a non-empty, uppercase,
 * exactly-three-letter code (e.g. `USD`, `EUR`, `INR`). This rejects the actual
 * bug inputs (`''`, `'us'`, `'usd'`, `'US$'`, `'USDT'`) without adding a new
 * dependency or coupling the payments domain to any external currency table.
 * The accepted set can be tightened later without changing this contract.
 *
 * Accepts `unknown` so it is safe to call on untrusted, possibly non-string
 * request input.
 */
export function isValidCurrency(currency: unknown): boolean {
  return typeof currency === 'string' && /^[A-Z]{3}$/.test(currency);
}
