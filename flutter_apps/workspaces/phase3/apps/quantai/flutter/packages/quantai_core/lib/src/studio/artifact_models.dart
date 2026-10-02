// ============================================================================
// quantai_core - studio: artifact domain models (chunk 1: artifact models)
//
// Quant Studio artifacts (QUANTAI_BLUEPRINT.md §3.7): Document / Page / App /
// Media — Muse-style artifacts, Quant flavor.
//
// Lifecycle: draft → preview → published, with archived as terminal parking.
// Publishing NEVER happens via a free method here — only PublishFlow
// (publish_flow.dart) may move preview → published, and only after a fresh
// PublishApprovalGateway approval (sentinel contract: no auto-publish).
// ============================================================================

/// The four artifact kinds Quant Studio produces.
enum ArtifactType {
  document,
  page,
  app,
  media;

  /// Wire value used in JSON payloads.
  String get wireValue => name;

  /// Defensive parse: unknown / missing values fall back to
  /// [ArtifactType.document] so unrecognized payloads never crash the Library.
  ///
  // TODO(UNVERIFIED): server-side artifact type vocabulary (client-created for now).
  static ArtifactType fromString(Object? value) {
    if (value is String) {
      final normalized = value.trim().toLowerCase();
      for (final type in ArtifactType.values) {
        if (type.name == normalized) return type;
      }
    }
    return ArtifactType.document;
  }
}

/// Draft → preview → published lifecycle.
///
/// `preview → published` is intentionally NOT a free transition:
/// [canTransitionTo] returns false for it and there is no `toPublished()`
/// method — only [PublishFlow] performs it after a fresh approval.
enum ArtifactLifecycle {
  draft,
  preview,
  published,
  archived;

  /// Wire value used in JSON payloads.
  String get wireValue => name;

  /// Defensive parse: unknown / missing values fall back to
  /// [ArtifactLifecycle.draft].
  static ArtifactLifecycle fromString(Object? value) {
    if (value is String) {
      final normalized = value.trim().toLowerCase();
      for (final state in ArtifactLifecycle.values) {
        if (state.name == normalized) return state;
      }
    }
    return ArtifactLifecycle.draft;
  }

  /// Whether a direct transition is allowed. `preview → published` is always
  /// false — publishing goes through PublishFlow (fresh sentinel approval).
  bool canTransitionTo(ArtifactLifecycle next) {
    switch (this) {
      case ArtifactLifecycle.draft:
        return next == ArtifactLifecycle.preview ||
            next == ArtifactLifecycle.archived;
      case ArtifactLifecycle.preview:
        return next == ArtifactLifecycle.draft ||
            next == ArtifactLifecycle.archived;
      case ArtifactLifecycle.published:
        return next == ArtifactLifecycle.archived;
      case ArtifactLifecycle.archived:
        return next == ArtifactLifecycle.draft;
    }
  }
}

/// Media sub-kind for [MediaArtifact].
enum MediaKind {
  image,
  audio,
  video;

  /// Wire value used in JSON payloads.
  String get wireValue => name;

  /// Defensive parse: unknown / missing values fall back to [MediaKind.image].
  ///
  // TODO(UNVERIFIED): server media-kind vocabulary (client-created for now).
  static MediaKind fromString(Object? value) {
    if (value is String) {
      final normalized = value.trim().toLowerCase();
      for (final kind in MediaKind.values) {
        if (kind.name == normalized) return kind;
      }
    }
    return MediaKind.image;
  }
}

String _asString(Object? value, [String fallback = '']) =>
    value is String ? value : fallback;

DateTime _asDateTime(Object? value) {
  if (value is String) {
    return DateTime.tryParse(value) ?? DateTime.fromMillisecondsSinceEpoch(0);
  }
  return DateTime.fromMillisecondsSinceEpoch(0);
}

/// Base of all Studio artifacts. Immutable and sealed so lifecycle
/// transitions and snapshots stay exhaustive.
sealed class StudioArtifact {
  final String id;
  final String title;
  final ArtifactLifecycle lifecycle;
  final DateTime createdAt;
  final DateTime updatedAt;

  /// Local path of the last static publish snapshot (null = never published).
  /// Set by the document/page builder (chunk 3) when it writes the file.
  final String? snapshotPath;

  /// Cross-app import source, e.g. `'quantcooks'` for a recipe imported as a
  /// doc. Null = created inside Studio.
  ///
  // TODO(UNVERIFIED): cross-app import envelope vocabulary (mesh team contract pending).
  final String? sourceApp;

  const StudioArtifact({
    required this.id,
    required this.title,
    required this.lifecycle,
    required this.createdAt,
    required this.updatedAt,
    this.snapshotPath,
    this.sourceApp,
  });

  ArtifactType get type;

  Map<String, dynamic> toJson();

  /// Shared JSON fields for every subtype.
  Map<String, dynamic> baseJson() => {
        'id': id,
        'title': title,
        'type': type.wireValue,
        'lifecycle': lifecycle.wireValue,
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
        if (snapshotPath != null) 'snapshotPath': snapshotPath,
        if (sourceApp != null) 'sourceApp': sourceApp,
      };
}

/// A markdown document artifact (report, note, recipe, plan…).
///
/// Chunk 3 (document builder) renders [markdown] → PDF/preview via the
/// template system (`studio/templates/`).
class DocumentArtifact extends StudioArtifact {
  final String markdown;
  final String? templateId;

  const DocumentArtifact({
    required super.id,
    required super.title,
    required super.lifecycle,
    required super.createdAt,
    required super.updatedAt,
    super.snapshotPath,
    super.sourceApp,
    required this.markdown,
    this.templateId,
  });

  @override
  ArtifactType get type => ArtifactType.document;

  DocumentArtifact copyWith({
    String? id,
    String? title,
    ArtifactLifecycle? lifecycle,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? snapshotPath,
    String? sourceApp,
    String? markdown,
    String? templateId,
  }) {
    return DocumentArtifact(
      id: id ?? this.id,
      title: title ?? this.title,
      lifecycle: lifecycle ?? this.lifecycle,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      snapshotPath: snapshotPath ?? this.snapshotPath,
      sourceApp: sourceApp ?? this.sourceApp,
      markdown: markdown ?? this.markdown,
      templateId: templateId ?? this.templateId,
    );
  }

  @override
  Map<String, dynamic> toJson() => {
        ...baseJson(),
        'markdown': markdown,
        if (templateId != null) 'templateId': templateId,
      };

  static DocumentArtifact fromJson(Map<String, dynamic> json) {
    return DocumentArtifact(
      id: _asString(json['id']),
      title: _asString(json['title']),
      lifecycle: ArtifactLifecycle.fromString(json['lifecycle']),
      createdAt: _asDateTime(json['createdAt']),
      updatedAt: _asDateTime(json['updatedAt']),
      snapshotPath: json['snapshotPath'] as String?,
      sourceApp: json['sourceApp'] as String?,
      markdown: _asString(json['markdown']),
      templateId: json['templateId'] as String?,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is DocumentArtifact &&
          id == other.id &&
          title == other.title &&
          lifecycle == other.lifecycle &&
          createdAt == other.createdAt &&
          updatedAt == other.updatedAt &&
          snapshotPath == other.snapshotPath &&
          sourceApp == other.sourceApp &&
          markdown == other.markdown &&
          templateId == other.templateId;

  @override
  int get hashCode => Object.hash(
        id,
        title,
        lifecycle,
        createdAt,
        updatedAt,
        snapshotPath,
        sourceApp,
        markdown,
        templateId,
      );
}

/// A static web page artifact, hosted from the VM on publish.
class PageArtifact extends StudioArtifact {
  /// Rendered static HTML snapshot. Pages publish as static snapshots only —
  /// no live app data (privacy law).
  final String htmlSnapshot;
  final String? publishedUrl;

  const PageArtifact({
    required super.id,
    required super.title,
    required super.lifecycle,
    required super.createdAt,
    required super.updatedAt,
    super.snapshotPath,
    super.sourceApp,
    required this.htmlSnapshot,
    this.publishedUrl,
  });

  @override
  ArtifactType get type => ArtifactType.page;

  PageArtifact copyWith({
    String? id,
    String? title,
    ArtifactLifecycle? lifecycle,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? snapshotPath,
    String? sourceApp,
    String? htmlSnapshot,
    String? publishedUrl,
  }) {
    return PageArtifact(
      id: id ?? this.id,
      title: title ?? this.title,
      lifecycle: lifecycle ?? this.lifecycle,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      snapshotPath: snapshotPath ?? this.snapshotPath,
      sourceApp: sourceApp ?? this.sourceApp,
      htmlSnapshot: htmlSnapshot ?? this.htmlSnapshot,
      publishedUrl: publishedUrl ?? this.publishedUrl,
    );
  }

  @override
  Map<String, dynamic> toJson() => {
        ...baseJson(),
        'htmlSnapshot': htmlSnapshot,
        if (publishedUrl != null) 'publishedUrl': publishedUrl,
      };

  static PageArtifact fromJson(Map<String, dynamic> json) {
    return PageArtifact(
      id: _asString(json['id']),
      title: _asString(json['title']),
      lifecycle: ArtifactLifecycle.fromString(json['lifecycle']),
      createdAt: _asDateTime(json['createdAt']),
      updatedAt: _asDateTime(json['updatedAt']),
      snapshotPath: json['snapshotPath'] as String?,
      sourceApp: json['sourceApp'] as String?,
      htmlSnapshot: _asString(json['htmlSnapshot']),
      publishedUrl: json['publishedUrl'] as String?,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PageArtifact &&
          id == other.id &&
          title == other.title &&
          lifecycle == other.lifecycle &&
          createdAt == other.createdAt &&
          updatedAt == other.updatedAt &&
          snapshotPath == other.snapshotPath &&
          sourceApp == other.sourceApp &&
          htmlSnapshot == other.htmlSnapshot &&
          publishedUrl == other.publishedUrl;

  @override
  int get hashCode => Object.hash(
        id,
        title,
        lifecycle,
        createdAt,
        updatedAt,
        snapshotPath,
        sourceApp,
        htmlSnapshot,
        publishedUrl,
      );
}

/// An interactive mini-app artifact. The app gets its own restart-proof DB;
/// data never leaves the VM — publish = static snapshot (blueprint §3.7).
class AppArtifact extends StudioArtifact {
  final String bundleName;

  /// JSON-encoded static manifest of the published snapshot.
  final String manifestJson;
  final int dataSchemaVersion;

  const AppArtifact({
    required super.id,
    required super.title,
    required super.lifecycle,
    required super.createdAt,
    required super.updatedAt,
    super.snapshotPath,
    super.sourceApp,
    required this.bundleName,
    required this.manifestJson,
    this.dataSchemaVersion = 1,
  });

  @override
  ArtifactType get type => ArtifactType.app;

  AppArtifact copyWith({
    String? id,
    String? title,
    ArtifactLifecycle? lifecycle,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? snapshotPath,
    String? sourceApp,
    String? bundleName,
    String? manifestJson,
    int? dataSchemaVersion,
  }) {
    return AppArtifact(
      id: id ?? this.id,
      title: title ?? this.title,
      lifecycle: lifecycle ?? this.lifecycle,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      snapshotPath: snapshotPath ?? this.snapshotPath,
      sourceApp: sourceApp ?? this.sourceApp,
      bundleName: bundleName ?? this.bundleName,
      manifestJson: manifestJson ?? this.manifestJson,
      dataSchemaVersion: dataSchemaVersion ?? this.dataSchemaVersion,
    );
  }

  @override
  Map<String, dynamic> toJson() => {
        ...baseJson(),
        'bundleName': bundleName,
        'manifestJson': manifestJson,
        'dataSchemaVersion': dataSchemaVersion,
      };

  static AppArtifact fromJson(Map<String, dynamic> json) {
    final version = json['dataSchemaVersion'];
    return AppArtifact(
      id: _asString(json['id']),
      title: _asString(json['title']),
      lifecycle: ArtifactLifecycle.fromString(json['lifecycle']),
      createdAt: _asDateTime(json['createdAt']),
      updatedAt: _asDateTime(json['updatedAt']),
      snapshotPath: json['snapshotPath'] as String?,
      sourceApp: json['sourceApp'] as String?,
      bundleName: _asString(json['bundleName']),
      manifestJson: _asString(json['manifestJson'], '{}'),
      dataSchemaVersion: version is int ? version : 1,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AppArtifact &&
          id == other.id &&
          title == other.title &&
          lifecycle == other.lifecycle &&
          createdAt == other.createdAt &&
          updatedAt == other.updatedAt &&
          snapshotPath == other.snapshotPath &&
          sourceApp == other.sourceApp &&
          bundleName == other.bundleName &&
          manifestJson == other.manifestJson &&
          dataSchemaVersion == other.dataSchemaVersion;

  @override
  int get hashCode => Object.hash(
        id,
        title,
        lifecycle,
        createdAt,
        updatedAt,
        snapshotPath,
        sourceApp,
        bundleName,
        manifestJson,
        dataSchemaVersion,
      );
}

/// A generated media artifact (image / audio / video).
///
/// Backend media endpoints are fragmented in the spec
/// (`app-foundations/quantai/openapi.yaml`): `/image-wizard/synthesize` is
/// prompt-synthesis only (no generation), `/api/ai/image/inpaint*` is
/// job-based with unverified semantics, `/voice/tts` exists but is flagged.
/// Media generation wiring lands in chunk 5 — until then generation calls
/// stay `TODO(UNVERIFIED)`.
class MediaArtifact extends StudioArtifact {
  final MediaKind kind;

  /// The prompt that produced (or should produce) this media.
  final String prompt;

  /// Local path of the generated file (null = not generated yet).
  final String? mediaPath;

  /// Parent artifact id for edit variations (null = original generation).
  final String? variationOf;

  const MediaArtifact({
    required super.id,
    required super.title,
    required super.lifecycle,
    required super.createdAt,
    required super.updatedAt,
    super.snapshotPath,
    super.sourceApp,
    required this.kind,
    required this.prompt,
    this.mediaPath,
    this.variationOf,
  });

  @override
  ArtifactType get type => ArtifactType.media;

  MediaArtifact copyWith({
    String? id,
    String? title,
    ArtifactLifecycle? lifecycle,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? snapshotPath,
    String? sourceApp,
    MediaKind? kind,
    String? prompt,
    String? mediaPath,
    String? variationOf,
  }) {
    return MediaArtifact(
      id: id ?? this.id,
      title: title ?? this.title,
      lifecycle: lifecycle ?? this.lifecycle,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      snapshotPath: snapshotPath ?? this.snapshotPath,
      sourceApp: sourceApp ?? this.sourceApp,
      kind: kind ?? this.kind,
      prompt: prompt ?? this.prompt,
      mediaPath: mediaPath ?? this.mediaPath,
      variationOf: variationOf ?? this.variationOf,
    );
  }

  @override
  Map<String, dynamic> toJson() => {
        ...baseJson(),
        'kind': kind.wireValue,
        'prompt': prompt,
        if (mediaPath != null) 'mediaPath': mediaPath,
        if (variationOf != null) 'variationOf': variationOf,
      };

  static MediaArtifact fromJson(Map<String, dynamic> json) {
    return MediaArtifact(
      id: _asString(json['id']),
      title: _asString(json['title']),
      lifecycle: ArtifactLifecycle.fromString(json['lifecycle']),
      createdAt: _asDateTime(json['createdAt']),
      updatedAt: _asDateTime(json['updatedAt']),
      snapshotPath: json['snapshotPath'] as String?,
      sourceApp: json['sourceApp'] as String?,
      kind: MediaKind.fromString(json['kind']),
      prompt: _asString(json['prompt']),
      mediaPath: json['mediaPath'] as String?,
      variationOf: json['variationOf'] as String?,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is MediaArtifact &&
          id == other.id &&
          title == other.title &&
          lifecycle == other.lifecycle &&
          createdAt == other.createdAt &&
          updatedAt == other.updatedAt &&
          snapshotPath == other.snapshotPath &&
          sourceApp == other.sourceApp &&
          kind == other.kind &&
          prompt == other.prompt &&
          mediaPath == other.mediaPath &&
          variationOf == other.variationOf;

  @override
  int get hashCode => Object.hash(
        id,
        title,
        lifecycle,
        createdAt,
        updatedAt,
        snapshotPath,
        sourceApp,
        kind,
        prompt,
        mediaPath,
        variationOf,
      );
}

/// Pure lifecycle transitions. All are side-effect free (return new
/// instances) and bump [StudioArtifact.updatedAt].
///
/// There is deliberately NO `toPublished()` here — publishing requires a
/// fresh sentinel approval and goes through [PublishFlow]. The low-level
/// [withLifecycle] escape hatch is documented for PublishFlow's use; calling
/// it directly bypasses approval.
extension StudioArtifactTransitions on StudioArtifact {
  /// Low-level lifecycle copy. Prefer [PublishFlow.publish] for publishing.
  StudioArtifact withLifecycle(
    ArtifactLifecycle lifecycle, {
    String? snapshotPath,
  }) {
    final now = DateTime.now();
    switch (this) {
      case DocumentArtifact self:
        return self.copyWith(
          lifecycle: lifecycle,
          updatedAt: now,
          snapshotPath: snapshotPath ?? self.snapshotPath,
        );
      case PageArtifact self:
        return self.copyWith(
          lifecycle: lifecycle,
          updatedAt: now,
          snapshotPath: snapshotPath ?? self.snapshotPath,
        );
      case AppArtifact self:
        return self.copyWith(
          lifecycle: lifecycle,
          updatedAt: now,
          snapshotPath: snapshotPath ?? self.snapshotPath,
        );
      case MediaArtifact self:
        return self.copyWith(
          lifecycle: lifecycle,
          updatedAt: now,
          snapshotPath: snapshotPath ?? self.snapshotPath,
        );
    }
  }

  void _require(ArtifactLifecycle from, String op) {
    if (lifecycle != from) {
      throw StateError(
        'Cannot $op from lifecycle ${lifecycle.wireValue} '
        '(artifact $id).',
      );
    }
  }

  /// draft → preview (enter review before publish).
  StudioArtifact toPreview() {
    _require(ArtifactLifecycle.draft, 'toPreview');
    return withLifecycle(ArtifactLifecycle.preview);
  }

  /// preview → draft (back to editing).
  StudioArtifact backToDraft() {
    _require(ArtifactLifecycle.preview, 'backToDraft');
    return withLifecycle(ArtifactLifecycle.draft);
  }

  /// Any non-archived state → archived.
  StudioArtifact archive() {
    if (lifecycle == ArtifactLifecycle.archived) {
      throw StateError('Artifact $id is already archived.');
    }
    return withLifecycle(ArtifactLifecycle.archived);
  }

  /// archived → draft (restore).
  StudioArtifact restore() {
    _require(ArtifactLifecycle.archived, 'restore');
    return withLifecycle(ArtifactLifecycle.draft);
  }
}
