// W2 Shift 1: approval taxonomy tests (classification, terms, expiry, law).
//
// Imports `src/` directly: the sentinel barrel is the coordinator's file,
// so these tests must not depend on `quantai_core.dart` exports.

import 'package:flutter_test/flutter_test.dart';
import 'package:quantai_core/src/sentinel/approval_taxonomy.dart';

void main() {
  group('classifyAction', () {
    test('read/search/draft/list class actions are ordinary', () {
      expect(classifyAction('mail.search'), ActionRisk.ordinary);
      expect(classifyAction('mail.read'), ActionRisk.ordinary);
      expect(classifyAction('draft.create'), ActionRisk.ordinary);
      expect(classifyAction('thread.list'), ActionRisk.ordinary);
      expect(classifyAction('settings.view'), ActionRisk.ordinary);
    });

    test('send/post/delete/publish/connect are sensitive', () {
      expect(classifyAction('mail.send'), ActionRisk.sensitive);
      expect(classifyAction('post.publish'), ActionRisk.sensitive);
      expect(classifyAction('calendar.delete'), ActionRisk.sensitive);
      expect(classifyAction('account.connect'), ActionRisk.sensitive);
      expect(classifyAction('note.share'), ActionRisk.sensitive);
      expect(classifyAction('token.revoke'), ActionRisk.sensitive);
    });

    test('money movement is spending', () {
      expect(classifyAction('pay.merchant'), ActionRisk.spending);
      expect(classifyAction('wallet.transfer'), ActionRisk.spending);
      expect(classifyAction('subscription.purchase'), ActionRisk.spending);
      expect(classifyAction('cart.checkout'), ActionRisk.spending);
      expect(classifyAction('credits.topup'), ActionRisk.spending);
    });

    test('spending beats sensitive: send_payment is spending, not sensitive',
        () {
      expect(classifyAction('send_payment'), ActionRisk.spending);
      expect(classifyAction('post_purchase'), ActionRisk.spending);
    });

    test('no substring false positives: display.settings stays ordinary', () {
      // 'display' contains the substring 'pay' — tokenization must not match.
      expect(classifyAction('display.settings'), ActionRisk.ordinary);
      expect(classifyAction('sender.info'), ActionRisk.ordinary);
    });
  });

  group('ApprovalTerms.exactMatch', () {
    const terms = ApprovalTerms('Acme Store', 49900, 'INR', 'quantpay-onetime-card');

    test('byte-equal terms match', () {
      const same = ApprovalTerms('Acme Store', 49900, 'INR', 'quantpay-onetime-card');
      expect(terms.exactMatch(same), isTrue);
      expect(terms == same, isTrue);
    });

    test('different amount does not match (no partial grants)', () {
      const other = ApprovalTerms('Acme Store', 49901, 'INR', 'quantpay-onetime-card');
      expect(terms.exactMatch(other), isFalse);
    });

    test('different merchant / currency / method do not match', () {
      expect(
        terms.exactMatch(
          const ApprovalTerms('Other Store', 49900, 'INR', 'quantpay-onetime-card'),
        ),
        isFalse,
      );
      expect(
        terms.exactMatch(
          const ApprovalTerms('Acme Store', 49900, 'USD', 'quantpay-onetime-card'),
        ),
        isFalse,
      );
      expect(
        terms.exactMatch(
          const ApprovalTerms('Acme Store', 49900, 'INR', 'saved-card-4242'),
        ),
        isFalse,
      );
    });
  });

  group('ApprovalRequest', () {
    test('fresh() defaults to a 10-minute expiry window', () {
      final request = ApprovalRequest.fresh(
        'appr_1_2',
        'mail.send',
        ActionRisk.sensitive,
        'Send email',
      );
      expect(
        request.expiresAt.difference(request.requestedAt),
        kApprovalTtl,
      );
      expect(kApprovalTtl, const Duration(minutes: 10));
      expect(request.isExpired(), isFalse);
    });

    test('isExpired is true after the window, false before', () {
      final now = DateTime.now().toUtc();
      final live = ApprovalRequest.fresh(
        'appr_1_2',
        'mail.send',
        ActionRisk.sensitive,
        'Send email',
        requestedAt: now.subtract(const Duration(minutes: 9)),
      );
      expect(live.isExpired(), isFalse);

      final stale = ApprovalRequest.fresh(
        'appr_1_3',
        'mail.send',
        ActionRisk.sensitive,
        'Send email',
        requestedAt: now.subtract(const Duration(minutes: 11)),
      );
      expect(stale.isExpired(), isTrue);
    });

    test('spending without terms is impossible (constructor law)', () {
      final now = DateTime.now().toUtc();
      expect(
        () => ApprovalRequest(
          'appr_1_2',
          'pay.merchant',
          ActionRisk.spending,
          'Pay',
          null,
          now,
          now.add(kApprovalTtl),
        ),
        throwsArgumentError,
      );
    });

    test('non-spending requests must not carry terms', () {
      final now = DateTime.now().toUtc();
      const terms = ApprovalTerms('Acme', 100, 'INR', 'quantpay-onetime-card');
      expect(
        () => ApprovalRequest(
          'appr_1_2',
          'mail.send',
          ActionRisk.sensitive,
          'Send',
          terms,
          now,
          now.add(kApprovalTtl),
        ),
        throwsArgumentError,
      );
    });
  });
}
