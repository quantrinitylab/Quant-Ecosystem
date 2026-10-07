// W4 Quant Pay safety tests — Sentinel laws L1/L2/L3.
//
// NOTE: imports the src file directly (not the package barrel) because the
// `src/sentinel/sentinel.dart` barrel is owned by the shift coordinator and
// lands separately. The barrel will re-export this file; this test keeps
// compiling either way.

import 'package:flutter_test/flutter_test.dart';
import 'package:quantai_core/src/sentinel/quantpay_safety.dart';

OneTimeCardRequest _request({
  String merchant = 'Swiggy',
  int amountMinor = 125000,
  String currency = 'INR',
  String idempotencyKey = 'idem-0001',
  DateTime? expiresAt,
}) {
  return OneTimeCardRequest(
    merchant: merchant,
    amountMinor: amountMinor,
    currency: currency,
    idempotencyKey: idempotencyKey,
    expiresAt: expiresAt,
  );
}

void main() {
  group('L1 — unknown outcome forbids retry', () {
    test('unknown throws UnknownOutcomeNoRetry', () {
      expect(
        () => QuantPaySafety.resolveRetry(PaymentOutcome.unknown),
        throwsA(isA<UnknownOutcomeNoRetry>()),
      );
    });

    test('exception message names checkStatus as the only legal move', () {
      expect(
        const UnknownOutcomeNoRetry().toString(),
        contains('checkStatus'),
      );
    });

    test('succeeded is terminal and known — returns normally', () {
      expect(
        () => QuantPaySafety.resolveRetry(PaymentOutcome.succeeded),
        returnsNormally,
      );
    });

    test('failed is terminal and known — returns normally', () {
      // A failed payment may begin a NEW purchase (fresh approval, fresh
      // idempotency key) — never a blind retry of the failed request.
      expect(
        () => QuantPaySafety.resolveRetry(PaymentOutcome.failed),
        returnsNormally,
      );
    });
  });

  group('L2 — duplicate-payment risk surfacing', () {
    test('fresh key + unambiguous state → no risk', () {
      expect(
        QuantPaySafety.checkForDuplicateRisk(
          idempotencyKey: 'idem-0001',
          seenKeys: <String>{},
          stateAmbiguous: false,
        ),
        isNull,
      );
    });

    test('reused idempotency key → risk with user-facing reason', () {
      final DuplicatePaymentRisk? risk =
          QuantPaySafety.checkForDuplicateRisk(
        idempotencyKey: 'idem-0001',
        seenKeys: <String>{'idem-0001'},
        stateAmbiguous: false,
      );
      expect(risk, isNotNull);
      expect(risk!.idempotencyKey, 'idem-0001');
      expect(risk.reason, isNotEmpty);
      // Takeover offer present (blueprint §3.8).
      expect(risk.suggestedAction.toLowerCase(), contains('takeover'));
    });

    test('ambiguous state → risk even for a fresh key', () {
      final DuplicatePaymentRisk? risk =
          QuantPaySafety.checkForDuplicateRisk(
        idempotencyKey: 'idem-fresh',
        seenKeys: <String>{},
        stateAmbiguous: true,
      );
      expect(risk, isNotNull);
      expect(risk!.reason, contains('double'));
      expect(risk.suggestedAction.toLowerCase(), contains('takeover'));
    });
  });

  group('L3 — no standing budgets', () {
    test('budget-style request is rejected', () {
      expect(
        () => QuantPaySafety.validateNoStandingBudget(
          const StandingBudgetRequest(
            periodLabel: 'monthly',
            limitMinor: 50000,
            currency: 'INR',
          ),
        ),
        throwsA(isA<StandingBudgetRejected>()),
      );
    });

    test('ordinary one-time request passes validation untouched', () {
      expect(
        () => QuantPaySafety.validateNoStandingBudget(_request()),
        returnsNormally,
      );
    });

    test('null / unknown request types pass through', () {
      expect(
        () => QuantPaySafety.validateNoStandingBudget(null),
        returnsNormally,
      );
      expect(
        () => QuantPaySafety.validateNoStandingBudget('not-a-budget'),
        returnsNormally,
      );
    });
  });

  group('L2 — exact-terms binding', () {
    test('identical terms share a termsKey', () {
      final OneTimeCardRequest a = _request();
      final OneTimeCardRequest b = _request();
      expect(a.termsKey, b.termsKey);
    });

    test('amount change breaks the terms binding', () {
      final OneTimeCardRequest a = _request(amountMinor: 125000);
      final OneTimeCardRequest b = _request(amountMinor: 125001);
      expect(a.termsKey, isNot(equals(b.termsKey)));
    });

    test('termsStillBound approves exact match, rejects tampering', () {
      final OneTimeCardRequest approved = _request();
      expect(
        QuantPaySafety.termsStillBound(
          request: approved,
          approvedTermsKey: approved.termsKey,
        ),
        isTrue,
      );
      final OneTimeCardRequest tampered =
          _request(amountMinor: 999999, idempotencyKey: 'idem-0002');
      expect(
        QuantPaySafety.termsStillBound(
          request: tampered,
          approvedTermsKey: approved.termsKey,
        ),
        isFalse,
      );
    });

    test('expired request never binds', () {
      final OneTimeCardRequest expired = _request(
        expiresAt: DateTime.now().subtract(const Duration(minutes: 1)),
      );
      expect(expired.isExpired, isTrue);
      expect(
        QuantPaySafety.termsStillBound(
          request: expired,
          approvedTermsKey: expired.termsKey,
        ),
        isFalse,
      );
    });

    test('default expiry is ~10 minutes', () {
      final OneTimeCardRequest r = OneTimeCardRequest(
        merchant: 'Zomato',
        amountMinor: 50000,
        currency: 'INR',
        idempotencyKey: 'idem-ttl',
      );
      final Duration ttl = r.expiresAt.difference(DateTime.now());
      expect(ttl.inMinutes, inInclusiveRange(9, 10));
      expect(r.isExpired, isFalse);
    });

    test('constructor rejects invalid requests', () {
      expect(() => _request(amountMinor: 0), throwsA(isA<AssertionError>()));
      expect(() => _request(amountMinor: -100), throwsA(isA<AssertionError>()));
      expect(() => _request(merchant: ''), throwsA(isA<AssertionError>()));
      expect(
        () => _request(idempotencyKey: ''),
        throwsA(isA<AssertionError>()),
      );
    });

    test('non-onetime method is rejected', () {
      expect(
        () => OneTimeCardRequest(
          merchant: 'Swiggy',
          amountMinor: 125000,
          currency: 'INR',
          method: 'upi-autopay',
          idempotencyKey: 'idem-x',
        ),
        throwsA(isA<AssertionError>()),
      );
    });
  });
}
