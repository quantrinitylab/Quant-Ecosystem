// ============================================================================
// quant_core - compose request model tests (M7: compose core, W2)
//
// Tests for [ComposeRequest]: toJson key presence, idempotencyKey
// uniqueness/default shape, reply flags, recipient validation helpers.
// ============================================================================

import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/src/mail/compose/compose_request.dart';
import 'package:quant_core/src/mail/models/email.dart';

/// RFC 4122 uuid v4 shape.
final RegExp _uuidV4 = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
);

ComposeRequest _request({
  List<EmailAddress>? to,
  String? subject,
  String? bodyText,
  String? bodyHtml,
  String? threadId,
  String? inReplyTo,
  List<String>? attachmentPaths,
  String? idempotencyKey,
}) =>
    ComposeRequest(
      to: to ?? const [EmailAddress(email: 'bob@example.com', name: 'Bob')],
      subject: subject ?? 'Hello',
      bodyText: bodyText ?? 'Body',
      bodyHtml: bodyHtml,
      threadId: threadId,
      inReplyTo: inReplyTo,
      attachmentPaths: attachmentPaths,
      idempotencyKey: idempotencyKey,
    );

void main() {
  group('ComposeRequest', () {
    test('toJson carries every wire key', () {
      final json = _request().toJson();

      expect(json['to'], [
        {'email': 'bob@example.com', 'name': 'Bob'}
      ]);
      expect(json['cc'], isEmpty);
      expect(json['bcc'], isEmpty);
      expect(json['subject'], 'Hello');
      expect(json['bodyText'], 'Body');
      expect(json['idempotencyKey'], isA<String>());
      // Optional keys are omitted when unset.
      expect(json.containsKey('bodyHtml'), isFalse);
      expect(json.containsKey('threadId'), isFalse);
      expect(json.containsKey('inReplyTo'), isFalse);
      expect(json.containsKey('attachments'), isFalse);
    });

    test('toJson includes optional keys when set', () {
      final json = _request(
        bodyHtml: '<p>Hi</p>',
        threadId: 't-1',
        inReplyTo: 'm-9',
        attachmentPaths: const ['/tmp/photo.png'],
      ).toJson();

      expect(json['bodyHtml'], '<p>Hi</p>');
      expect(json['threadId'], 't-1');
      expect(json['inReplyTo'], 'm-9');
      expect(json['attachments'], ['/tmp/photo.png']);
    });

    test('idempotencyKey defaults to a unique RFC 4122 uuid v4 per instance',
        () {
      final a = _request().idempotencyKey;
      final b = _request().idempotencyKey;

      expect(_uuidV4.hasMatch(a), isTrue, reason: 'not uuid v4: $a');
      expect(_uuidV4.hasMatch(b), isTrue, reason: 'not uuid v4: $b');
      expect(a, isNot(equals(b)),
          reason: 'every instance mints a fresh key (stable per job, '
              'unique per send)');
    });

    test('explicit idempotencyKey is honored (stable key per send job)', () {
      final json = _request(idempotencyKey: 'job-42').toJson();
      expect(json['idempotencyKey'], 'job-42');
    });

    test('isReply reflects thread linkage', () {
      expect(_request().isReply, isFalse);
      expect(_request(threadId: 't-1').isReply, isTrue);
    });

    test('validRecipients filters empty/invalid addresses', () {
      final request = ComposeRequest(
        to: const [EmailAddress(email: '')],
        cc: const [EmailAddress(email: 'cc@example.com')],
      );
      expect(request.validRecipients.map((a) => a.email),
          ['cc@example.com']);
    });

    test('empty recipients: validRecipients is empty (service rejects)', () {
      expect(ComposeRequest().validRecipients, isEmpty);
    });

    test('toString: diagnostic, truncates long subjects', () {
      final short = _request(subject: 'Hi');
      expect(short.toString(), contains('to=1'));
      expect(short.toString(), contains('reply=false'));
      final long = _request(
          subject: 'This subject is definitely longer than 24 chars');
      expect(long.toString(), contains('…'),
          reason: 'subjects over 24 chars are truncated in diagnostics');
      final reply = _request(threadId: 't-1');
      expect(reply.toString(), contains('reply=true'));
    });
  });
}
