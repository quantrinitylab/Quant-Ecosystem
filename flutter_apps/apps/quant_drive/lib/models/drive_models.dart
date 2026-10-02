import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';

/// File category for color-coded visual tokens and MIME routing.
enum DriveFileType {
  pdf,
  doc,
  code,
  zip,
  image,
  media,
  other;

  Color get color {
    switch (this) {
      case DriveFileType.pdf:
        return const Color(0xFFEF4444); // PDF Red
      case DriveFileType.doc:
        return const Color(0xFF38BDF8); // DOC Sky Blue
      case DriveFileType.code:
        return const Color(0xFF10B981); // CODE Green
      case DriveFileType.zip:
        return const Color(0xFFF59E0B); // ZIP Gold
      case DriveFileType.image:
        return const Color(0xFFA855F7); // Purple
      case DriveFileType.media:
        return const Color(0xFFEC4899); // Pink
      case DriveFileType.other:
        return QuantColors.textSecondary;
    }
  }

  IconData get icon {
    switch (this) {
      case DriveFileType.pdf:
        return Icons.picture_as_pdf_rounded;
      case DriveFileType.doc:
        return Icons.description_rounded;
      case DriveFileType.code:
        return Icons.terminal_rounded;
      case DriveFileType.zip:
        return Icons.folder_zip_rounded;
      case DriveFileType.image:
        return Icons.image_rounded;
      case DriveFileType.media:
        return Icons.movie_rounded;
      case DriveFileType.other:
        return Icons.insert_drive_file_rounded;
    }
  }

  String get label {
    switch (this) {
      case DriveFileType.pdf:
        return 'PDF';
      case DriveFileType.doc:
        return 'DOC';
      case DriveFileType.code:
        return 'CODE';
      case DriveFileType.zip:
        return 'ZIP';
      case DriveFileType.image:
        return 'IMG';
      case DriveFileType.media:
        return 'MEDIA';
      case DriveFileType.other:
        return 'FILE';
    }
  }
}

/// Sharing permission level.
enum SharePermission {
  viewer,
  editor,
  owner;

  String get label {
    switch (this) {
      case SharePermission.viewer:
        return 'Viewer';
      case SharePermission.editor:
        return 'Editor';
      case SharePermission.owner:
        return 'Owner';
    }
  }

  Color get color {
    switch (this) {
      case SharePermission.viewer:
        return QuantColors.sovereignCyan;
      case SharePermission.editor:
        return QuantColors.statusWarning;
      case SharePermission.owner:
        return QuantColors.statusSuccess;
    }
  }
}

/// Represents an immutable sovereign CAS snapshot of a file.
class FileVersion {
  final String versionId;
  final int versionNumber;
  final DateTime timestamp;
  final int sizeBytes;
  final String sha256Cas;
  final String author;
  final String changeSummary;
  final bool isCurrent;

  const FileVersion({
    required this.versionId,
    required this.versionNumber,
    required this.timestamp,
    required this.sizeBytes,
    required this.sha256Cas,
    required this.author,
    required this.changeSummary,
    this.isCurrent = false,
  });

  String get formattedSize {
    if (sizeBytes < 1024) return '$sizeBytes B';
    if (sizeBytes < 1024 * 1024) {
      return '${(sizeBytes / 1024).toStringAsFixed(1)} KB';
    }
    if (sizeBytes < 1024 * 1024 * 1024) {
      return '${(sizeBytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
    return '${(sizeBytes / (1024 * 1024 * 1024)).toStringAsFixed(2)} GB';
  }

  String get relativeTime {
    final now = DateTime.now();
    final difference = now.difference(timestamp);
    if (difference.inMinutes < 60) {
      return '${difference.inMinutes}m ago';
    }
    if (difference.inHours < 24) {
      return '${difference.inHours}h ago';
    }
    return '${difference.inDays}d ago';
  }

  FileVersion copyWith({
    String? versionId,
    int? versionNumber,
    DateTime? timestamp,
    int? sizeBytes,
    String? sha256Cas,
    String? author,
    String? changeSummary,
    bool? isCurrent,
  }) {
    return FileVersion(
      versionId: versionId ?? this.versionId,
      versionNumber: versionNumber ?? this.versionNumber,
      timestamp: timestamp ?? this.timestamp,
      sizeBytes: sizeBytes ?? this.sizeBytes,
      sha256Cas: sha256Cas ?? this.sha256Cas,
      author: author ?? this.author,
      changeSummary: changeSummary ?? this.changeSummary,
      isCurrent: isCurrent ?? this.isCurrent,
    );
  }
}

/// Telemetry metrics for FastCDC 64KB Gear Table CAS chunker.
class GearTableTelemetry {
  final double rawBytesGb;
  final double deduplicatedBytesGb;
  final double bandwidthSavedPercent;
  final int chunkCount;
  final int gearTableSize;
  final int nominalChunkSizeKb;
  final int minChunkSizeKb;
  final int maxChunkSizeKb;
  final double dedupRatio;
  final bool gearTableVerified;

  const GearTableTelemetry({
    required this.rawBytesGb,
    required this.deduplicatedBytesGb,
    required this.bandwidthSavedPercent,
    required this.chunkCount,
    this.gearTableSize = 256,
    this.nominalChunkSizeKb = 64,
    this.minChunkSizeKb = 16,
    this.maxChunkSizeKb = 128,
    required this.dedupRatio,
    this.gearTableVerified = true,
  });
}

/// Represents a sovereign file stored or chunked in QuantDrive.
class DriveItem {
  final String id;
  final String name;
  final DriveFileType fileType;
  final int sizeBytes;
  final DateTime modifiedAt;
  final bool isStarred;
  final bool isEncrypted;
  final bool isShared;
  final String? sharedBy;
  final String? sharedWith;
  final SharePermission permission;
  final String sha256Cas;
  final int dedupSavingsPercent;
  final int chunkCount;
  final String path;
  final List<FileVersion> versions;

  const DriveItem({
    required this.id,
    required this.name,
    required this.fileType,
    required this.sizeBytes,
    required this.modifiedAt,
    this.isStarred = false,
    this.isEncrypted = false,
    this.isShared = false,
    this.sharedBy,
    this.sharedWith,
    this.permission = SharePermission.viewer,
    required this.sha256Cas,
    this.dedupSavingsPercent = 0,
    this.chunkCount = 1,
    this.path = '/',
    this.versions = const [],
  });

  String get formattedSize {
    if (sizeBytes < 1024) return '$sizeBytes B';
    if (sizeBytes < 1024 * 1024) {
      return '${(sizeBytes / 1024).toStringAsFixed(1)} KB';
    }
    if (sizeBytes < 1024 * 1024 * 1024) {
      return '${(sizeBytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
    return '${(sizeBytes / (1024 * 1024 * 1024)).toStringAsFixed(2)} GB';
  }

  String get relativeTime {
    final now = DateTime.now();
    final difference = now.difference(modifiedAt);
    if (difference.inMinutes < 60) {
      return '${difference.inMinutes}m ago';
    }
    if (difference.inHours < 24) {
      return '${difference.inHours}h ago';
    }
    return '${difference.inDays}d ago';
  }

  DriveItem copyWith({
    String? id,
    String? name,
    DriveFileType? fileType,
    int? sizeBytes,
    DateTime? modifiedAt,
    bool? isStarred,
    bool? isEncrypted,
    bool? isShared,
    String? sharedBy,
    String? sharedWith,
    SharePermission? permission,
    String? sha256Cas,
    int? dedupSavingsPercent,
    int? chunkCount,
    String? path,
    List<FileVersion>? versions,
  }) {
    return DriveItem(
      id: id ?? this.id,
      name: name ?? this.name,
      fileType: fileType ?? this.fileType,
      sizeBytes: sizeBytes ?? this.sizeBytes,
      modifiedAt: modifiedAt ?? this.modifiedAt,
      isStarred: isStarred ?? this.isStarred,
      isEncrypted: isEncrypted ?? this.isEncrypted,
      isShared: isShared ?? this.isShared,
      sharedBy: sharedBy ?? this.sharedBy,
      sharedWith: sharedWith ?? this.sharedWith,
      permission: permission ?? this.permission,
      sha256Cas: sha256Cas ?? this.sha256Cas,
      dedupSavingsPercent: dedupSavingsPercent ?? this.dedupSavingsPercent,
      chunkCount: chunkCount ?? this.chunkCount,
      path: path ?? this.path,
      versions: versions ?? this.versions,
    );
  }
}

/// Represents a FastCDC deduplication cluster for cleaner view.
class FastCdcDuplicateCluster {
  final String clusterId;
  final String primaryHash;
  final int sharedChunkCount;
  final int reclaimableBytes;
  final List<DriveItem> duplicateFiles;

  const FastCdcDuplicateCluster({
    required this.clusterId,
    required this.primaryHash,
    required this.sharedChunkCount,
    required this.reclaimableBytes,
    required this.duplicateFiles,
  });

  String get formattedReclaimableSize {
    if (reclaimableBytes < 1024 * 1024) {
      return '${(reclaimableBytes / 1024).toStringAsFixed(1)} KB';
    }
    if (reclaimableBytes < 1024 * 1024 * 1024) {
      return '${(reclaimableBytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
    return '${(reclaimableBytes / (1024 * 1024 * 1024)).toStringAsFixed(2)} GB';
  }
}
