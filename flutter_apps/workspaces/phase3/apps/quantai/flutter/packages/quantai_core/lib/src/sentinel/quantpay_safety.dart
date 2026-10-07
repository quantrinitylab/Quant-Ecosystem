// ============================================================================
// quantai_core - Quant Pay safety layer (Sentinel, blueprint §3.8)
// ============================================================================
//
// Three hard laws, enforced in code — not in documentation:
//
//   L1. Unknown payment outcome → NO RETRY. The only legal move after an
//       unknown outcome is `checkStatus`; a retry attempt throws
//       [UnknownOutcomeNoRetry]. Blind retries are how duplicate charges
//       happen.
//   L2. Every purchase is a one-time virtual card bound to exact terms
//       (merchant + amount + method). The [OneTimeCardRequest.idempotencyKey]
//       is the duplicate-payment guard; reuse or ambiguity is surfaced as a
//       [DuplicatePaymentRisk], never silently retried.
//   L3. No P2P, no standing budgets. A budget-style request ("₹500/month tak
//       kharch kar do") is rejected by [QuantPaySafety.validateNoStandingBudget]
//       — this is the payment side of the no-standing-spend-grants Sentinel law.
//
// The real card number never leaves the vault: the agent and the merchant only
// ever see the one-time token. `method` is always [quantPayOneTimeCardMethod].

/// Payment method identifier for the one-time virtual card flow.
///
/// Pinned as a constant (and asserted in [OneTimeCardRequest]) so no other
/// rail can be smuggled in through this path.
const String quantPayOneTimeCardMethod = 'quantpay-onetime-card';

/// Default validity window for a one-time card request (~10 min, matching the
/// approval-card expiry discipline of blueprint §3.2).
const Duration oneTimeCardValidity = Duration(minutes: 10);

/// A request to mint a one-time virtual card for ONE purchase with exact terms.
///
/// The terms triple (merchant, amountMinor, currency) plus [method] is the
/// binding the user's approval is locked to ([termsKey]). Changing any term
/// after approval produces a different key — i.e. a different request that
/// needs a fresh approval.
class OneTimeCardRequest {
  /// Merchant descriptor, exactly as shown to the user on the approval card.
  final String merchant;

  /// Charge amount in minor units (paise for INR). Must be > 0.
  final int amountMinor;

  /// ISO 4217 currency code, e.g. `INR`.
  final String currency;

  /// Always [quantPayOneTimeCardMethod]; any other value is rejected.
  final String method;

  /// Required duplicate-payment guard. Must be unique per purchase attempt.
  final String idempotencyKey;

  /// The card token dies after this. Defaults to ~10 min from construction.
  final DateTime expiresAt;

  OneTimeCardRequest({
    required this.merchant,
    required this.amountMinor,
    required this.currency,
    this.method = quantPayOneTimeCardMethod,
    required this.idempotencyKey,
    DateTime? expiresAt,
  })  : expiresAt = expiresAt ?? DateTime.now().add(oneTimeCardValidity),
        assert(merchant.isNotEmpty, 'merchant must not be empty'),
        assert(amountMinor > 0, 'amountMinor must be positive (paise)'),
        assert(currency.isNotEmpty, 'currency must not be empty'),
        assert(idempotencyKey.isNotEmpty, 'idempotencyKey is required'),
        assert(
          method == quantPayOneTimeCardMethod,
          'only $quantPayOneTimeCardMethod is allowed here',
        );

  /// Exact-terms binding key: merchant + amount + currency + method.
  ///
  /// The approval card quotes these terms; the charge must match them or the
  /// approval does not apply.
  String get termsKey =>
      '$method|$merchant|$amountMinor|${currency.toUpperCase()}';

  /// `true` once the card window has lapsed — minting is then refused
  /// upstream and the user must re-approve.
  bool get isExpired => DateTime.now().isAfter(expiresAt);

  @override
  String toString() =>
      'OneTimeCardRequest(termsKey: $termsKey, expiresAt: $expiresAt)';
}

/// Terminal outcome of a payment attempt.
enum PaymentOutcome {
  /// The charge settled. `checkStatus` may be used for reconciliation.
  succeeded,

  /// The charge failed definitively. A new attempt is a NEW purchase: fresh
  /// approval, fresh idempotency key — never a blind retry of this request.
  failed,

  /// The outcome is unknown (timeout, dropped connection, ambiguous
  /// response). [QuantPaySafety.resolveRetry] throws for this case.
  unknown,
}

/// Thrown when code attempts to retry a payment whose outcome is unknown.
///
/// The legal move is `checkStatus` (read-only), then surface the risk to the
/// user with a takeover offer — see [DuplicatePaymentRisk].
class UnknownOutcomeNoRetry implements Exception {
  const UnknownOutcomeNoRetry();

  @override
  String toString() =>
      'UnknownOutcomeNoRetry: payment outcome is unknown — retry is '
      'forbidden. Use checkStatus (read-only) and surface the '
      'duplicate-payment risk to the user.';
}

/// A budget-style payment request — rejected by design (law L3).
///
/// "₹500/month tak kharch kar do" is impossible: there is no representation
/// for a standing budget that can pass validation, so no code path can grant
/// one.
class StandingBudgetRequest {
  /// Human label, e.g. `monthly`.
  final String periodLabel;

  /// Cap in minor units.
  final int limitMinor;

  /// ISO 4217 currency code.
  final String currency;

  const StandingBudgetRequest({
    required this.periodLabel,
    required this.limitMinor,
    required this.currency,
  });
}

/// Thrown by [QuantPaySafety.validateNoStandingBudget] for budget requests.
class StandingBudgetRejected implements Exception {
  const StandingBudgetRejected();

  @override
  String toString() =>
      'StandingBudgetRejected: standing spend grants are forbidden by '
      'Sentinel law — every purchase needs a fresh, exact-terms approval.';
}

/// A flagged duplicate-payment risk: shown to the user, not retried silently.
///
/// Carries a user-facing [reason] (Hinglish, safe to display on the approval
/// surface) and a [suggestedAction] (the takeover offer from blueprint §3.8).
class DuplicatePaymentRisk {
  /// The idempotency key involved.
  final String idempotencyKey;

  /// Why this is risky — displayable to the user as-is.
  final String reason;

  /// What should happen instead — the takeover offer.
  final String suggestedAction;

  const DuplicatePaymentRisk({
    required this.idempotencyKey,
    required this.reason,
    required this.suggestedAction,
  });

  @override
  String toString() =>
      'DuplicatePaymentRisk(key: $idempotencyKey, reason: $reason)';
}

/// Static safety checks for the Quant Pay flow (no instances, no state).
class QuantPaySafety {
  QuantPaySafety._();

  /// Enforces the unknown-outcome discipline (law L1).
  ///
  /// - [PaymentOutcome.unknown] → throws [UnknownOutcomeNoRetry]. The caller
  ///   must call `checkStatus` (read-only) instead and surface a
  ///   [DuplicatePaymentRisk].
  /// - [PaymentOutcome.succeeded] / [PaymentOutcome.failed] → returns
  ///   normally; the outcome is terminal and known.
  static void resolveRetry(PaymentOutcome outcome) {
    switch (outcome) {
      case PaymentOutcome.succeeded:
      case PaymentOutcome.failed:
        return;
      case PaymentOutcome.unknown:
        throw const UnknownOutcomeNoRetry();
    }
  }

  /// Enforces the no-standing-budgets law (L3) on the payment side.
  ///
  /// Throws [StandingBudgetRejected] for [StandingBudgetRequest]. Anything
  /// else passes through untouched.
  static void validateNoStandingBudget(Object? request) {
    if (request is StandingBudgetRequest) {
      throw const StandingBudgetRejected();
    }
  }

  /// Flags duplicate-payment risk from idempotency-key reuse or ambiguity.
  ///
  /// Returns `null` when the key is fresh and the state is unambiguous —
  /// i.e. it is safe to proceed to minting. Otherwise returns a
  /// [DuplicatePaymentRisk] with a user-facing reason and takeover action.
  static DuplicatePaymentRisk? checkForDuplicateRisk({
    required String idempotencyKey,
    required Set<String> seenKeys,
    required bool stateAmbiguous,
  }) {
    if (stateAmbiguous) {
      return DuplicatePaymentRisk(
        idempotencyKey: idempotencyKey,
        reason:
            'Payment ka status clear nahi hai — dobara try karne par double '
            'charge ho sakta hai.',
        suggestedAction:
            'Takeover: pehle main payment status check karta hoon, phir aap '
            'batayenge aage kya karna hai.',
      );
    }
    if (seenKeys.contains(idempotencyKey)) {
      return DuplicatePaymentRisk(
        idempotencyKey: idempotencyKey,
        reason:
            'Ye payment request pehle bhi bheji ja chuki hai — dobara '
            'bhejne par duplicate charge ka risk hai.',
        suggestedAction:
            'Takeover: main status verify karta hoon; naya payment chahiye '
            'to fresh approval ke saath naya request banega.',
      );
    }
    return null;
  }

  /// Verifies an approved request still matches the approved terms before
  /// the charge (exact-terms binding, law L2).
  ///
  /// Returns `true` iff [request] is unexpired and its [OneTimeCardRequest.termsKey]
  /// equals [approvedTermsKey]. Any mismatch or expiry → `false`: the
  /// approval does not cover this charge.
  static bool termsStillBound({
    required OneTimeCardRequest request,
    required String approvedTermsKey,
  }) {
    if (request.isExpired) return false;
    return request.termsKey == approvedTermsKey;
  }
}
