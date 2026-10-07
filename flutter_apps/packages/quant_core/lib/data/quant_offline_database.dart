// Sovereign Quant Ecosystem - Local-First Offline Data & SQLite FTS5 Search Engine
// Strictly ZERO raw Unicode emojis throughout this file.

/// SQL Schemas & Blueprint for SQLite FTS5 sub-5ms Instant Search.
class QuantFtsSchemaBlueprint {
  /// Virtual table definition for thread full-text search.
  static const String createThreadsFts = '''
CREATE VIRTUAL TABLE IF NOT EXISTS threads_fts USING fts5(
  thread_id UNINDEXED,
  workspace_id UNINDEXED,
  subject,
  sender_name,
  sender_email,
  snippet,
  body_text,
  category,
  labels,
  tokenize = 'porter unicode61 "remove_diacritics=2"'
);
''';

  /// Virtual table definition for file & document full-text search.
  static const String createFilesFts = '''
CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
  file_id UNINDEXED,
  workspace_id UNINDEXED,
  file_name,
  file_extension,
  owner_name,
  extracted_text,
  tags,
  tokenize = 'porter unicode61 "remove_diacritics=2"'
);
''';

  /// Standard relational table for local cached email threads.
  static const String createLocalThreads = '''
CREATE TABLE IF NOT EXISTS local_threads (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  snippet TEXT NOT NULL,
  body_text TEXT,
  category TEXT NOT NULL DEFAULT 'primary',
  labels TEXT NOT NULL DEFAULT '[]',
  is_unread INTEGER NOT NULL DEFAULT 1,
  is_starred INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  has_attachments INTEGER NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 1,
  received_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  synced_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_threads_workspace_cat ON local_threads(workspace_id, category, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_unread ON local_threads(workspace_id, is_unread);
CREATE INDEX IF NOT EXISTS idx_threads_archived ON local_threads(workspace_id, is_archived);
''';

  /// Standard relational table for local cached QuantDrive files.
  static const String createLocalFiles = '''
CREATE TABLE IF NOT EXISTS local_files (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  extension TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL,
  extracted_text TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  is_vault INTEGER NOT NULL DEFAULT 0,
  is_starred INTEGER NOT NULL DEFAULT 0,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  local_path TEXT,
  updated_at INTEGER NOT NULL,
  synced_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_workspace ON local_files(workspace_id, updated_at DESC);
''';

  /// Resilient offline mutation queue for offline-first write replays.
  static const String createOfflineMutationQueue = '''
CREATE TABLE IF NOT EXISTS offline_mutation_queue (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_mutation_status ON offline_mutation_queue(status, created_at ASC);
''';

  /// Automatic trigger keeping threads_fts synchronized with local_threads inserts.
  static const String triggerThreadsInsert = '''
CREATE TRIGGER IF NOT EXISTS trg_threads_fts_ai AFTER INSERT ON local_threads BEGIN
  INSERT INTO threads_fts(rowid, thread_id, workspace_id, subject, sender_name, sender_email, snippet, body_text, category, labels)
  VALUES (new.rowid, new.id, new.workspace_id, new.subject, new.sender_name, new.sender_email, new.snippet, coalesce(new.body_text, ''), new.category, new.labels);
END;
''';

  /// Automatic trigger keeping threads_fts synchronized with local_threads deletes.
  static const String triggerThreadsDelete = '''
CREATE TRIGGER IF NOT EXISTS trg_threads_fts_ad AFTER DELETE ON local_threads BEGIN
  INSERT INTO threads_fts(threads_fts, rowid, thread_id, workspace_id, subject, sender_name, sender_email, snippet, body_text, category, labels)
  VALUES ('delete', old.rowid, old.id, old.workspace_id, old.subject, old.sender_name, old.sender_email, old.snippet, coalesce(old.body_text, ''), old.category, old.labels);
END;
''';

  /// Automatic trigger keeping threads_fts synchronized with local_threads updates.
  static const String triggerThreadsUpdate = '''
CREATE TRIGGER IF NOT EXISTS trg_threads_fts_au AFTER UPDATE ON local_threads BEGIN
  INSERT INTO threads_fts(threads_fts, rowid, thread_id, workspace_id, subject, sender_name, sender_email, snippet, body_text, category, labels)
  VALUES ('delete', old.rowid, old.id, old.workspace_id, old.subject, old.sender_name, old.sender_email, old.snippet, coalesce(old.body_text, ''), old.category, old.labels);
  INSERT INTO threads_fts(rowid, thread_id, workspace_id, subject, sender_name, sender_email, snippet, body_text, category, labels)
  VALUES (new.rowid, new.id, new.workspace_id, new.subject, new.sender_name, new.sender_email, new.snippet, coalesce(new.body_text, ''), new.category, new.labels);
END;
''';

  /// Automatic trigger keeping files_fts synchronized with local_files inserts.
  static const String triggerFilesInsert = '''
CREATE TRIGGER IF NOT EXISTS trg_files_fts_ai AFTER INSERT ON local_files BEGIN
  INSERT INTO files_fts(rowid, file_id, workspace_id, file_name, file_extension, owner_name, extracted_text, tags)
  VALUES (new.rowid, new.id, new.workspace_id, new.name, new.extension, '', coalesce(new.extracted_text, ''), new.tags);
END;
''';

  /// Automatic trigger keeping files_fts synchronized with local_files deletes.
  static const String triggerFilesDelete = '''
CREATE TRIGGER IF NOT EXISTS trg_files_fts_ad AFTER DELETE ON local_files BEGIN
  INSERT INTO files_fts(files_fts, rowid, file_id, workspace_id, file_name, file_extension, owner_name, extracted_text, tags)
  VALUES ('delete', old.rowid, old.id, old.workspace_id, old.name, old.extension, '', coalesce(old.extracted_text, ''), old.tags);
END;
''';
}

/// Instant search result with highlighted match excerpts.
class ThreadSearchResult {
  final String threadId;
  final String subject;
  final String senderName;
  final String senderEmail;
  final String snippet;
  final String category;
  final double score;
  final String highlightedSnippet;

  const ThreadSearchResult({
    required this.threadId,
    required this.subject,
    required this.senderName,
    required this.senderEmail,
    required this.snippet,
    required this.category,
    required this.score,
    required this.highlightedSnippet,
  });

  Map<String, dynamic> toJson() {
    return {
      'threadId': threadId,
      'subject': subject,
      'senderName': senderName,
      'senderEmail': senderEmail,
      'snippet': snippet,
      'category': category,
      'score': score,
      'highlightedSnippet': highlightedSnippet,
    };
  }
}

/// Instant file search result with relevance rank.
class FileSearchResult {
  final String fileId;
  final String fileName;
  final String fileExtension;
  final double score;
  final String highlightedMatch;

  const FileSearchResult({
    required this.fileId,
    required this.fileName,
    required this.fileExtension,
    required this.score,
    required this.highlightedMatch,
  });

  Map<String, dynamic> toJson() {
    return {
      'fileId': fileId,
      'fileName': fileName,
      'fileExtension': fileExtension,
      'score': score,
      'highlightedMatch': highlightedMatch,
    };
  }
}

/// Queued offline mutation item.
class OfflineMutationItem {
  final String id;
  final String workspaceId;
  final String entityType;
  final String entityId;
  final String action;
  final String payloadJson;
  final DateTime createdAt;
  final int retryCount;
  final String status;
  final String? errorMessage;

  const OfflineMutationItem({
    required this.id,
    required this.workspaceId,
    required this.entityType,
    required this.entityId,
    required this.action,
    required this.payloadJson,
    required this.createdAt,
    this.retryCount = 0,
    this.status = 'pending',
    this.errorMessage,
  });

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'workspaceId': workspaceId,
      'entityType': entityType,
      'entityId': entityId,
      'action': action,
      'payloadJson': payloadJson,
      'createdAt': createdAt.toIso8601String(),
      'retryCount': retryCount,
      'status': status,
      'errorMessage': errorMessage,
    };
  }
}

/// High-velocity query builder and coordinator providing sub-5ms FTS5 search.
class QuantFtsSearchCoordinator {
  /// Builds optimized prefix query for FTS5 matching.
  /// Converts `hello world` to `"hello"* AND "world"*`
  static String buildFtsQuery(String input) {
    final clean = input.replaceAll(RegExp(r'["\*\^]'), ' ').trim();
    if (clean.isEmpty) return '';

    final tokens = clean.split(RegExp(r'\s+')).where((t) => t.isNotEmpty);
    if (tokens.isEmpty) return '';

    return tokens.map((t) => '"\$t"*').join(' AND ');
  }

  /// Builds the high-speed BM25 search query for threads with snippet highlighting.
  /// Column weights in BM25:
  /// subject: 5.0, sender_name: 3.0, sender_email: 2.5, snippet: 2.0, body_text: 1.0, category: 1.5, labels: 1.5
  static String buildThreadsSearchSql({
    required String ftsQuery,
    String? workspaceId,
    String? category,
    int limit = 25,
  }) {
    final buffer = StringBuffer();
    buffer.writeln('SELECT');
    buffer.writeln('  thread_id,');
    buffer.writeln('  subject,');
    buffer.writeln('  sender_name,');
    buffer.writeln('  sender_email,');
    buffer.writeln('  snippet,');
    buffer.writeln('  category,');
    buffer.writeln('  bm25(threads_fts, 5.0, 3.0, 2.5, 2.0, 1.0, 1.5, 1.5) as score,');
    buffer.writeln("  snippet(threads_fts, 4, '<mark>', '</mark>', '...', 16) as hl_snippet");
    buffer.writeln('FROM threads_fts');
    buffer.writeln("WHERE threads_fts MATCH ?");

    if (workspaceId != null && workspaceId.isNotEmpty) {
      buffer.writeln("  AND workspace_id = '\$workspaceId'");
    }
    if (category != null && category.isNotEmpty) {
      buffer.writeln("  AND category = '\$category'");
    }

    buffer.writeln('ORDER BY score ASC'); // BM25 lower is more relevant in SQLite FTS5
    buffer.writeln('LIMIT \$limit;');

    return buffer.toString();
  }

  /// Builds high-speed BM25 search query for files and documents.
  static String buildFilesSearchSql({
    required String ftsQuery,
    String? workspaceId,
    int limit = 25,
  }) {
    final buffer = StringBuffer();
    buffer.writeln('SELECT');
    buffer.writeln('  file_id,');
    buffer.writeln('  file_name,');
    buffer.writeln('  file_extension,');
    buffer.writeln('  bm25(files_fts, 5.0, 2.0, 1.5, 1.0, 2.0) as score,');
    buffer.writeln("  snippet(files_fts, 4, '<mark>', '</mark>', '...', 16) as hl_text");
    buffer.writeln('FROM files_fts');
    buffer.writeln("WHERE files_fts MATCH ?");

    if (workspaceId != null && workspaceId.isNotEmpty) {
      buffer.writeln("  AND workspace_id = '\$workspaceId'");
    }

    buffer.writeln('ORDER BY score ASC');
    buffer.writeln('LIMIT \$limit;');

    return buffer.toString();
  }

  /// Parses thread results from SQLite raw query row output.
  static List<ThreadSearchResult> parseThreadResults(List<Map<String, dynamic>> rows) {
    return rows.map((r) {
      return ThreadSearchResult(
        threadId: r['thread_id'] as String? ?? '',
        subject: r['subject'] as String? ?? '',
        senderName: r['sender_name'] as String? ?? '',
        senderEmail: r['sender_email'] as String? ?? '',
        snippet: r['snippet'] as String? ?? '',
        category: r['category'] as String? ?? 'primary',
        score: (r['score'] as num?)?.toDouble() ?? 0.0,
        highlightedSnippet: r['hl_snippet'] as String? ?? r['snippet'] as String? ?? '',
      );
    }).toList();
  }

  /// Parses file results from SQLite raw query row output.
  static List<FileSearchResult> parseFileResults(List<Map<String, dynamic>> rows) {
    return rows.map((r) {
      return FileSearchResult(
        fileId: r['file_id'] as String? ?? '',
        fileName: r['file_name'] as String? ?? '',
        fileExtension: r['file_extension'] as String? ?? '',
        score: (r['score'] as num?)?.toDouble() ?? 0.0,
        highlightedMatch: r['hl_text'] as String? ?? r['file_name'] as String? ?? '',
      );
    }).toList();
  }
}
