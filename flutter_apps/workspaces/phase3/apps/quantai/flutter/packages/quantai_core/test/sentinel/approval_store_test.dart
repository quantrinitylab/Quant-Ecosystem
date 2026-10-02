// W2 Shift 1: approval store tests (approve/deny/expire, terms law, no
// standing grants).
//
// Imports `src/` directly: the sentinel barrel is the coordinator's file,
// so these tests must not depend on `quantai_core.dart` exports.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quantai_core/src/sentinel/approval_store.dart';
import 'package:quantai_core/src/sentinel/approval_taxonomy.dart';

ProviderContainer _container() {
  final container = ProviderContainer();
  addTearDown(container.dispose);
  return container;
}

ApprovalStore _store(ProviderContainer container) =>
    container.read(approvalStoreProvider.notifier);

const _terms = ApprovalTerms('Acme Store', 49900, 'INR', 'quantpay-onetime-card');

void main() {
  group('requestApproval', () {
    test('returns a monotonic appr_<seq>_<micros> id and registers pending',
        () {
      final container = _container();
      final store = _store(container);

      final id1 = store.requestApproval('mail.send', ActionRisk.sensitive, 'Send');
      final id2 = store.requestApproval('mail.read', ActionRisk.ordinary, 'Read');

      expect(id1, matches(RegExp(r'^appr_1_\d+$')));
      expect(id2, matches(RegExp(r'^appr_2_\d+$')));
      expect(id1, isNot(id2));
      expect(
        container.read(approvalStoreProvider),
        containsPair(id1, isA<ApprovalRequest>()),
      );
    });
  });

  group('approve / deny / awaitDecision', () {
    test('approve resolves an ordinary request as approved', () async {
      final container = _container();
      final store = _store(container);
      final id = store.requestApproval('mail.read', ActionRisk.ordinary, 'Read inbox');

      // Agent awaits BEFORE the user decides: the future must stay pending
      // until the card resolves.
      final future = store.awaitDecision(id);
      store.approve(id);

      final decision = await future;
      expect(decision.outcome, DecisionOutcome.approved);
      expect(decision.decidedBy, 'user');
      expect(decision.requestId, id);
      expect(container.read(approvalStoreProvider), isNot(contains(id)));
    });

    test('deny resolves as denied', () async {
      final container = _container();
      final store = _store(container);
      final id = store.requestApproval('post.publish', ActionRisk.sensitive, 'Publish');

      store.deny(id);

      final decision = await store.awaitDecision(id);
      expect(decision.outcome, DecisionOutcome.denied);
      expect(decision.requestId, id);
    });

    test('awaitDecision after resolution returns immediately', () async {
      final container = _container();
      final store = _store(container);
      final id = store.requestApproval('mail.send', ActionRisk.sensitive, 'Send');
      store.approve(id);

      final decision = await store.awaitDecision(id).timeout(
        const Duration(seconds: 1),
        onTimeout: () => throw StateError('awaitDecision hung after resolution'),
      );
      expect(decision.outcome, DecisionOutcome.approved);
    });

    test('double decision is idempotent: deny after approve stays approved',
        () async {
      final container = _container();
      final store = _store(container);
      final id = store.requestApproval('mail.send', ActionRisk.sensitive, 'Send');
      store.approve(id);
      store.deny(id); // no-op, must not throw

      final decision = await store.awaitDecision(id);
      expect(decision.outcome, DecisionOutcome.approved);
    });

    test('a denied request can never be approved later', () async {
      final container = _container();
      final store = _store(container);
      final id = store.requestApproval('mail.send', ActionRisk.sensitive, 'Send');
      store.deny(id);
      store.approve(id); // no-op

      final decision = await store.awaitDecision(id);
      expect(decision.outcome, DecisionOutcome.denied);
    });

    test('unknown ids can never resolve (StateError)', () {
      final container = _container();
      final store = _store(container);
      expect(() => store.approve('appr_999_1'), throwsStateError);
      expect(() => store.deny('appr_999_1'), throwsStateError);
      expect(() => store.grantSpending('appr_999_1', _terms), throwsStateError);
    });
  });

  group('expiry', () {
    DateTime elevenMinutesAgo() =>
        DateTime.now().toUtc().subtract(const Duration(minutes: 11));

    test('approve on an expired request resolves as expired, never approved',
        () async {
      final container = _container();
      final store = _store(container);
      final id = store.requestApproval(
        'mail.send',
        ActionRisk.sensitive,
        'Send',
        requestedAt: elevenMinutesAgo(),
      );

      store.approve(id);

      final decision = await store.awaitDecision(id);
      expect(decision.outcome, DecisionOutcome.expired);
    });

    test('deny on an expired request resolves as expired, not denied',
        () async {
      final container = _container();
      final store = _store(container);
      final id = store.requestApproval(
        'mail.send',
        ActionRisk.sensitive,
        'Send',
        requestedAt: elevenMinutesAgo(),
      );

      store.deny(id);

      final decision = await store.awaitDecision(id);
      expect(decision.outcome, DecisionOutcome.expired);
    });

    test('expireSweep marks expired pending requests as expired', () async {
      final container = _container();
      final store = _store(container);
      final staleId = store.requestApproval(
        'mail.send',
        ActionRisk.sensitive,
        'Send',
        requestedAt: elevenMinutesAgo(),
      );
      final liveId = store.requestApproval('mail.read', ActionRisk.ordinary, 'Read');

      store.expireSweep();

      expect((await store.awaitDecision(staleId)).outcome, DecisionOutcome.expired);
      expect(container.read(approvalStoreProvider), contains(liveId));
      expect(container.read(approvalStoreProvider), isNot(contains(staleId)));
    });
  });

  group('spending: no standing grants (hard law)', () {
    test('grantSpending with byte-exact terms approves', () async {
      final container = _container();
      final store = _store(container);
      final id = store.requestApproval(
        'pay.merchant',
        ActionRisk.spending,
        'Pay Acme ₹499.00',
        terms: _terms,
      );

      const exact = ApprovalTerms('Acme Store', 49900, 'INR', 'quantpay-onetime-card');
      store.grantSpending(id, exact);

      final decision = await store.awaitDecision(id);
      expect(decision.outcome, DecisionOutcome.approved);
    });

    test('approve() routes spending through grantSpending with termsCheck',
        () async {
      final container = _container();
      final store = _store(container);
      final id = store.requestApproval(
        'pay.merchant',
        ActionRisk.spending,
        'Pay Acme ₹499.00',
        terms: _terms,
      );

      store.approve(id, termsCheck: _terms);

      final decision = await store.awaitDecision(id);
      expect(decision.outcome, DecisionOutcome.approved);
    });

    test('terms mismatch: denied AND ApprovalTermsMismatch thrown', () async {
      final container = _container();
      final store = _store(container);
      final id = store.requestApproval(
        'pay.merchant',
        ActionRisk.spending,
        'Pay Acme ₹499.00',
        terms: _terms,
      );
      final future = store.awaitDecision(id);

      const tampered = ApprovalTerms('Acme Store', 49901, 'INR', 'quantpay-onetime-card');
      expect(() => store.grantSpending(id, tampered),
          throwsA(isA<ApprovalTermsMismatch>()));

      // The awaiting agent observes the denial even though the UI threw.
      final decision = await future;
      expect(decision.outcome, DecisionOutcome.denied);
    });

    test('spending approve with no terms check is denied + throws', () async {
      final container = _container();
      final store = _store(container);
      final id = store.requestApproval(
        'pay.merchant',
        ActionRisk.spending,
        'Pay Acme ₹499.00',
        terms: _terms,
      );

      expect(() => store.approve(id), throwsA(isA<ApprovalTermsMismatch>()));
      expect((await store.awaitDecision(id)).outcome, DecisionOutcome.denied);
    });

    test('expired spending request can never be granted, even with exact terms',
        () async {
      final container = _container();
      final store = _store(container);
      final id = store.requestApproval(
        'pay.merchant',
        ActionRisk.spending,
        'Pay Acme ₹499.00',
        terms: _terms,
        requestedAt:
            DateTime.now().toUtc().subtract(const Duration(minutes: 11)),
      );

      store.grantSpending(id, _terms); // no throw: expiry wins

      final decision = await store.awaitDecision(id);
      expect(decision.outcome, DecisionOutcome.expired);
    });

    test('grantSpending on a non-spending request throws (wrong tier)',
        () async {
      final container = _container();
      final store = _store(container);
      final id = store.requestApproval('mail.send', ActionRisk.sensitive, 'Send');

      expect(() => store.grantSpending(id, _terms), throwsStateError);
      // The request is untouched: still pending, still approvable normally.
      store.approve(id);
      expect((await store.awaitDecision(id)).outcome, DecisionOutcome.approved);
    });

    test('a spent grant cannot be replayed: second grant is a no-op',
        () async {
      final container = _container();
      final store = _store(container);
      final id = store.requestApproval(
        'pay.merchant',
        ActionRisk.spending,
        'Pay Acme ₹499.00',
        terms: _terms,
      );
      store.grantSpending(id, _terms);

      // Already resolved → idempotent no-op, still approved exactly once.
      store.grantSpending(id, _terms);
      expect((await store.awaitDecision(id)).outcome, DecisionOutcome.approved);
    });
  });
}
