// ============================================================================
// quant_core - drift-backed MailCache (M4: drift persistence layer)
// ============================================================================
//
// SQLite implementation of the [MailCache] offline-cache seam from
// mail_providers.dart. Email-list pages are JSON-encoded into the
// `EmailPages` table under the exact (page, pageSize, folder) key; individual
// emails are upserted into `CachedEmails` so thread views stay readable
// offline even when their list page was evicted.
//
// Decision log: see M4_CACHE_DECISIONS.md in this directory.

import 'dart:convert';

import 'package:drift/drift.dart';

import '../mail_providers.dart';
import '../models/email.dart';
import '../models/pagination.dart';
import 'mail_database.dart';

/// SQLite-backed [MailCache], built on [MailDatabase].
class DriftMailCache implements MailCache {
  /// Creates a cache backed by [db].
  DriftMailCache(this._db);

  final MailDatabase _db;

  /// Page lookup key: `p:<page>:<pageSize>:<folder>`.
  ///
  /// Folder resolution order mirrors the read/write contract in
  /// [MailCache]: explicit `folderId` wins, then the [FolderType] enum
  /// name, then `'inbox'`.
  static String pageKey({
    required int page,
    required int pageSize,
    String? folderId,
    FolderType? folderType,
  }) =>
      'p:$page:$pageSize:${folderId ?? folderType?.name ?? 'inbox'}';

  @override
  Future<PaginatedEmails?> readCachedPage({
    required int page,
    required int pageSize,
    String? folderId,
    FolderType? folderType,
  }) async {
    final key = pageKey(
      page: page,
      pageSize: pageSize,
      folderId: folderId,
      folderType: folderType,
    );
    final row = await (_db.select(_db.emailPages)
          ..where((t) => t.pageKey.equals(key)))
        .getSingleOrNull();
    if (row == null) return null;
    final decoded = jsonDecode(row.payloadJson);
    if (decoded is! Map<String, dynamic>) return null;
    return PaginatedEmails.fromJson(decoded);
  }

  @override
  Future<void> writePage({
    required int page,
    required int pageSize,
    String? folderId,
    FolderType? folderType,
    required PaginatedEmails result,
  }) async {
    final key = pageKey(
      page: page,
      pageSize: pageSize,
      folderId: folderId,
      folderType: folderType,
    );
    // Serialized as the API envelope so PaginatedEmails.fromJson can
    // parse it back verbatim.
    final envelope = <String, dynamic>{
      'success': result.success,
      'data': result.emails.map((e) => e.toJson()).toList(),
      'pagination': result.pageInfo.toJson(),
    };
    await _db.into(_db.emailPages).insertOnConflictUpdate(
          EmailPagesCompanion(
            pageKey: Value(key),
            payloadJson: Value(jsonEncode(envelope)),
          ),
        );
    // Upsert each email individually so thread views and single-email
    // reads stay available offline even if this page is later evicted.
    for (final email in result.emails) {
      await writeEmail(email);
    }
  }

  @override
  Future<Email?> readEmail(String id) async {
    final row = await (_db.select(_db.cachedEmails)
          ..where((t) => t.id.equals(id)))
        .getSingleOrNull();
    if (row == null) return null;
    final decoded = jsonDecode(row.payloadJson);
    if (decoded is! Map<String, dynamic>) return null;
    return Email.fromJson(decoded);
  }

  @override
  Future<void> writeEmail(Email email) async {
    await _db.into(_db.cachedEmails).insertOnConflictUpdate(
          CachedEmailsCompanion(
            id: Value(email.id),
            payloadJson: Value(jsonEncode(email.toJson())),
          ),
        );
  }

  @override
  Future<void> clear() async {
    // Sign-out / account-switch semantics: drop every mail row AND the
    // sync cursor so the next account starts from a clean slate.
    await _db.delete(_db.cachedEmails).go();
    await _db.delete(_db.emailPages).go();
    await _db.delete(_db.cachedThreads).go();
    await _db.delete(_db.threadPages).go();
    await _db.delete(_db.syncState).go();
  }
}
