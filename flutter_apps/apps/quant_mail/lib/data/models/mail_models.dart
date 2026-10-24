// Wire models for the Quant Mail API (see build/contracts.md). Parsing is
// defensive on purpose: the live container is older than the repo, so every
// optional field may be missing.

/// Mail views that `GET /emails` can serve.
enum MailFolderKind {
  inbox('Inbox', null),
  starred('Starred', 'STARRED'),
  snoozed('Snoozed', 'SNOOZED'),
  sent('Sent', 'SENT'),
  drafts('Drafts', 'DRAFTS'),
  scheduled('Scheduled', 'SCHEDULED'),
  archive('Archive', 'ARCHIVE'),
  spam('Spam', 'SPAM'),
  trash('Trash', 'TRASH'),
  custom('Folder', null);

  const MailFolderKind(this.title, this.apiType);

  final String title;

  /// Value of the `folderType` query parameter; null = Inbox view.
  final String? apiType;
}

/// One list view: a system view, or a custom folder by id.
class MailView {
  const MailView(this.kind, {this.folderId});

  static const MailView inbox = MailView(MailFolderKind.inbox);
  static const MailView starred = MailView(MailFolderKind.starred);
  static const MailView snoozed = MailView(MailFolderKind.snoozed);
  static const MailView sent = MailView(MailFolderKind.sent);
  static const MailView drafts = MailView(MailFolderKind.drafts);
  static const MailView scheduled = MailView(MailFolderKind.scheduled);
  static const MailView archive = MailView(MailFolderKind.archive);
  static const MailView spam = MailView(MailFolderKind.spam);
  static const MailView trash = MailView(MailFolderKind.trash);

  final MailFolderKind kind;
  final String? folderId;

  /// Query parameters for `GET /emails`.
  Map<String, String> get query {
    if (folderId != null) return <String, String>{'folderId': folderId!};
    final String? type = kind.apiType;
    return type == null ? const <String, String>{} : <String, String>{'folderType': type};
  }

  @override
  bool operator ==(Object other) =>
      other is MailView && other.kind == kind && other.folderId == folderId;

  @override
  int get hashCode => Object.hash(kind, folderId);

  @override
  String toString() => 'MailView($kind${folderId == null ? '' : ', $folderId'})';
}

class MailAddress {
  const MailAddress({required this.email, this.name = ''});

  final String email;
  final String name;

  /// Name to show: the display name, else the address.
  String get displayName => name.trim().isNotEmpty ? name.trim() : email;

  factory MailAddress.fromJson(Object? json, {String fallbackEmail = ''}) {
    if (json is Map) {
      final Object? email = json['email'];
      final Object? name = json['name'];
      return MailAddress(
        email: email is String ? email : fallbackEmail,
        name: name is String ? name : '',
      );
    }
    return MailAddress(email: fallbackEmail);
  }
}

class MailAttachmentInfo {
  const MailAttachmentInfo({
    required this.id,
    required this.filename,
    this.mimeType = '',
    this.size = 0,
    this.url = '',
    this.isInline = false,
  });

  final String id;
  final String filename;
  final String mimeType;
  final int size;
  final String url;
  final bool isInline;

  /// Ids starting with `meta_` only describe a file; the backend has no bytes
  /// for them, and an empty url means nothing to fetch either.
  bool get canDownload => !id.startsWith('meta_') && url.isNotEmpty;

  factory MailAttachmentInfo.fromJson(Map<dynamic, dynamic> json) {
    return MailAttachmentInfo(
      id: _str(json['id']),
      filename: _str(json['filename'], 'attachment'),
      mimeType: _str(json['mimeType']),
      size: json['size'] is num ? (json['size'] as num).toInt() : 0,
      url: _str(json['url']),
      isInline: json['isInline'] == true,
    );
  }
}

class MailMessage {
  const MailMessage({
    required this.id,
    required this.from,
    required this.subject,
    required this.createdAt,
    this.threadId,
    this.folderId,
    this.to = const <MailAddress>[],
    this.cc = const <MailAddress>[],
    this.snippet,
    this.bodyPlain = '',
    this.bodyHtml = '',
    this.isRead = false,
    this.isStarred = false,
    this.isPinned = false,
    this.isDraft = false,
    this.isArchived = false,
    this.isTrash = false,
    this.isSpam = false,
    this.hasAttachments = false,
    this.attachments = const <MailAttachmentInfo>[],
    this.labelIds = const <String>[],
    this.category = 'primary',
    this.receivedAt,
    this.version = 0,
  });

  final String id;
  final String? threadId;
  final String? folderId;
  final MailAddress from;
  final List<MailAddress> to;
  final List<MailAddress> cc;
  final String subject;
  final String? snippet;
  final String bodyPlain;
  final String bodyHtml;
  final bool isRead;
  final bool isStarred;
  final bool isPinned;
  final bool isDraft;
  final bool isArchived;
  final bool isTrash;
  final bool isSpam;
  final bool hasAttachments;
  final List<MailAttachmentInfo> attachments;

  /// Label ids (join with `GET /labels` for names).
  final List<String> labelIds;
  final String category;
  final DateTime? receivedAt;
  final DateTime createdAt;
  final int version;

  /// Date to sort and group by (drafts have no receivedAt).
  DateTime get sortDate => receivedAt ?? createdAt;

  /// Row preview: the snippet, else the first 120 characters of the body.
  String get previewText {
    final String s = (snippet ?? '').trim();
    if (s.isNotEmpty) return s;
    final String plain = bodyPlain.replaceAll(RegExp(r'\s+'), ' ').trim();
    return plain.length <= 120 ? plain : plain.substring(0, 120);
  }

  MailMessage copyWith({bool? isRead, bool? isStarred, bool? isArchived, bool? isTrash}) {
    return MailMessage(
      id: id,
      threadId: threadId,
      folderId: folderId,
      from: from,
      to: to,
      cc: cc,
      subject: subject,
      snippet: snippet,
      bodyPlain: bodyPlain,
      bodyHtml: bodyHtml,
      isRead: isRead ?? this.isRead,
      isStarred: isStarred ?? this.isStarred,
      isPinned: isPinned,
      isDraft: isDraft,
      isArchived: isArchived ?? this.isArchived,
      isTrash: isTrash ?? this.isTrash,
      isSpam: isSpam,
      hasAttachments: hasAttachments,
      attachments: attachments,
      labelIds: labelIds,
      category: category,
      receivedAt: receivedAt,
      createdAt: createdAt,
      version: version,
    );
  }

  factory MailMessage.fromJson(Map<dynamic, dynamic> json) {
    final String fromAddress = _str(json['fromAddress']);
    final List<MailAddress> to = _addresses(json['to'], json['toAddresses']);
    final List<MailAddress> cc = _addresses(json['cc'], json['ccAddresses']);
    final List<MailAttachmentInfo> attachments = json['attachments'] is List
        ? (json['attachments'] as List)
            .whereType<Map<dynamic, dynamic>>()
            .map(MailAttachmentInfo.fromJson)
            .toList()
        : const <MailAttachmentInfo>[];
    final MailAddress from = json['from'] is Map
        ? MailAddress.fromJson(json['from'], fallbackEmail: fromAddress)
        : MailAddress(email: fromAddress, name: _str(json['fromName']));
    final String bodyPlain = _str(json['bodyPlain'], _str(json['bodyText']));
    return MailMessage(
      id: _str(json['id']),
      threadId: json['threadId'] is String ? json['threadId'] as String : null,
      folderId: json['folderId'] is String ? json['folderId'] as String : null,
      from: from,
      to: to,
      cc: cc,
      subject: _str(json['subject']),
      snippet: json['snippet'] is String ? json['snippet'] as String : null,
      bodyPlain: bodyPlain,
      bodyHtml: _str(json['bodyHtml']),
      isRead: json['isRead'] == true,
      isStarred: json['isStarred'] == true,
      isPinned: json['isPinned'] == true,
      isDraft: json['isDraft'] == true,
      isArchived: json['isArchived'] == true,
      isTrash: json['isTrash'] == true,
      isSpam: json['isSpam'] == true,
      hasAttachments: json['hasAttachments'] == true || attachments.isNotEmpty,
      attachments: attachments,
      labelIds: json['labels'] is List
          ? (json['labels'] as List).whereType<String>().toList()
          : const <String>[],
      category: _str(json['category'], 'primary'),
      receivedAt: _date(json['receivedAt']),
      createdAt: _date(json['createdAt']) ?? DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
      version: json['version'] is num ? (json['version'] as num).toInt() : 0,
    );
  }
}

/// One page of `GET /emails`.
class MailPage {
  const MailPage({
    required this.items,
    this.nextCursor,
    this.page = 1,
    this.totalPages,
    this.totalCount,
    this.unreadCount,
  });

  final List<MailMessage> items;

  /// Null when there is no further page.
  final String? nextCursor;
  final int page;
  final int? totalPages;

  /// Whole-view numbers; null when the server did not send them.
  final int? totalCount;
  final int? unreadCount;

  bool get hasMore => nextCursor != null;
}

/// Counts of one view, from `GET /emails?...&pageSize=1`.
class MailCounts {
  const MailCounts({this.totalCount, this.unreadCount});

  final int? totalCount;
  final int? unreadCount;
}

/// Result of `GET /threads/:id`.
class MailConversation {
  const MailConversation({
    required this.id,
    required this.subject,
    required this.messages,
    this.isRead = false,
    this.isStarred = false,
    this.isMuted = false,
  });

  final String id;
  final String subject;

  /// Oldest first.
  final List<MailMessage> messages;
  final bool isRead;
  final bool isStarred;
  final bool isMuted;

  factory MailConversation.fromJson(Map<dynamic, dynamic> json) {
    final Object? raw = json['messages'] is List ? json['messages'] : json['emails'];
    final List<MailMessage> messages = raw is List
        ? raw.whereType<Map<dynamic, dynamic>>().map(MailMessage.fromJson).toList()
        : const <MailMessage>[];
    return MailConversation(
      id: _str(json['id']),
      subject: _str(json['subject'], messages.isEmpty ? '' : messages.first.subject),
      messages: messages,
      isRead: json['isRead'] == true,
      isStarred: json['isStarred'] == true,
      isMuted: json['isMuted'] == true,
    );
  }
}

/// Actions of `POST /emails/batch`.
enum MailBatchAction {
  markRead('markRead'),
  markUnread('markUnread'),
  archive('archive'),
  delete('delete'),
  star('star'),
  unstar('unstar');

  const MailBatchAction(this.wire);

  final String wire;
}

class MailFolder {
  const MailFolder({required this.id, required this.name, required this.type, this.color});

  final String id;
  final String name;

  /// INBOX, SENT, DRAFTS, SPAM, TRASH, ARCHIVE or CUSTOM.
  final String type;
  final String? color;

  factory MailFolder.fromJson(Map<dynamic, dynamic> json) {
    return MailFolder(
      id: _str(json['id']),
      name: _str(json['name']),
      type: _str(json['type'], 'CUSTOM').toUpperCase(),
      color: json['color'] is String ? json['color'] as String : null,
    );
  }
}

class MailLabel {
  const MailLabel({required this.id, required this.name, this.color});

  final String id;
  final String name;
  final String? color;

  factory MailLabel.fromJson(Map<dynamic, dynamic> json) {
    return MailLabel(
      id: _str(json['id']),
      name: _str(json['name']),
      color: json['color'] is String ? json['color'] as String : null,
    );
  }
}

String _str(Object? v, [String fallback = '']) => v is String ? v : fallback;

DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v) : null;

List<MailAddress> _addresses(Object? objects, Object? plain) {
  if (objects is List && objects.isNotEmpty) {
    return objects.map((Object? e) => MailAddress.fromJson(e)).where((MailAddress a) => a.email.isNotEmpty).toList();
  }
  if (plain is List) {
    return plain.whereType<String>().map((String e) => MailAddress(email: e)).toList();
  }
  return const <MailAddress>[];
}
