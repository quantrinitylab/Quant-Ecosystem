import 'package:drift/drift.dart';

part 'quant_database.g.dart';

/// Table definition for local offline emails
class LocalMails extends Table {
  TextColumn get id => text()();
  TextColumn get threadId => text().nullable()();
  TextColumn get subject => text()();
  TextColumn get snippet => text()();
  TextColumn get sender => text()();
  TextColumn get recipientsJson => text()();
  TextColumn get folder => text().withDefault(const Constant('inbox'))();
  BoolColumn get isRead => boolean().withDefault(const Constant(false))();
  BoolColumn get isStarred => boolean().withDefault(const Constant(false))();
  DateTimeColumn get receivedAt => dateTime()();
  TextColumn get bodyHtml => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Table definition for local offline calendar events
class LocalEvents extends Table {
  TextColumn get id => text()();
  TextColumn get title => text()();
  TextColumn get description => text().nullable()();
  DateTimeColumn get startTime => dateTime()();
  DateTimeColumn get endTime => dateTime()();
  BoolColumn get isAllDay => boolean().withDefault(const Constant(false))();
  TextColumn get location => text().nullable()();
  TextColumn get recurrenceRule => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Table definition for local offline files / Drive cache
class LocalFiles extends Table {
  TextColumn get id => text()();
  TextColumn get name => text()();
  TextColumn get path => text()();
  TextColumn get mimeType => text()();
  Int64Column get sizeBytes => int64()();
  BoolColumn get isStarred => boolean().withDefault(const Constant(false))();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Table definition for offline mutation sync queue
class SyncQueueEntries extends Table {
  TextColumn get id => text()();
  TextColumn get entityType => text()();
  TextColumn get action => text()();
  TextColumn get entityId => text()();
  TextColumn get payloadJson => text()();
  DateTimeColumn get createdAt => dateTime()();
  IntColumn get retryCount => integer().withDefault(const Constant(0))();
  TextColumn get status => text().withDefault(const Constant('pending'))();
  TextColumn get lastError => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Master Offline SQLite Drift Database for Quant Sovereign Client
@DriftDatabase(tables: [LocalMails, LocalEvents, LocalFiles, SyncQueueEntries])
class QuantDatabase extends _$QuantDatabase {
  QuantDatabase(QueryExecutor e) : super(e);

  @override
  int get schemaVersion => 1;
}
