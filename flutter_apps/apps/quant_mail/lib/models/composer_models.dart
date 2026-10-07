import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';

/// [EmailRecipient] Entity with Contact Autocomplete Metadata
class EmailRecipient {
  final String name;
  final String email;
  final String? avatarUrl;
  final bool isContact;

  const EmailRecipient({
    required this.name,
    required this.email,
    this.avatarUrl,
    this.isContact = false,
  });

  String get initials {
    if (name.isNotEmpty) {
      final parts = name.trim().split(' ');
      if (parts.length >= 2) {
        return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
      }
      return name.substring(0, name.length >= 2 ? 2 : 1).toUpperCase();
    }
    return email.substring(0, email.length >= 2 ? 2 : 1).toUpperCase();
  }

  String get displayLabel => name.isNotEmpty ? '$name <$email>' : email;

  Map<String, dynamic> toJson() => {
        'name': name,
        'email': email,
        'avatarUrl': avatarUrl,
        'isContact': isContact,
      };

  factory EmailRecipient.fromJson(Map<String, dynamic> json) => EmailRecipient(
        name: json['name'] as String? ?? '',
        email: json['email'] as String? ?? '',
        avatarUrl: json['avatarUrl'] as String?,
        isContact: json['isContact'] as bool? ?? false,
      );

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is EmailRecipient &&
          runtimeType == other.runtimeType &&
          email.toLowerCase() == other.email.toLowerCase();

  @override
  int get hashCode => email.toLowerCase().hashCode;

  /// Default Ecosystem Contacts for High-Fidelity Autocomplete
  static const List<EmailRecipient> sovereignContacts = [
    EmailRecipient(
      name: 'Sundar Pichai',
      email: 'sundar@google.com',
      isContact: true,
    ),
    EmailRecipient(
      name: 'Dev Sentinel',
      email: 'sentinel@quantrinity.lab',
      isContact: true,
    ),
    EmailRecipient(
      name: 'Satya Nadella',
      email: 'satya@microsoft.com',
      isContact: true,
    ),
    EmailRecipient(
      name: 'Alex Mercer',
      email: 'alex@trinity.lab',
      isContact: true,
    ),
    EmailRecipient(
      name: 'Jensen Huang',
      email: 'jensen@nvidia.com',
      isContact: true,
    ),
    EmailRecipient(
      name: 'Demis Hassabis',
      email: 'demis@deepmind.google.com',
      isContact: true,
    ),
  ];
}

/// [EmailAttachment] Entity with 25MB Guard Computations
class EmailAttachment {
  final String id;
  final String name;
  final int sizeBytes;
  final String mimeType;

  const EmailAttachment({
    required this.id,
    required this.name,
    required this.sizeBytes,
    required this.mimeType,
  });

  String get extension {
    final dotIndex = name.lastIndexOf('.');
    if (dotIndex != -1 && dotIndex < name.length - 1) {
      return name.substring(dotIndex + 1).toLowerCase();
    }
    return '';
  }

  IconData get icon {
    switch (extension) {
      case 'pdf':
        return Icons.picture_as_pdf_rounded;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'webp':
      case 'svg':
        return Icons.image_rounded;
      case 'zip':
      case 'tar':
      case 'gz':
      case '7z':
        return Icons.folder_zip_rounded;
      case 'mp4':
      case 'mov':
      case 'mkv':
        return Icons.video_file_rounded;
      case 'mp3':
      case 'wav':
      case 'flac':
        return Icons.audio_file_rounded;
      case 'dart':
      case 'ts':
      case 'js':
      case 'json':
      case 'py':
      case 'rs':
        return Icons.code_rounded;
      default:
        return Icons.insert_drive_file_rounded;
    }
  }

  String get formattedSize {
    if (sizeBytes < 1024) {
      return '$sizeBytes B';
    } else if (sizeBytes < 1024 * 1024) {
      return '${(sizeBytes / 1024).toStringAsFixed(1)} KB';
    } else {
      return '${(sizeBytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'sizeBytes': sizeBytes,
        'mimeType': mimeType,
      };

  factory EmailAttachment.fromJson(Map<String, dynamic> json) => EmailAttachment(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? 'attachment',
        sizeBytes: json['sizeBytes'] as int? ?? 0,
        mimeType: json['mimeType'] as String? ?? 'application/octet-stream',
      );
}

/// [EmailDraft] State Entity
class EmailDraft {
  final String id;
  final List<EmailRecipient> to;
  final List<EmailRecipient> cc;
  final List<EmailRecipient> bcc;
  final String subject;
  final String body;
  final List<EmailAttachment> attachments;
  final DateTime lastSaved;
  final bool isAutosaved;

  static const int maxAttachmentBytes = 25 * 1024 * 1024; // 25.0 MB Hard Limit

  const EmailDraft({
    required this.id,
    this.to = const [],
    this.cc = const [],
    this.bcc = const [],
    this.subject = '',
    this.body = '',
    this.attachments = const [],
    required this.lastSaved,
    this.isAutosaved = false,
  });

  int get totalAttachmentBytes =>
      attachments.fold(0, (sum, att) => sum + att.sizeBytes);

  bool get isOverAttachmentLimit => totalAttachmentBytes > maxAttachmentBytes;

  double get attachmentLimitRatio =>
      (totalAttachmentBytes / maxAttachmentBytes).clamp(0.0, 1.0);

  String get formattedTotalAttachmentSize {
    final bytes = totalAttachmentBytes;
    if (bytes < 1024 * 1024) {
      return '${(bytes / 1024).toStringAsFixed(1)} KB';
    }
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  bool get canSend =>
      to.isNotEmpty && !isOverAttachmentLimit;

  EmailDraft copyWith({
    String? id,
    List<EmailRecipient>? to,
    List<EmailRecipient>? cc,
    List<EmailRecipient>? bcc,
    String? subject,
    String? body,
    List<EmailAttachment>? attachments,
    DateTime? lastSaved,
    bool? isAutosaved,
  }) {
    return EmailDraft(
      id: id ?? this.id,
      to: to ?? this.to,
      cc: cc ?? this.cc,
      bcc: bcc ?? this.bcc,
      subject: subject ?? this.subject,
      body: body ?? this.body,
      attachments: attachments ?? this.attachments,
      lastSaved: lastSaved ?? this.lastSaved,
      isAutosaved: isAutosaved ?? this.isAutosaved,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'to': to.map((r) => r.toJson()).toList(),
        'cc': cc.map((r) => r.toJson()).toList(),
        'bcc': bcc.map((r) => r.toJson()).toList(),
        'subject': subject,
        'body': body,
        'attachments': attachments.map((a) => a.toJson()).toList(),
        'lastSaved': lastSaved.toIso8601String(),
        'isAutosaved': isAutosaved,
      };

  factory EmailDraft.fromJson(Map<String, dynamic> json) => EmailDraft(
        id: json['id'] as String? ?? 'draft-${DateTime.now().millisecondsSinceEpoch}',
        to: (json['to'] as List<dynamic>? ?? [])
            .map((e) => EmailRecipient.fromJson(e as Map<String, dynamic>))
            .toList(),
        cc: (json['cc'] as List<dynamic>? ?? [])
            .map((e) => EmailRecipient.fromJson(e as Map<String, dynamic>))
            .toList(),
        bcc: (json['bcc'] as List<dynamic>? ?? [])
            .map((e) => EmailRecipient.fromJson(e as Map<String, dynamic>))
            .toList(),
        subject: json['subject'] as String? ?? '',
        body: json['body'] as String? ?? '',
        attachments: (json['attachments'] as List<dynamic>? ?? [])
            .map((e) => EmailAttachment.fromJson(e as Map<String, dynamic>))
            .toList(),
        lastSaved: json['lastSaved'] != null
            ? DateTime.tryParse(json['lastSaved'] as String) ?? DateTime.now()
            : DateTime.now(),
        isAutosaved: json['isAutosaved'] as bool? ?? false,
      );

  static EmailDraft empty() => EmailDraft(
        id: 'draft-${DateTime.now().millisecondsSinceEpoch}',
        lastSaved: DateTime.now(),
      );
}

/// [DraftLocalStorage] Draft Autosave Manager (Zero Mock, In-Memory Local Persistence)
class DraftLocalStorage {
  static final DraftLocalStorage instance = DraftLocalStorage._();
  DraftLocalStorage._();

  EmailDraft? _savedDraft;

  EmailDraft? loadDraft() => _savedDraft;

  void saveDraft(EmailDraft draft) {
    _savedDraft = draft.copyWith(
      lastSaved: DateTime.now(),
      isAutosaved: true,
    );
  }

  void clearDraft() {
    _savedDraft = null;
  }
}
