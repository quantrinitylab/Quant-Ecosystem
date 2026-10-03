// ============================================================================
// quant_core - compose request model (M7: compose core, W2)
//
// [ComposeRequest] is the client-side unit of a send: recipients, subject,
// bodies, reply linkage, local attachment paths, and the idempotency key
// that makes re-sends safe (Superhuman steal: stable key per send job —
// [ComposeService] writes it into the outbox op as `send:<key>`, so a
// double-tap or a process-restart retry can never double-enqueue).
//
// Payload honesty: [toJson] carries a TODO(UNVERIFIED) marking the wire
// field mapping provisional — see [ComposeApi] for the reason.
import '../models/email.dart';
import '../outbox/outbox_op.dart';

/// One sendable message, composed client-side.
///
/// Validation ([ComposeService.send]) requires at least one valid
/// recipient; empty subject is allowed (many real clients send subjectless
/// mail).
class ComposeRequest {
  /// Creates a compose request. [idempotencyKey] defaults to a fresh
  /// RFC 4122 uuid v4 (reuses the outbox helper so no new dependency is
  /// needed); address lists default to empty.
  ComposeRequest({
    List<EmailAddress>? to,
    List<EmailAddress>? cc,
    List<EmailAddress>? bcc,
    this.subject = '',
    this.bodyText = '',
    this.bodyHtml,
    this.threadId,
    this.inReplyTo,
    List<String>? attachmentPaths,
    String? idempotencyKey,
  })  : to = List<EmailAddress>.unmodifiable(to ?? const <EmailAddress>[]),
        cc = List<EmailAddress>.unmodifiable(cc ?? const <EmailAddress>[]),
        bcc = List<EmailAddress>.unmodifiable(bcc ?? const <EmailAddress>[]),
        attachmentPaths =
            List<String>.unmodifiable(attachmentPaths ?? const <String>[]),
        idempotencyKey = idempotencyKey ?? newOutboxOpId();

  /// Primary recipients.
  final List<EmailAddress> to;

  /// Carbon-copy recipients.
  final List<EmailAddress> cc;

  /// Blind carbon-copy recipients.
  final List<EmailAddress> bcc;

  /// Subject line. May be empty (subjectless mail is legal).
  final String subject;

  /// Plain-text body.
  final String bodyText;

  /// HTML body, when the composer produced rich text. `null` when the
  /// message is plain-text only.
  final String? bodyHtml;

  /// Thread this message replies into (`null` for a new thread).
  final String? threadId;

  /// Message id this message is a reply to (`null` for a new thread).
  final String? inReplyTo;

  /// Device-local paths of attachments to upload at send time (the UI
  /// shift owns the upload path; the core just carries the list).
  final List<String> attachmentPaths;

  /// Stable per-send-job dedupe key (uuid v4 by default).
  final String idempotencyKey;

  /// All recipient addresses with a usable email value.
  List<EmailAddress> get validRecipients =>
      [...to, ...cc, ...bcc].where((a) => a.isValid).toList(growable: false);

  /// `true` when this is a reply into an existing thread.
  bool get isReply => threadId != null && threadId!.isNotEmpty;

  /// Serializes for `POST /emails/compose`.
  ///
  /// // TODO(UNVERIFIED): the wire field mapping below is PROVISIONAL. The
  /// repaired spec's `composeSchema` (L24509) is AI-flavored
  /// (`instructions` required; `tone`/`length`/`recipient`/`subject`/
  /// `intent` optional) — it reads like a repair artifact for the compose
  /// endpoint, NOT a verified email-send payload. Do NOT treat these wire
  /// names as contract until the real compose zod schema is verified
  /// against backend source. This TODO marks the exact seam to re-pin.
  Map<String, dynamic> toJson() => <String, dynamic>{
        'to': [
          for (final a in to) {'email': a.email, if (a.name != null) 'name': a.name},
        ],
        'cc': [
          for (final a in cc) {'email': a.email, if (a.name != null) 'name': a.name},
        ],
        'bcc': [
          for (final a in bcc) {'email': a.email, if (a.name != null) 'name': a.name},
        ],
        'subject': subject,
        'bodyText': bodyText,
        if (bodyHtml != null) 'bodyHtml': bodyHtml,
        if (threadId != null && threadId!.isNotEmpty) 'threadId': threadId,
        if (inReplyTo != null && inReplyTo!.isNotEmpty) 'inReplyTo': inReplyTo,
        if (attachmentPaths.isNotEmpty)
          'attachments': List<String>.unmodifiable(attachmentPaths),
        'idempotencyKey': idempotencyKey,
      };

  @override
  String toString() =>
      'ComposeRequest(to=${to.length}, cc=${cc.length}, bcc=${bcc.length}, '
      'subject=${subject.length > 24 ? '${subject.substring(0, 24)}…' : subject}, '
      'reply=$isReply, key=${idempotencyKey.substring(0, 8)}…)';
}
