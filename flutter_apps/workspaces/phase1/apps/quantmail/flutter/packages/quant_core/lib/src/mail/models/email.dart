/// Mail domain models: [Email], [EmailAddress], and [FolderType].
///
/// Shapes mirror the repaired OpenAPI spec (`Email` schema) and the
/// backend TS type (`apps/quantmail/src/types/index.ts`):
///
/// ```ts
/// export interface EmailAddress {
///   email: string;
///   name?: string;
/// }
/// ```

library;

/// Wire-level folder identifiers used by the mail API.
///
/// Values grounded in the OpenAPI spec (folder query parameter enum).
enum FolderType {
  inbox,
  sent,
  drafts,
  trash,
  spam,
  archive,
  starred,
  snoozed,
}

/// Wire name mapping for [FolderType].
///
/// The mail API uses UPPER_CASE folder identifiers
/// (`INBOX`, `SENT`, `DRAFTS`, `TRASH`, `SPAM`, `ARCHIVE`, `STARRED`,
/// `SNOOZED`).
extension FolderTypeWire on FolderType {
  /// The exact string the backend expects on the wire.
  String get wireName {
    switch (this) {
      case FolderType.inbox:
        return 'INBOX';
      case FolderType.sent:
        return 'SENT';
      case FolderType.drafts:
        return 'DRAFTS';
      case FolderType.trash:
        return 'TRASH';
      case FolderType.spam:
        return 'SPAM';
      case FolderType.archive:
        return 'ARCHIVE';
      case FolderType.starred:
        return 'STARRED';
      case FolderType.snoozed:
        return 'SNOOZED';
    }
  }
}

/// A single email participant (sender / recipient / cc).
///
/// Grounded in the backend TS type: `email` is required, `name` optional.
/// Parsing is defensive: a plain string is accepted as `email`, and any
/// unknown keys are preserved in [raw].
class EmailAddress {
  /// Creates an email address.
  const EmailAddress({
    required this.email,
    this.name,
    this.raw = const {},
  });

  /// Parses an address from JSON.
  ///
  /// Accepts both `{"email": ..., "name": ...}` objects and bare strings.
  factory EmailAddress.fromJson(dynamic json) {
    if (json is String) {
      return EmailAddress(email: json);
    }
    if (json is Map<String, dynamic>) {
      return EmailAddress(
        email: json['email'] as String? ?? '',
        name: json['name'] as String?,
        raw: json,
      );
    }
    throw FormatException(
        'EmailAddress.fromJson: expected String or Map, got $json');
  }

  /// The raw email address. May be empty when the backend sends an object
  /// without an `email` key — prefer [isValid] checks at the call site.
  final String email;

  /// Display name, if the backend provided one.
  final String? name;

  /// The original JSON payload, for forward-compatible access to new keys.
  final Map<String, dynamic> raw;

  /// Whether this address carries a usable email value.
  bool get isValid => email.isNotEmpty;

  /// Human-friendly label: name if present, otherwise the email.
  String get display => name?.isNotEmpty == true ? name! : email;

  /// Serializes back to the wire shape.
  Map<String, dynamic> toJson() => <String, dynamic>{
        'email': email,
        if (name != null) 'name': name,
      };

  @override
  String toString() => 'EmailAddress(email: $email, name: $name)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is EmailAddress &&
          runtimeType == other.runtimeType &&
          email == other.email &&
          name == other.name;

  @override
  int get hashCode => Object.hash(email, name);
}

/// A single mail message as returned by the mail API.
///
/// Fields follow the repaired OpenAPI `Email` schema. Nullable fields use
/// `tryParse`-style defensive parsing so a malformed backend response
/// degrades instead of throwing.
class Email {
  /// Creates an email model.
  const Email({
    required this.id,
    this.threadId,
    this.subject,
    this.snippet,
    required this.from,
    this.to = const [],
    this.cc = const [],
    this.date,
    this.labels = const [],
    this.isRead = false,
    this.isStarred = false,
    this.hasAttachments = false,
    this.folderId,
  });

  /// Parses an email from the API response JSON.
  factory Email.fromJson(Map<String, dynamic> json) {
    List<EmailAddress> addresses(dynamic value) {
      if (value is List) {
        return value.map(EmailAddress.fromJson).toList();
      }
      return const [];
    }

    List<String> labels(dynamic value) {
      if (value is List) {
        return value.map((e) => e.toString()).toList();
      }
      return const [];
    }

    return Email(
      id: json['id'] as String? ?? '',
      threadId: json['threadId'] as String?,
      subject: json['subject'] as String?,
      snippet: json['snippet'] as String?,
      from: json.containsKey('from')
          ? EmailAddress.fromJson(json['from'])
          : const EmailAddress(email: ''),
      to: addresses(json['to']),
      cc: addresses(json['cc']),
      date: json['date'] is String
          ? DateTime.tryParse(json['date'] as String)
          : null,
      labels: labels(json['labels']),
      isRead: json['isRead'] == true,
      isStarred: json['isStarred'] == true,
      hasAttachments: json['hasAttachments'] == true,
      folderId: json['folderId'] as String?,
    );
  }

  /// Stable backend identifier.
  final String id;

  /// Conversation thread this message belongs to, when threading applies.
  final String? threadId;

  /// Decoded subject line.
  final String? subject;

  /// Short preview text for list rows.
  final String? snippet;

  /// Sender address.
  final EmailAddress from;

  /// Recipients.
  final List<EmailAddress> to;

  /// Carbon-copy recipients.
  final List<EmailAddress> cc;

  /// Sent/received timestamp, `null` when the wire value is missing or
  /// unparseable.
  final DateTime? date;

  /// Gmail-style label ids (e.g. `INBOX`, `UNREAD`).
  final List<String> labels;

  /// Whether the message has been read.
  final bool isRead;

  /// Whether the message is starred.
  final bool isStarred;

  /// Whether the message carries attachments.
  final bool hasAttachments;

  /// Owning folder identifier.
  final String? folderId;

  /// Serializes back to the wire shape.
  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        if (threadId != null) 'threadId': threadId,
        if (subject != null) 'subject': subject,
        if (snippet != null) 'snippet': snippet,
        'from': from.toJson(),
        'to': to.map((a) => a.toJson()).toList(),
        'cc': cc.map((a) => a.toJson()).toList(),
        if (date != null) 'date': date!.toIso8601String(),
        'labels': labels,
        'isRead': isRead,
        'isStarred': isStarred,
        'hasAttachments': hasAttachments,
        if (folderId != null) 'folderId': folderId,
      };

  @override
  String toString() => 'Email(id: $id, subject: $subject)';
}
