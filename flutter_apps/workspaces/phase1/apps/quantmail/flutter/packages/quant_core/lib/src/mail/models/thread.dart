// TODO(UNVERIFIED): thread schema — backend TS type verify pending.
// The OpenAPI spec exposes only a SuccessWrapper for thread endpoints; the
// TS `ConversationThread` interface in `apps/quantmail/src/lib/threading.ts`
// ("one row in the inbox: a group of messages plus the summary the row
// shows", `id: string`) was confirmed via code search, but the full field
// list could not be fetched (GitHub API rate-limited: HTTP 429). All fields
// below are defensive and optional except [id]; unknown keys are preserved
// in [raw].

/// Summary of a conversation thread, as shown in the inbox list row.
///
/// A thread groups messages; the row shows the participants, a summary, and
/// the latest activity. Every field except [id] is optional because the
/// backend schema is not yet pinned down.
class ThreadSummary {
  /// Creates a thread summary.
  const ThreadSummary({
    required this.id,
    this.subject,
    this.snippet,
    this.messageCount,
    this.lastMessageDate,
    this.isRead = true,
    this.participantNames = const [],
    this.raw = const {},
  });

  /// Parses a thread summary from backend JSON.
  ///
  /// Only `id` (or `threadId` as a fallback) is required; everything else
  /// degrades to `null`/defaults, and the full payload stays in [raw].
  factory ThreadSummary.fromJson(Map<String, dynamic> json) {
    int? count(dynamic value) {
      if (value is num) return value.toInt();
      return null;
    }

    DateTime? date(dynamic value) =>
        value is String ? DateTime.tryParse(value) : null;

    List<String> participants(dynamic value) {
      if (value is List) {
        return value
            .map((e) => e is Map<String, dynamic>
                ? (e['name'] as String? ?? e['email'] as String? ?? '')
                : e.toString())
            .where((e) => e.isNotEmpty)
            .toList();
      }
      return const [];
    }

    return ThreadSummary(
      id: (json['id'] as String?) ?? json['threadId'] as String? ?? '',
      subject: json['subject'] as String?,
      snippet: json['snippet'] as String?,
      messageCount: count(json['messageCount'] ?? json['count']),
      lastMessageDate: date(json['lastMessageDate'] ?? json['lastDate']),
      isRead: json['isRead'] == true || json['isRead'] == null,
      participantNames: participants(json['participants']),
      raw: json,
    );
  }

  /// Stable backend identifier for the thread.
  final String id;

  /// Thread subject, if the backend provided one.
  final String? subject;

  /// Latest-message preview text for the inbox row.
  final String? snippet;

  /// Number of messages in the thread, when known.
  final int? messageCount;

  /// Timestamp of the latest message, `null` when missing or unparseable.
  final DateTime? lastMessageDate;

  /// Whether every message in the thread is read.
  final bool isRead;

  /// Participant display names/emails for the inbox row, when provided.
  final List<String> participantNames;

  /// The original JSON payload, for forward-compatible access to new keys.
  final Map<String, dynamic> raw;

  /// Serializes the known fields back to JSON.
  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        if (subject != null) 'subject': subject,
        if (snippet != null) 'snippet': snippet,
        if (messageCount != null) 'messageCount': messageCount,
        if (lastMessageDate != null)
          'lastMessageDate': lastMessageDate!.toIso8601String(),
        'isRead': isRead,
        'participants': participantNames,
      };

  @override
  String toString() =>
      'ThreadSummary(id: $id, messageCount: $messageCount, isRead: $isRead)';
}
