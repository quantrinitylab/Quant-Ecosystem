/**
 * Stable, machine-readable codes for payment validation failures.
 *
 * Adopted from `@quant/payment` (consolidated into `@quant/payments` under K8).
 *
 * These are intentionally HTTP-agnostic: the payments domain package is
 * framework-neutral, so the codes carry no `statusCode`. The HTTP boundary
 * (e.g. the QuantAI `/process` route) is responsible for mapping a
 * `PaymentValidationError` to an HTTP status (a client error → 400).
 */
export type PaymentValidationCode = 'INVALID_PAYMENT_AMOUNT' | 'INVALID_PAYMENT_CURRENCY';

/**
 * Typed validation error thrown by the payment engine when an input fails a
 * precondition (non-finite/non-positive amount, or a malformed currency code).
 *
 * The error is thrown by the validation guard at the very top of
 * `PaymentEngine.processPayment`, BEFORE any `EngineTransaction` is constructed
 * and BEFORE `processor.charge` is invoked, so a rejected call has no side
 * effects.
 *
 * A stable `name` and `code` give callers a reliable classification hook without
 * depending on the server framework. `Object.setPrototypeOf` restores the
 * prototype chain so `instanceof` keeps working after TypeScript downleveling to
 * older targets.
 */
export class PaymentValidationError extends Error {
  /** Stable, machine-readable classification code. */
  readonly code: PaymentValidationCode;

  constructor(message: string, code: PaymentValidationCode) {
    super(message);
    this.name = 'PaymentValidationError';
    this.code = code;
    // Restore the prototype chain so `instanceof PaymentValidationError` holds
    // even when compiled to ES5/ES2015 targets.
    Object.setPrototypeOf(this, PaymentValidationError.prototype);
  }
}
