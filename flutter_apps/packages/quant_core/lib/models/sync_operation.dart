import 'package:uuid/uuid.dart';

/// Status of an offline sync queue item
enum SyncStatus {
  pending,
  syncing,
  failed,
  synced,
}

/// Models an offline mutation queued for server synchronization.
class SyncOperation {
  final String id;
  final String entityType; // mail, calendar, drive, contact, git
  final String action; // create, update, delete, mark_read, star
  final String entityId;
  final Map<String, dynamic> payload;
  final DateTime createdAt;
  final int retryCount;
  final SyncStatus status;
  final String? lastError;

  SyncOperation({
    String? id,
    required this.entityType,
    required this.action,
    required this.entityId,
    required this.payload,
    DateTime? createdAt,
    this.retryCount = 0,
    this.status = SyncStatus.pending,
    this.lastError,
  })  : id = id ?? const Uuid().v4(),
        createdAt = createdAt ?? DateTime.now();

  SyncOperation copyWith({
    String? id,
    String? entityType,
    String? action,
    String? entityId,
    Map<String, dynamic>? payload,
    DateTime? createdAt,
    int? retryCount,
    SyncStatus? status,
    String? lastError,
  }) {
    return SyncOperation(
      id: id ?? this.id,
      entityType: entityType ?? this.entityType,
      action: action ?? this.action,
      entityId: entityId ?? this.entityId,
      payload: payload ?? this.payload,
      createdAt: createdAt ?? this.createdAt,
      retryCount: retryCount ?? this.retryCount,
      status: status ?? this.status,
      lastError: lastError ?? this.lastError,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'entity_type': entityType,
      'action': action,
      'entity_id': entityId,
      'payload': payload,
      'created_at': createdAt.toIso8601String(),
      'retry_count': retryCount,
      'status': status.name,
      'last_error': lastError,
    };
  }

  factory SyncOperation.fromMap(Map<String, dynamic> map) {
    return SyncOperation(
      id: map['id'] as String,
      entityType: map['entity_type'] as String,
      action: map['action'] as String,
      entityId: map['entity_id'] as String,
      payload: Map<String, dynamic>.from(map['payload'] as Map),
      createdAt: DateTime.parse(map['created_at'] as String),
      retryCount: (map['retry_count'] as num?)?.toInt() ?? 0,
      status: SyncStatus.values.byName(map['status'] as String? ?? 'pending'),
      lastError: map['last_error'] as String?,
    );
  }
}
