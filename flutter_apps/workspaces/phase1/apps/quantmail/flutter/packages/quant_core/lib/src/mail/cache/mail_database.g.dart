// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mail_database.dart';

// ignore_for_file: type=lint
class $CachedThreadsTable extends CachedThreads
    with TableInfo<$CachedThreadsTable, CachedThread> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CachedThreadsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _threadIdMeta =
      const VerificationMeta('threadId');
  @override
  late final GeneratedColumn<String> threadId = GeneratedColumn<String>(
      'thread_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _payloadJsonMeta =
      const VerificationMeta('payloadJson');
  @override
  late final GeneratedColumn<String> payloadJson = GeneratedColumn<String>(
      'payload_json', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _updatedAtEpochMeta =
      const VerificationMeta('updatedAtEpoch');
  @override
  late final GeneratedColumn<int> updatedAtEpoch = GeneratedColumn<int>(
      'updated_at_epoch', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [threadId, payloadJson, updatedAtEpoch];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'cached_threads';
  @override
  VerificationContext validateIntegrity(Insertable<CachedThread> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('thread_id')) {
      context.handle(_threadIdMeta,
          threadId.isAcceptableOrUnknown(data['thread_id']!, _threadIdMeta));
    } else if (isInserting) {
      context.missing(_threadIdMeta);
    }
    if (data.containsKey('payload_json')) {
      context.handle(
          _payloadJsonMeta,
          payloadJson.isAcceptableOrUnknown(
              data['payload_json']!, _payloadJsonMeta));
    } else if (isInserting) {
      context.missing(_payloadJsonMeta);
    }
    if (data.containsKey('updated_at_epoch')) {
      context.handle(
          _updatedAtEpochMeta,
          updatedAtEpoch.isAcceptableOrUnknown(
              data['updated_at_epoch']!, _updatedAtEpochMeta));
    } else if (isInserting) {
      context.missing(_updatedAtEpochMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {threadId};
  @override
  CachedThread map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CachedThread(
      threadId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}thread_id'])!,
      payloadJson: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}payload_json'])!,
      updatedAtEpoch: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}updated_at_epoch'])!,
    );
  }

  @override
  $CachedThreadsTable createAlias(String alias) {
    return $CachedThreadsTable(attachedDatabase, alias);
  }
}

class CachedThread extends DataClass implements Insertable<CachedThread> {
  /// Stable backend thread identifier (primary key).
  final String threadId;

  /// `ThreadSummary.toJson()` serialized — the source of truth on read.
  final String payloadJson;

  /// Last write time, milliseconds since epoch, for LRU/eviction policies.
  final int updatedAtEpoch;
  const CachedThread(
      {required this.threadId,
      required this.payloadJson,
      required this.updatedAtEpoch});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['thread_id'] = Variable<String>(threadId);
    map['payload_json'] = Variable<String>(payloadJson);
    map['updated_at_epoch'] = Variable<int>(updatedAtEpoch);
    return map;
  }

  CachedThreadsCompanion toCompanion(bool nullToAbsent) {
    return CachedThreadsCompanion(
      threadId: Value(threadId),
      payloadJson: Value(payloadJson),
      updatedAtEpoch: Value(updatedAtEpoch),
    );
  }

  factory CachedThread.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CachedThread(
      threadId: serializer.fromJson<String>(json['threadId']),
      payloadJson: serializer.fromJson<String>(json['payloadJson']),
      updatedAtEpoch: serializer.fromJson<int>(json['updatedAtEpoch']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'threadId': serializer.toJson<String>(threadId),
      'payloadJson': serializer.toJson<String>(payloadJson),
      'updatedAtEpoch': serializer.toJson<int>(updatedAtEpoch),
    };
  }

  CachedThread copyWith(
          {String? threadId, String? payloadJson, int? updatedAtEpoch}) =>
      CachedThread(
        threadId: threadId ?? this.threadId,
        payloadJson: payloadJson ?? this.payloadJson,
        updatedAtEpoch: updatedAtEpoch ?? this.updatedAtEpoch,
      );
  CachedThread copyWithCompanion(CachedThreadsCompanion data) {
    return CachedThread(
      threadId: data.threadId.present ? data.threadId.value : this.threadId,
      payloadJson:
          data.payloadJson.present ? data.payloadJson.value : this.payloadJson,
      updatedAtEpoch: data.updatedAtEpoch.present
          ? data.updatedAtEpoch.value
          : this.updatedAtEpoch,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CachedThread(')
          ..write('threadId: $threadId, ')
          ..write('payloadJson: $payloadJson, ')
          ..write('updatedAtEpoch: $updatedAtEpoch')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(threadId, payloadJson, updatedAtEpoch);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CachedThread &&
          other.threadId == this.threadId &&
          other.payloadJson == this.payloadJson &&
          other.updatedAtEpoch == this.updatedAtEpoch);
}

class CachedThreadsCompanion extends UpdateCompanion<CachedThread> {
  final Value<String> threadId;
  final Value<String> payloadJson;
  final Value<int> updatedAtEpoch;
  final Value<int> rowid;
  const CachedThreadsCompanion({
    this.threadId = const Value.absent(),
    this.payloadJson = const Value.absent(),
    this.updatedAtEpoch = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CachedThreadsCompanion.insert({
    required String threadId,
    required String payloadJson,
    required int updatedAtEpoch,
    this.rowid = const Value.absent(),
  })  : threadId = Value(threadId),
        payloadJson = Value(payloadJson),
        updatedAtEpoch = Value(updatedAtEpoch);
  static Insertable<CachedThread> custom({
    Expression<String>? threadId,
    Expression<String>? payloadJson,
    Expression<int>? updatedAtEpoch,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (threadId != null) 'thread_id': threadId,
      if (payloadJson != null) 'payload_json': payloadJson,
      if (updatedAtEpoch != null) 'updated_at_epoch': updatedAtEpoch,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CachedThreadsCompanion copyWith(
      {Value<String>? threadId,
      Value<String>? payloadJson,
      Value<int>? updatedAtEpoch,
      Value<int>? rowid}) {
    return CachedThreadsCompanion(
      threadId: threadId ?? this.threadId,
      payloadJson: payloadJson ?? this.payloadJson,
      updatedAtEpoch: updatedAtEpoch ?? this.updatedAtEpoch,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (threadId.present) {
      map['thread_id'] = Variable<String>(threadId.value);
    }
    if (payloadJson.present) {
      map['payload_json'] = Variable<String>(payloadJson.value);
    }
    if (updatedAtEpoch.present) {
      map['updated_at_epoch'] = Variable<int>(updatedAtEpoch.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CachedThreadsCompanion(')
          ..write('threadId: $threadId, ')
          ..write('payloadJson: $payloadJson, ')
          ..write('updatedAtEpoch: $updatedAtEpoch, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $CachedEmailsTable extends CachedEmails
    with TableInfo<$CachedEmailsTable, CachedEmail> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CachedEmailsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _payloadJsonMeta =
      const VerificationMeta('payloadJson');
  @override
  late final GeneratedColumn<String> payloadJson = GeneratedColumn<String>(
      'payload_json', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [id, payloadJson];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'cached_emails';
  @override
  VerificationContext validateIntegrity(Insertable<CachedEmail> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('payload_json')) {
      context.handle(
          _payloadJsonMeta,
          payloadJson.isAcceptableOrUnknown(
              data['payload_json']!, _payloadJsonMeta));
    } else if (isInserting) {
      context.missing(_payloadJsonMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  CachedEmail map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CachedEmail(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      payloadJson: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}payload_json'])!,
    );
  }

  @override
  $CachedEmailsTable createAlias(String alias) {
    return $CachedEmailsTable(attachedDatabase, alias);
  }
}

class CachedEmail extends DataClass implements Insertable<CachedEmail> {
  /// Stable backend email identifier (primary key).
  final String id;

  /// `Email.toJson()` serialized — the source of truth on read.
  final String payloadJson;
  const CachedEmail({required this.id, required this.payloadJson});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['payload_json'] = Variable<String>(payloadJson);
    return map;
  }

  CachedEmailsCompanion toCompanion(bool nullToAbsent) {
    return CachedEmailsCompanion(
      id: Value(id),
      payloadJson: Value(payloadJson),
    );
  }

  factory CachedEmail.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CachedEmail(
      id: serializer.fromJson<String>(json['id']),
      payloadJson: serializer.fromJson<String>(json['payloadJson']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'payloadJson': serializer.toJson<String>(payloadJson),
    };
  }

  CachedEmail copyWith({String? id, String? payloadJson}) => CachedEmail(
        id: id ?? this.id,
        payloadJson: payloadJson ?? this.payloadJson,
      );
  CachedEmail copyWithCompanion(CachedEmailsCompanion data) {
    return CachedEmail(
      id: data.id.present ? data.id.value : this.id,
      payloadJson:
          data.payloadJson.present ? data.payloadJson.value : this.payloadJson,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CachedEmail(')
          ..write('id: $id, ')
          ..write('payloadJson: $payloadJson')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, payloadJson);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CachedEmail &&
          other.id == this.id &&
          other.payloadJson == this.payloadJson);
}

class CachedEmailsCompanion extends UpdateCompanion<CachedEmail> {
  final Value<String> id;
  final Value<String> payloadJson;
  final Value<int> rowid;
  const CachedEmailsCompanion({
    this.id = const Value.absent(),
    this.payloadJson = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CachedEmailsCompanion.insert({
    required String id,
    required String payloadJson,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        payloadJson = Value(payloadJson);
  static Insertable<CachedEmail> custom({
    Expression<String>? id,
    Expression<String>? payloadJson,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (payloadJson != null) 'payload_json': payloadJson,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CachedEmailsCompanion copyWith(
      {Value<String>? id, Value<String>? payloadJson, Value<int>? rowid}) {
    return CachedEmailsCompanion(
      id: id ?? this.id,
      payloadJson: payloadJson ?? this.payloadJson,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (payloadJson.present) {
      map['payload_json'] = Variable<String>(payloadJson.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CachedEmailsCompanion(')
          ..write('id: $id, ')
          ..write('payloadJson: $payloadJson, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $EmailPagesTable extends EmailPages
    with TableInfo<$EmailPagesTable, EmailPage> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $EmailPagesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _pageKeyMeta =
      const VerificationMeta('pageKey');
  @override
  late final GeneratedColumn<String> pageKey = GeneratedColumn<String>(
      'page_key', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _payloadJsonMeta =
      const VerificationMeta('payloadJson');
  @override
  late final GeneratedColumn<String> payloadJson = GeneratedColumn<String>(
      'payload_json', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [pageKey, payloadJson];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'email_pages';
  @override
  VerificationContext validateIntegrity(Insertable<EmailPage> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('page_key')) {
      context.handle(_pageKeyMeta,
          pageKey.isAcceptableOrUnknown(data['page_key']!, _pageKeyMeta));
    } else if (isInserting) {
      context.missing(_pageKeyMeta);
    }
    if (data.containsKey('payload_json')) {
      context.handle(
          _payloadJsonMeta,
          payloadJson.isAcceptableOrUnknown(
              data['payload_json']!, _payloadJsonMeta));
    } else if (isInserting) {
      context.missing(_payloadJsonMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {pageKey};
  @override
  EmailPage map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return EmailPage(
      pageKey: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}page_key'])!,
      payloadJson: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}payload_json'])!,
    );
  }

  @override
  $EmailPagesTable createAlias(String alias) {
    return $EmailPagesTable(attachedDatabase, alias);
  }
}

class EmailPage extends DataClass implements Insertable<EmailPage> {
  /// Page key, e.g. `p:1:50:inbox` (primary key).
  final String pageKey;

  /// `PaginatedEmails` serialized as the API envelope
  /// `{success, data, pagination}` — parseable by
  /// `PaginatedEmails.fromJson`.
  final String payloadJson;
  const EmailPage({required this.pageKey, required this.payloadJson});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['page_key'] = Variable<String>(pageKey);
    map['payload_json'] = Variable<String>(payloadJson);
    return map;
  }

  EmailPagesCompanion toCompanion(bool nullToAbsent) {
    return EmailPagesCompanion(
      pageKey: Value(pageKey),
      payloadJson: Value(payloadJson),
    );
  }

  factory EmailPage.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return EmailPage(
      pageKey: serializer.fromJson<String>(json['pageKey']),
      payloadJson: serializer.fromJson<String>(json['payloadJson']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'pageKey': serializer.toJson<String>(pageKey),
      'payloadJson': serializer.toJson<String>(payloadJson),
    };
  }

  EmailPage copyWith({String? pageKey, String? payloadJson}) => EmailPage(
        pageKey: pageKey ?? this.pageKey,
        payloadJson: payloadJson ?? this.payloadJson,
      );
  EmailPage copyWithCompanion(EmailPagesCompanion data) {
    return EmailPage(
      pageKey: data.pageKey.present ? data.pageKey.value : this.pageKey,
      payloadJson:
          data.payloadJson.present ? data.payloadJson.value : this.payloadJson,
    );
  }

  @override
  String toString() {
    return (StringBuffer('EmailPage(')
          ..write('pageKey: $pageKey, ')
          ..write('payloadJson: $payloadJson')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(pageKey, payloadJson);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is EmailPage &&
          other.pageKey == this.pageKey &&
          other.payloadJson == this.payloadJson);
}

class EmailPagesCompanion extends UpdateCompanion<EmailPage> {
  final Value<String> pageKey;
  final Value<String> payloadJson;
  final Value<int> rowid;
  const EmailPagesCompanion({
    this.pageKey = const Value.absent(),
    this.payloadJson = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  EmailPagesCompanion.insert({
    required String pageKey,
    required String payloadJson,
    this.rowid = const Value.absent(),
  })  : pageKey = Value(pageKey),
        payloadJson = Value(payloadJson);
  static Insertable<EmailPage> custom({
    Expression<String>? pageKey,
    Expression<String>? payloadJson,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (pageKey != null) 'page_key': pageKey,
      if (payloadJson != null) 'payload_json': payloadJson,
      if (rowid != null) 'rowid': rowid,
    });
  }

  EmailPagesCompanion copyWith(
      {Value<String>? pageKey, Value<String>? payloadJson, Value<int>? rowid}) {
    return EmailPagesCompanion(
      pageKey: pageKey ?? this.pageKey,
      payloadJson: payloadJson ?? this.payloadJson,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (pageKey.present) {
      map['page_key'] = Variable<String>(pageKey.value);
    }
    if (payloadJson.present) {
      map['payload_json'] = Variable<String>(payloadJson.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('EmailPagesCompanion(')
          ..write('pageKey: $pageKey, ')
          ..write('payloadJson: $payloadJson, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ThreadPagesTable extends ThreadPages
    with TableInfo<$ThreadPagesTable, ThreadPage> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ThreadPagesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _pageKeyMeta =
      const VerificationMeta('pageKey');
  @override
  late final GeneratedColumn<String> pageKey = GeneratedColumn<String>(
      'page_key', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _threadIdsJsonMeta =
      const VerificationMeta('threadIdsJson');
  @override
  late final GeneratedColumn<String> threadIdsJson = GeneratedColumn<String>(
      'thread_ids_json', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _hasMoreMeta =
      const VerificationMeta('hasMore');
  @override
  late final GeneratedColumn<bool> hasMore = GeneratedColumn<bool>(
      'has_more', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: true,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('CHECK ("has_more" IN (0, 1))'));
  @override
  List<GeneratedColumn> get $columns => [pageKey, threadIdsJson, hasMore];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'thread_pages';
  @override
  VerificationContext validateIntegrity(Insertable<ThreadPage> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('page_key')) {
      context.handle(_pageKeyMeta,
          pageKey.isAcceptableOrUnknown(data['page_key']!, _pageKeyMeta));
    } else if (isInserting) {
      context.missing(_pageKeyMeta);
    }
    if (data.containsKey('thread_ids_json')) {
      context.handle(
          _threadIdsJsonMeta,
          threadIdsJson.isAcceptableOrUnknown(
              data['thread_ids_json']!, _threadIdsJsonMeta));
    } else if (isInserting) {
      context.missing(_threadIdsJsonMeta);
    }
    if (data.containsKey('has_more')) {
      context.handle(_hasMoreMeta,
          hasMore.isAcceptableOrUnknown(data['has_more']!, _hasMoreMeta));
    } else if (isInserting) {
      context.missing(_hasMoreMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {pageKey};
  @override
  ThreadPage map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ThreadPage(
      pageKey: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}page_key'])!,
      threadIdsJson: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}thread_ids_json'])!,
      hasMore: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}has_more'])!,
    );
  }

  @override
  $ThreadPagesTable createAlias(String alias) {
    return $ThreadPagesTable(attachedDatabase, alias);
  }
}

class ThreadPage extends DataClass implements Insertable<ThreadPage> {
  /// Page key, e.g. `tp:1:50:inbox` (primary key).
  final String pageKey;

  /// JSON-encoded ordered list of thread ids for this page.
  final String threadIdsJson;

  /// Whether another page follows this one (SQLite has no bool column).
  final bool hasMore;
  const ThreadPage(
      {required this.pageKey,
      required this.threadIdsJson,
      required this.hasMore});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['page_key'] = Variable<String>(pageKey);
    map['thread_ids_json'] = Variable<String>(threadIdsJson);
    map['has_more'] = Variable<bool>(hasMore);
    return map;
  }

  ThreadPagesCompanion toCompanion(bool nullToAbsent) {
    return ThreadPagesCompanion(
      pageKey: Value(pageKey),
      threadIdsJson: Value(threadIdsJson),
      hasMore: Value(hasMore),
    );
  }

  factory ThreadPage.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ThreadPage(
      pageKey: serializer.fromJson<String>(json['pageKey']),
      threadIdsJson: serializer.fromJson<String>(json['threadIdsJson']),
      hasMore: serializer.fromJson<bool>(json['hasMore']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'pageKey': serializer.toJson<String>(pageKey),
      'threadIdsJson': serializer.toJson<String>(threadIdsJson),
      'hasMore': serializer.toJson<bool>(hasMore),
    };
  }

  ThreadPage copyWith(
          {String? pageKey, String? threadIdsJson, bool? hasMore}) =>
      ThreadPage(
        pageKey: pageKey ?? this.pageKey,
        threadIdsJson: threadIdsJson ?? this.threadIdsJson,
        hasMore: hasMore ?? this.hasMore,
      );
  ThreadPage copyWithCompanion(ThreadPagesCompanion data) {
    return ThreadPage(
      pageKey: data.pageKey.present ? data.pageKey.value : this.pageKey,
      threadIdsJson: data.threadIdsJson.present
          ? data.threadIdsJson.value
          : this.threadIdsJson,
      hasMore: data.hasMore.present ? data.hasMore.value : this.hasMore,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ThreadPage(')
          ..write('pageKey: $pageKey, ')
          ..write('threadIdsJson: $threadIdsJson, ')
          ..write('hasMore: $hasMore')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(pageKey, threadIdsJson, hasMore);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ThreadPage &&
          other.pageKey == this.pageKey &&
          other.threadIdsJson == this.threadIdsJson &&
          other.hasMore == this.hasMore);
}

class ThreadPagesCompanion extends UpdateCompanion<ThreadPage> {
  final Value<String> pageKey;
  final Value<String> threadIdsJson;
  final Value<bool> hasMore;
  final Value<int> rowid;
  const ThreadPagesCompanion({
    this.pageKey = const Value.absent(),
    this.threadIdsJson = const Value.absent(),
    this.hasMore = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ThreadPagesCompanion.insert({
    required String pageKey,
    required String threadIdsJson,
    required bool hasMore,
    this.rowid = const Value.absent(),
  })  : pageKey = Value(pageKey),
        threadIdsJson = Value(threadIdsJson),
        hasMore = Value(hasMore);
  static Insertable<ThreadPage> custom({
    Expression<String>? pageKey,
    Expression<String>? threadIdsJson,
    Expression<bool>? hasMore,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (pageKey != null) 'page_key': pageKey,
      if (threadIdsJson != null) 'thread_ids_json': threadIdsJson,
      if (hasMore != null) 'has_more': hasMore,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ThreadPagesCompanion copyWith(
      {Value<String>? pageKey,
      Value<String>? threadIdsJson,
      Value<bool>? hasMore,
      Value<int>? rowid}) {
    return ThreadPagesCompanion(
      pageKey: pageKey ?? this.pageKey,
      threadIdsJson: threadIdsJson ?? this.threadIdsJson,
      hasMore: hasMore ?? this.hasMore,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (pageKey.present) {
      map['page_key'] = Variable<String>(pageKey.value);
    }
    if (threadIdsJson.present) {
      map['thread_ids_json'] = Variable<String>(threadIdsJson.value);
    }
    if (hasMore.present) {
      map['has_more'] = Variable<bool>(hasMore.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ThreadPagesCompanion(')
          ..write('pageKey: $pageKey, ')
          ..write('threadIdsJson: $threadIdsJson, ')
          ..write('hasMore: $hasMore, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $SyncStateTable extends SyncState
    with TableInfo<$SyncStateTable, SyncStateEntry> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SyncStateTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _keyMeta = const VerificationMeta('key');
  @override
  late final GeneratedColumn<String> key = GeneratedColumn<String>(
      'key', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _valueMeta = const VerificationMeta('value');
  @override
  late final GeneratedColumn<String> value = GeneratedColumn<String>(
      'value', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [key, value];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'sync_state';
  @override
  VerificationContext validateIntegrity(Insertable<SyncStateEntry> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('key')) {
      context.handle(
          _keyMeta, key.isAcceptableOrUnknown(data['key']!, _keyMeta));
    } else if (isInserting) {
      context.missing(_keyMeta);
    }
    if (data.containsKey('value')) {
      context.handle(
          _valueMeta, value.isAcceptableOrUnknown(data['value']!, _valueMeta));
    } else if (isInserting) {
      context.missing(_valueMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {key};
  @override
  SyncStateEntry map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SyncStateEntry(
      key: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}key'])!,
      value: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}value'])!,
    );
  }

  @override
  $SyncStateTable createAlias(String alias) {
    return $SyncStateTable(attachedDatabase, alias);
  }
}

class SyncStateEntry extends DataClass implements Insertable<SyncStateEntry> {
  /// Entry key, e.g. `emails_since` (primary key).
  final String key;

  /// Opaque string value.
  final String value;
  const SyncStateEntry({required this.key, required this.value});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['key'] = Variable<String>(key);
    map['value'] = Variable<String>(value);
    return map;
  }

  SyncStateCompanion toCompanion(bool nullToAbsent) {
    return SyncStateCompanion(
      key: Value(key),
      value: Value(value),
    );
  }

  factory SyncStateEntry.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SyncStateEntry(
      key: serializer.fromJson<String>(json['key']),
      value: serializer.fromJson<String>(json['value']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'key': serializer.toJson<String>(key),
      'value': serializer.toJson<String>(value),
    };
  }

  SyncStateEntry copyWith({String? key, String? value}) => SyncStateEntry(
        key: key ?? this.key,
        value: value ?? this.value,
      );
  SyncStateEntry copyWithCompanion(SyncStateCompanion data) {
    return SyncStateEntry(
      key: data.key.present ? data.key.value : this.key,
      value: data.value.present ? data.value.value : this.value,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SyncStateEntry(')
          ..write('key: $key, ')
          ..write('value: $value')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(key, value);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SyncStateEntry &&
          other.key == this.key &&
          other.value == this.value);
}

class SyncStateCompanion extends UpdateCompanion<SyncStateEntry> {
  final Value<String> key;
  final Value<String> value;
  final Value<int> rowid;
  const SyncStateCompanion({
    this.key = const Value.absent(),
    this.value = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SyncStateCompanion.insert({
    required String key,
    required String value,
    this.rowid = const Value.absent(),
  })  : key = Value(key),
        value = Value(value);
  static Insertable<SyncStateEntry> custom({
    Expression<String>? key,
    Expression<String>? value,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (key != null) 'key': key,
      if (value != null) 'value': value,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SyncStateCompanion copyWith(
      {Value<String>? key, Value<String>? value, Value<int>? rowid}) {
    return SyncStateCompanion(
      key: key ?? this.key,
      value: value ?? this.value,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (key.present) {
      map['key'] = Variable<String>(key.value);
    }
    if (value.present) {
      map['value'] = Variable<String>(value.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SyncStateCompanion(')
          ..write('key: $key, ')
          ..write('value: $value, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$MailDatabase extends GeneratedDatabase {
  _$MailDatabase(QueryExecutor e) : super(e);
  $MailDatabaseManager get managers => $MailDatabaseManager(this);
  late final $CachedThreadsTable cachedThreads = $CachedThreadsTable(this);
  late final $CachedEmailsTable cachedEmails = $CachedEmailsTable(this);
  late final $EmailPagesTable emailPages = $EmailPagesTable(this);
  late final $ThreadPagesTable threadPages = $ThreadPagesTable(this);
  late final $SyncStateTable syncState = $SyncStateTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities =>
      [cachedThreads, cachedEmails, emailPages, threadPages, syncState];
}

typedef $$CachedThreadsTableCreateCompanionBuilder = CachedThreadsCompanion
    Function({
  required String threadId,
  required String payloadJson,
  required int updatedAtEpoch,
  Value<int> rowid,
});
typedef $$CachedThreadsTableUpdateCompanionBuilder = CachedThreadsCompanion
    Function({
  Value<String> threadId,
  Value<String> payloadJson,
  Value<int> updatedAtEpoch,
  Value<int> rowid,
});

class $$CachedThreadsTableFilterComposer
    extends Composer<_$MailDatabase, $CachedThreadsTable> {
  $$CachedThreadsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get threadId => $composableBuilder(
      column: $table.threadId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get payloadJson => $composableBuilder(
      column: $table.payloadJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get updatedAtEpoch => $composableBuilder(
      column: $table.updatedAtEpoch,
      builder: (column) => ColumnFilters(column));
}

class $$CachedThreadsTableOrderingComposer
    extends Composer<_$MailDatabase, $CachedThreadsTable> {
  $$CachedThreadsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get threadId => $composableBuilder(
      column: $table.threadId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get payloadJson => $composableBuilder(
      column: $table.payloadJson, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get updatedAtEpoch => $composableBuilder(
      column: $table.updatedAtEpoch,
      builder: (column) => ColumnOrderings(column));
}

class $$CachedThreadsTableAnnotationComposer
    extends Composer<_$MailDatabase, $CachedThreadsTable> {
  $$CachedThreadsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get threadId =>
      $composableBuilder(column: $table.threadId, builder: (column) => column);

  GeneratedColumn<String> get payloadJson => $composableBuilder(
      column: $table.payloadJson, builder: (column) => column);

  GeneratedColumn<int> get updatedAtEpoch => $composableBuilder(
      column: $table.updatedAtEpoch, builder: (column) => column);
}

class $$CachedThreadsTableTableManager extends RootTableManager<
    _$MailDatabase,
    $CachedThreadsTable,
    CachedThread,
    $$CachedThreadsTableFilterComposer,
    $$CachedThreadsTableOrderingComposer,
    $$CachedThreadsTableAnnotationComposer,
    $$CachedThreadsTableCreateCompanionBuilder,
    $$CachedThreadsTableUpdateCompanionBuilder,
    (
      CachedThread,
      BaseReferences<_$MailDatabase, $CachedThreadsTable, CachedThread>
    ),
    CachedThread,
    PrefetchHooks Function()> {
  $$CachedThreadsTableTableManager(_$MailDatabase db, $CachedThreadsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CachedThreadsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CachedThreadsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CachedThreadsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> threadId = const Value.absent(),
            Value<String> payloadJson = const Value.absent(),
            Value<int> updatedAtEpoch = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              CachedThreadsCompanion(
            threadId: threadId,
            payloadJson: payloadJson,
            updatedAtEpoch: updatedAtEpoch,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String threadId,
            required String payloadJson,
            required int updatedAtEpoch,
            Value<int> rowid = const Value.absent(),
          }) =>
              CachedThreadsCompanion.insert(
            threadId: threadId,
            payloadJson: payloadJson,
            updatedAtEpoch: updatedAtEpoch,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$CachedThreadsTableProcessedTableManager = ProcessedTableManager<
    _$MailDatabase,
    $CachedThreadsTable,
    CachedThread,
    $$CachedThreadsTableFilterComposer,
    $$CachedThreadsTableOrderingComposer,
    $$CachedThreadsTableAnnotationComposer,
    $$CachedThreadsTableCreateCompanionBuilder,
    $$CachedThreadsTableUpdateCompanionBuilder,
    (
      CachedThread,
      BaseReferences<_$MailDatabase, $CachedThreadsTable, CachedThread>
    ),
    CachedThread,
    PrefetchHooks Function()>;
typedef $$CachedEmailsTableCreateCompanionBuilder = CachedEmailsCompanion
    Function({
  required String id,
  required String payloadJson,
  Value<int> rowid,
});
typedef $$CachedEmailsTableUpdateCompanionBuilder = CachedEmailsCompanion
    Function({
  Value<String> id,
  Value<String> payloadJson,
  Value<int> rowid,
});

class $$CachedEmailsTableFilterComposer
    extends Composer<_$MailDatabase, $CachedEmailsTable> {
  $$CachedEmailsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get payloadJson => $composableBuilder(
      column: $table.payloadJson, builder: (column) => ColumnFilters(column));
}

class $$CachedEmailsTableOrderingComposer
    extends Composer<_$MailDatabase, $CachedEmailsTable> {
  $$CachedEmailsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get payloadJson => $composableBuilder(
      column: $table.payloadJson, builder: (column) => ColumnOrderings(column));
}

class $$CachedEmailsTableAnnotationComposer
    extends Composer<_$MailDatabase, $CachedEmailsTable> {
  $$CachedEmailsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get payloadJson => $composableBuilder(
      column: $table.payloadJson, builder: (column) => column);
}

class $$CachedEmailsTableTableManager extends RootTableManager<
    _$MailDatabase,
    $CachedEmailsTable,
    CachedEmail,
    $$CachedEmailsTableFilterComposer,
    $$CachedEmailsTableOrderingComposer,
    $$CachedEmailsTableAnnotationComposer,
    $$CachedEmailsTableCreateCompanionBuilder,
    $$CachedEmailsTableUpdateCompanionBuilder,
    (
      CachedEmail,
      BaseReferences<_$MailDatabase, $CachedEmailsTable, CachedEmail>
    ),
    CachedEmail,
    PrefetchHooks Function()> {
  $$CachedEmailsTableTableManager(_$MailDatabase db, $CachedEmailsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CachedEmailsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CachedEmailsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CachedEmailsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> payloadJson = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              CachedEmailsCompanion(
            id: id,
            payloadJson: payloadJson,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String payloadJson,
            Value<int> rowid = const Value.absent(),
          }) =>
              CachedEmailsCompanion.insert(
            id: id,
            payloadJson: payloadJson,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$CachedEmailsTableProcessedTableManager = ProcessedTableManager<
    _$MailDatabase,
    $CachedEmailsTable,
    CachedEmail,
    $$CachedEmailsTableFilterComposer,
    $$CachedEmailsTableOrderingComposer,
    $$CachedEmailsTableAnnotationComposer,
    $$CachedEmailsTableCreateCompanionBuilder,
    $$CachedEmailsTableUpdateCompanionBuilder,
    (
      CachedEmail,
      BaseReferences<_$MailDatabase, $CachedEmailsTable, CachedEmail>
    ),
    CachedEmail,
    PrefetchHooks Function()>;
typedef $$EmailPagesTableCreateCompanionBuilder = EmailPagesCompanion Function({
  required String pageKey,
  required String payloadJson,
  Value<int> rowid,
});
typedef $$EmailPagesTableUpdateCompanionBuilder = EmailPagesCompanion Function({
  Value<String> pageKey,
  Value<String> payloadJson,
  Value<int> rowid,
});

class $$EmailPagesTableFilterComposer
    extends Composer<_$MailDatabase, $EmailPagesTable> {
  $$EmailPagesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get pageKey => $composableBuilder(
      column: $table.pageKey, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get payloadJson => $composableBuilder(
      column: $table.payloadJson, builder: (column) => ColumnFilters(column));
}

class $$EmailPagesTableOrderingComposer
    extends Composer<_$MailDatabase, $EmailPagesTable> {
  $$EmailPagesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get pageKey => $composableBuilder(
      column: $table.pageKey, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get payloadJson => $composableBuilder(
      column: $table.payloadJson, builder: (column) => ColumnOrderings(column));
}

class $$EmailPagesTableAnnotationComposer
    extends Composer<_$MailDatabase, $EmailPagesTable> {
  $$EmailPagesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get pageKey =>
      $composableBuilder(column: $table.pageKey, builder: (column) => column);

  GeneratedColumn<String> get payloadJson => $composableBuilder(
      column: $table.payloadJson, builder: (column) => column);
}

class $$EmailPagesTableTableManager extends RootTableManager<
    _$MailDatabase,
    $EmailPagesTable,
    EmailPage,
    $$EmailPagesTableFilterComposer,
    $$EmailPagesTableOrderingComposer,
    $$EmailPagesTableAnnotationComposer,
    $$EmailPagesTableCreateCompanionBuilder,
    $$EmailPagesTableUpdateCompanionBuilder,
    (EmailPage, BaseReferences<_$MailDatabase, $EmailPagesTable, EmailPage>),
    EmailPage,
    PrefetchHooks Function()> {
  $$EmailPagesTableTableManager(_$MailDatabase db, $EmailPagesTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$EmailPagesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$EmailPagesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$EmailPagesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> pageKey = const Value.absent(),
            Value<String> payloadJson = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              EmailPagesCompanion(
            pageKey: pageKey,
            payloadJson: payloadJson,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String pageKey,
            required String payloadJson,
            Value<int> rowid = const Value.absent(),
          }) =>
              EmailPagesCompanion.insert(
            pageKey: pageKey,
            payloadJson: payloadJson,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$EmailPagesTableProcessedTableManager = ProcessedTableManager<
    _$MailDatabase,
    $EmailPagesTable,
    EmailPage,
    $$EmailPagesTableFilterComposer,
    $$EmailPagesTableOrderingComposer,
    $$EmailPagesTableAnnotationComposer,
    $$EmailPagesTableCreateCompanionBuilder,
    $$EmailPagesTableUpdateCompanionBuilder,
    (EmailPage, BaseReferences<_$MailDatabase, $EmailPagesTable, EmailPage>),
    EmailPage,
    PrefetchHooks Function()>;
typedef $$ThreadPagesTableCreateCompanionBuilder = ThreadPagesCompanion
    Function({
  required String pageKey,
  required String threadIdsJson,
  required bool hasMore,
  Value<int> rowid,
});
typedef $$ThreadPagesTableUpdateCompanionBuilder = ThreadPagesCompanion
    Function({
  Value<String> pageKey,
  Value<String> threadIdsJson,
  Value<bool> hasMore,
  Value<int> rowid,
});

class $$ThreadPagesTableFilterComposer
    extends Composer<_$MailDatabase, $ThreadPagesTable> {
  $$ThreadPagesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get pageKey => $composableBuilder(
      column: $table.pageKey, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get threadIdsJson => $composableBuilder(
      column: $table.threadIdsJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get hasMore => $composableBuilder(
      column: $table.hasMore, builder: (column) => ColumnFilters(column));
}

class $$ThreadPagesTableOrderingComposer
    extends Composer<_$MailDatabase, $ThreadPagesTable> {
  $$ThreadPagesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get pageKey => $composableBuilder(
      column: $table.pageKey, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get threadIdsJson => $composableBuilder(
      column: $table.threadIdsJson,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get hasMore => $composableBuilder(
      column: $table.hasMore, builder: (column) => ColumnOrderings(column));
}

class $$ThreadPagesTableAnnotationComposer
    extends Composer<_$MailDatabase, $ThreadPagesTable> {
  $$ThreadPagesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get pageKey =>
      $composableBuilder(column: $table.pageKey, builder: (column) => column);

  GeneratedColumn<String> get threadIdsJson => $composableBuilder(
      column: $table.threadIdsJson, builder: (column) => column);

  GeneratedColumn<bool> get hasMore =>
      $composableBuilder(column: $table.hasMore, builder: (column) => column);
}

class $$ThreadPagesTableTableManager extends RootTableManager<
    _$MailDatabase,
    $ThreadPagesTable,
    ThreadPage,
    $$ThreadPagesTableFilterComposer,
    $$ThreadPagesTableOrderingComposer,
    $$ThreadPagesTableAnnotationComposer,
    $$ThreadPagesTableCreateCompanionBuilder,
    $$ThreadPagesTableUpdateCompanionBuilder,
    (ThreadPage, BaseReferences<_$MailDatabase, $ThreadPagesTable, ThreadPage>),
    ThreadPage,
    PrefetchHooks Function()> {
  $$ThreadPagesTableTableManager(_$MailDatabase db, $ThreadPagesTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ThreadPagesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ThreadPagesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ThreadPagesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> pageKey = const Value.absent(),
            Value<String> threadIdsJson = const Value.absent(),
            Value<bool> hasMore = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              ThreadPagesCompanion(
            pageKey: pageKey,
            threadIdsJson: threadIdsJson,
            hasMore: hasMore,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String pageKey,
            required String threadIdsJson,
            required bool hasMore,
            Value<int> rowid = const Value.absent(),
          }) =>
              ThreadPagesCompanion.insert(
            pageKey: pageKey,
            threadIdsJson: threadIdsJson,
            hasMore: hasMore,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$ThreadPagesTableProcessedTableManager = ProcessedTableManager<
    _$MailDatabase,
    $ThreadPagesTable,
    ThreadPage,
    $$ThreadPagesTableFilterComposer,
    $$ThreadPagesTableOrderingComposer,
    $$ThreadPagesTableAnnotationComposer,
    $$ThreadPagesTableCreateCompanionBuilder,
    $$ThreadPagesTableUpdateCompanionBuilder,
    (ThreadPage, BaseReferences<_$MailDatabase, $ThreadPagesTable, ThreadPage>),
    ThreadPage,
    PrefetchHooks Function()>;
typedef $$SyncStateTableCreateCompanionBuilder = SyncStateCompanion Function({
  required String key,
  required String value,
  Value<int> rowid,
});
typedef $$SyncStateTableUpdateCompanionBuilder = SyncStateCompanion Function({
  Value<String> key,
  Value<String> value,
  Value<int> rowid,
});

class $$SyncStateTableFilterComposer
    extends Composer<_$MailDatabase, $SyncStateTable> {
  $$SyncStateTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get key => $composableBuilder(
      column: $table.key, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get value => $composableBuilder(
      column: $table.value, builder: (column) => ColumnFilters(column));
}

class $$SyncStateTableOrderingComposer
    extends Composer<_$MailDatabase, $SyncStateTable> {
  $$SyncStateTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get key => $composableBuilder(
      column: $table.key, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get value => $composableBuilder(
      column: $table.value, builder: (column) => ColumnOrderings(column));
}

class $$SyncStateTableAnnotationComposer
    extends Composer<_$MailDatabase, $SyncStateTable> {
  $$SyncStateTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get key =>
      $composableBuilder(column: $table.key, builder: (column) => column);

  GeneratedColumn<String> get value =>
      $composableBuilder(column: $table.value, builder: (column) => column);
}

class $$SyncStateTableTableManager extends RootTableManager<
    _$MailDatabase,
    $SyncStateTable,
    SyncStateEntry,
    $$SyncStateTableFilterComposer,
    $$SyncStateTableOrderingComposer,
    $$SyncStateTableAnnotationComposer,
    $$SyncStateTableCreateCompanionBuilder,
    $$SyncStateTableUpdateCompanionBuilder,
    (
      SyncStateEntry,
      BaseReferences<_$MailDatabase, $SyncStateTable, SyncStateEntry>
    ),
    SyncStateEntry,
    PrefetchHooks Function()> {
  $$SyncStateTableTableManager(_$MailDatabase db, $SyncStateTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SyncStateTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SyncStateTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SyncStateTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> key = const Value.absent(),
            Value<String> value = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              SyncStateCompanion(
            key: key,
            value: value,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String key,
            required String value,
            Value<int> rowid = const Value.absent(),
          }) =>
              SyncStateCompanion.insert(
            key: key,
            value: value,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$SyncStateTableProcessedTableManager = ProcessedTableManager<
    _$MailDatabase,
    $SyncStateTable,
    SyncStateEntry,
    $$SyncStateTableFilterComposer,
    $$SyncStateTableOrderingComposer,
    $$SyncStateTableAnnotationComposer,
    $$SyncStateTableCreateCompanionBuilder,
    $$SyncStateTableUpdateCompanionBuilder,
    (
      SyncStateEntry,
      BaseReferences<_$MailDatabase, $SyncStateTable, SyncStateEntry>
    ),
    SyncStateEntry,
    PrefetchHooks Function()>;

class $MailDatabaseManager {
  final _$MailDatabase _db;
  $MailDatabaseManager(this._db);
  $$CachedThreadsTableTableManager get cachedThreads =>
      $$CachedThreadsTableTableManager(_db, _db.cachedThreads);
  $$CachedEmailsTableTableManager get cachedEmails =>
      $$CachedEmailsTableTableManager(_db, _db.cachedEmails);
  $$EmailPagesTableTableManager get emailPages =>
      $$EmailPagesTableTableManager(_db, _db.emailPages);
  $$ThreadPagesTableTableManager get threadPages =>
      $$ThreadPagesTableTableManager(_db, _db.threadPages);
  $$SyncStateTableTableManager get syncState =>
      $$SyncStateTableTableManager(_db, _db.syncState);
}
