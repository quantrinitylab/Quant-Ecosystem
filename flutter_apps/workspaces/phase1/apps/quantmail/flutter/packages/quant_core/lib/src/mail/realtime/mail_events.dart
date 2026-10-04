// ============================================================================
// quant_core - realtime mail event payload models (M6 prep, W4)
// ============================================================================
//
// Data-only hint payloads published by the staged backend P0-3 ws-channels
// plugin (`phase2/repo-staging/ws-channels/ws-channels.ts`) on the per-user
// channel `mail:{userId}`. Shapes mirror the STAGED ZOD SCHEMAS
// (`mailNewSchema` / `mailUpdatedSchema` / `threadUpdatedSchema`), which
// SUPERSEDE the older `NOTES.md` §3 shapes (see the reconciliation note in
// `NOTES.md` §11). `fromJson` is defensive: staged-primary keys are tried
// first, then the NOTES-era aliases (`type` / `emailId` / `changed` / the
// `from: {name, address}` object / `snippet` / `labels`), and anything
// unparsed is kept in [MailEvent.raw].
//
// These events are HINTS, never full bodies — on receipt the client merges
// the hint and, on any sequence gap, calls `sync_engine.requestResync()`
// (`GET /emails/changes?since=`), which is the source of truth.
//
// TODO(UNVERIFIED): staged P0-3, re-verify on merge. In particular:
//   - discriminator key: staged zod uses `channel` ('mail.new' etc.);
//     NOTES §3 used `type` — both accepted here, merge must lock one.
//   - `mail.updated` has NO `tombstone`/`updatedAt`/delta values in the
//     staged zod (NOTES §3 did); parsed defensively where present.
//   - `mail.new` has NO `snippet`/`labels`/`from` object in the staged zod
//     (it has `sender` + `subjectPreview`); parsed defensively where present.
//   - `thread.updated` has NO `emailIds`/`lastMessageAt`/`snippet`/`labels`
//     in the staged zod (it has `lastMessageId` + `unreadCount`); parsed
//     defensively where present.
//   - `thread.updated` gap has NO `/threads/changes` equivalent — gap on
//     this channel forces a full thread refetch (NOTES §11.5).
//   - 30s server-held undo is REAL (NOTES §11.1): `mail.new` publishes only
//     after hold-expiry; undo inside the window produces NO event — the
//     client must treat HTTP 200 on `POST /emails/send` as ACCEPTED, not sent.

library;

/// Base of the sealed realtime mail-event union.
sealed class MailEvent {
  const MailEvent();

  /// Event discriminator as received on the wire (`channel` in the staged
  /// zod schemas, `type` in NOTES §3).
  String get type;

  /// Per-channel monotonic sequence number — the gap-detection cursor.
  int get sequence;

  /// The untouched wire map (forwards-compat + debugging).
  Map<String, dynamic> get raw;
}

/// Reads the discriminator from `channel` (staged) or `type` (NOTES-era).
String _discriminator(Map<String, dynamic> json, String fallback) {
  final v = json['channel'];
  if (v is String && v.isNotEmpty) return v;
  final t = json['type'];
  if (t is String && t.isNotEmpty) return t;
  return fallback;
}

String? _str(Map<String, dynamic> json, String key) {
  final v = json[key];
  return v is String ? v : null;
}

String _reqStr(
  Map<String, dynamic> json,
  String key, {
  List<String> aliases = const [],
  required String event,
}) {
  final v = json[key];
  if (v is String && v.isNotEmpty) return v;
  for (final alias in aliases) {
    final a = json[alias];
    if (a is String && a.isNotEmpty) return a;
  }
  throw FormatException('MailEvent [$event]: "$key" is required, got: $v');
}

int _reqInt(Map<String, dynamic> json, String key, {required String event}) {
  final v = json[key];
  if (v is int) return v;
  if (v is num) return v.toInt();
  throw FormatException('MailEvent [$event]: "$key" must be an int, got: $v');
}

int _optInt(Map<String, dynamic> json, String key, {int fallback = 0}) {
  final v = json[key];
  if (v is int) return v;
  if (v is num) return v.toInt();
  return fallback;
}

bool _boolish(dynamic v) => v == true || v == 1 || v == 'true';

DateTime? _dateTime(dynamic v) {
  if (v is String && v.isNotEmpty) return DateTime.tryParse(v);
  return null;
}

List<String> _strList(dynamic v) {
  if (v is List) return [for (final e in v) if (e is String) e];
  return const [];
}

/// `mail.new` — a new email landed in the user's mailbox (inbound IMAP /
/// smtp-inbound ingest, or a send AFTER the 30s server-held undo window
/// expired). Data-only hint: merge, then lazy-fetch the body on open.
final class MailNewEvent extends MailEvent {
  /// Creates a `mail.new` hint. All parameters positional per module rule.
  const MailNewEvent(
    this.type,
    this.sequence,
    this.messageId,
    this.threadId,
    this.folderId,
    this.sender,
    this.fromName,
    this.snippet,
    this.labels,
    this.receivedAt,
    this.undoUntil,
    this.sendJobId,
    this.raw,
  );

  @override
  final String type;

  @override
  final int sequence;

  /// Canonical staged id (`messageId` in zod; `emailId` in NOTES §3).
  final String messageId;

  /// NOTES-era alias of [messageId].
  String get emailId => messageId;

  /// Staged zod: required. NOTES §3: nullable (async thread resolution).
  final String? threadId;

  final String? folderId;

  /// Sender hint: staged zod `sender` string; falls back to the NOTES-era
  /// `from: {name, address}` object's `address`.
  final String sender;

  /// NOTES-era `from.name`.
  final String? fromName;

  /// Short preview: staged zod `subjectPreview`; NOTES-era `snippet`.
  final String? snippet;

  /// NOTES-era initial labels (absent from the staged zod).
  final List<String> labels;

  final DateTime? receivedAt;

  /// Staged zod optional: present ONLY on client-originated sends still
  /// inside the server-held undo window.
  final DateTime? undoUntil;

  /// Staged zod optional: correlates the event with the outbox
  /// Idempotency-Key and a future `send.cancel` call.
  final String? sendJobId;

  @override
  final Map<String, dynamic> raw;

  /// Defensive parse: staged zod keys first, NOTES-era aliases second.
  factory MailNewEvent.fromJson(Map<String, dynamic> json) {
    const event = 'mail.new';
    final type = _discriminator(json, event);
    final messageId =
        _reqStr(json, 'messageId', aliases: ['emailId'], event: event);

    // sender: staged `sender` string, else NOTES-era `from` object.
    var sender = _str(json, 'sender') ?? '';
    String? fromName;
    final from = json['from'];
    if (from is Map<String, dynamic>) {
      fromName = _str(from, 'name');
      if (sender.isEmpty) sender = _str(from, 'address') ?? '';
    }

    return MailNewEvent(
      type,
      _reqInt(json, 'sequence', event: event),
      messageId,
      _str(json, 'threadId'),
      _str(json, 'folderId'),
      sender,
      fromName,
      _str(json, 'subjectPreview') ?? _str(json, 'snippet'),
      _strList(json['labels']),
      _dateTime(json['receivedAt']),
      _dateTime(json['undoUntil']),
      _str(json, 'sendJobId'),
      Map<String, dynamic>.unmodifiable(json),
    );
  }
}

/// `mail.updated` — flags/labels/location of an existing message changed
/// (read/star/label/snooze/archive/move/delete). [changed] names the mutated
/// fields; the client pulls the fresh row via `GET /emails/changes?since=`.
final class MailUpdatedEvent extends MailEvent {
  /// Creates a `mail.updated` hint. All parameters positional per module rule.
  const MailUpdatedEvent(
    this.type,
    this.sequence,
    this.messageId,
    this.threadId,
    this.changed,
    this.tombstone,
    this.updatedAt,
    this.delta,
    this.raw,
  );

  @override
  final String type;

  @override
  final int sequence;

  /// Canonical staged id (`messageId` in zod; `emailId` in NOTES §3).
  final String messageId;

  /// NOTES-era alias of [messageId].
  String get emailId => messageId;

  final String? threadId;

  /// Mutated fields: staged zod `changes`; NOTES §3 `changed`.
  final Set<String> changed;

  /// Staged-zod alias of [changed].
  Set<String> get changes => changed;

  /// NOTES-era only (absent from staged zod): hard-delete marker — the
  /// client must drop the local row.
  final bool tombstone;

  /// NOTES-era only (absent from staged zod): mutation time, compatible
  /// with the P0-1 delta-sync cursor.
  final DateTime? updatedAt;

  /// Delta values for the changed fields (`read`, `starred`, `labels`,
  /// `snoozedUntil`, `folderId`, `sendStatus`, ...) — NOTES-era only;
  /// staged zod carries no delta values.
  final Map<String, Object?> delta;

  @override
  final Map<String, dynamic> raw;

  /// Known envelope keys; everything else lands in [delta].
  static const _knownKeys = {
    'channel',
    'type',
    'sequence',
    'messageId',
    'emailId',
    'threadId',
    'changes',
    'changed',
    'tombstone',
    'updatedAt',
  };

  /// Defensive parse: staged zod keys first, NOTES-era aliases second.
  factory MailUpdatedEvent.fromJson(Map<String, dynamic> json) {
    const event = 'mail.updated';
    final type = _discriminator(json, event);
    final changed = <String>{
      ..._strList(json['changes']),
      ..._strList(json['changed']),
    };
    final delta = <String, Object?>{
      for (final e in json.entries)
        if (!_knownKeys.contains(e.key)) e.key: e.value,
    };
    return MailUpdatedEvent(
      type,
      _reqInt(json, 'sequence', event: event),
      _reqStr(json, 'messageId', aliases: ['emailId'], event: event),
      _str(json, 'threadId'),
      Set<String>.unmodifiable(changed),
      _boolish(json['tombstone']),
      _dateTime(json['updatedAt']),
      Map<String, Object?>.unmodifiable(delta),
      Map<String, dynamic>.unmodifiable(json),
    );
  }
}

/// `thread.updated` — thread-level rollup changed (new reply shifting
/// last-message/unread counts, mute, snooze). The client refetches the
/// thread header via delta sync; full body from the thread endpoint.
///
/// NOTE: there is NO `/threads/changes` equivalent — a gap on this event
/// stream forces a full thread refetch.
final class ThreadUpdatedEvent extends MailEvent {
  /// Creates a `thread.updated` hint. All parameters positional per module rule.
  const ThreadUpdatedEvent(
    this.type,
    this.sequence,
    this.threadId,
    this.lastMessageId,
    this.lastMessageAt,
    this.emailIds,
    this.snippet,
    this.unreadCount,
    this.labels,
    this.raw,
  );

  @override
  final String type;

  @override
  final int sequence;

  final String threadId;

  /// Staged zod: latest message id, nullable.
  final String? lastMessageId;

  /// NOTES-era only: sort key for the thread list.
  final DateTime? lastMessageAt;

  /// NOTES-era only: thread's current email ids (order preserved).
  final List<String> emailIds;

  /// NOTES-era only.
  final String? snippet;

  /// Staged zod: required, min 0.
  final int unreadCount;

  /// NOTES-era only.
  final List<String> labels;

  @override
  final Map<String, dynamic> raw;

  /// Defensive parse: staged zod keys first, NOTES-era aliases second.
  factory ThreadUpdatedEvent.fromJson(Map<String, dynamic> json) {
    const event = 'thread.updated';
    final type = _discriminator(json, event);
    return ThreadUpdatedEvent(
      type,
      _reqInt(json, 'sequence', event: event),
      _reqStr(json, 'threadId', event: event),
      _str(json, 'lastMessageId'),
      _dateTime(json['lastMessageAt']),
      _strList(json['emailIds']),
      _str(json, 'snippet'),
      _optInt(json, 'unreadCount'),
      _strList(json['labels']),
      Map<String, dynamic>.unmodifiable(json),
    );
  }
}

/// Parses one wire frame into the sealed [MailEvent] union.
///
/// Throws [FormatException] on an unknown/missing discriminator or on a
/// missing required field — unknown event types must be REJECTED, never
/// silently swallowed.
MailEvent parseMailEvent(Map<String, dynamic> json) {
  final type = _str(json, 'channel') ?? _str(json, 'type');
  switch (type) {
    case 'mail.new':
      return MailNewEvent.fromJson(json);
    case 'mail.updated':
      return MailUpdatedEvent.fromJson(json);
    case 'thread.updated':
      return ThreadUpdatedEvent.fromJson(json);
  }
  throw FormatException('Unknown mail event type: $type');
}
