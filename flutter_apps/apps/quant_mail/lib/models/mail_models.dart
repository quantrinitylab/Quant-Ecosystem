import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';

/// Category lenses for inbox segmentation
enum MailCategoryLens {
  primary,
  updates,
  promotions,
  forums,
  vips,
}

extension MailCategoryLensExtension on MailCategoryLens {
  String get id {
    switch (this) {
      case MailCategoryLens.primary:
        return 'primary';
      case MailCategoryLens.updates:
        return 'updates';
      case MailCategoryLens.promotions:
        return 'promotions';
      case MailCategoryLens.forums:
        return 'forums';
      case MailCategoryLens.vips:
        return 'vips';
    }
  }

  String get label {
    switch (this) {
      case MailCategoryLens.primary:
        return 'Primary';
      case MailCategoryLens.updates:
        return 'Updates';
      case MailCategoryLens.promotions:
        return 'Promotions';
      case MailCategoryLens.forums:
        return 'Forums';
      case MailCategoryLens.vips:
        return 'VIPs';
    }
  }

  IconData get icon {
    switch (this) {
      case MailCategoryLens.primary:
        return Icons.inbox_rounded;
      case MailCategoryLens.updates:
        return Icons.notifications_active_outlined;
      case MailCategoryLens.promotions:
        return Icons.local_offer_outlined;
      case MailCategoryLens.forums:
        return Icons.forum_outlined;
      case MailCategoryLens.vips:
        return Icons.stars_rounded;
    }
  }

  Color get accentColor {
    switch (this) {
      case MailCategoryLens.primary:
        return QuantColors.moltenAmber;
      case MailCategoryLens.updates:
        return QuantColors.sovereignCyan;
      case MailCategoryLens.promotions:
        return QuantColors.sunsetGold;
      case MailCategoryLens.forums:
        return QuantColors.obsidianPurple;
      case MailCategoryLens.vips:
        return QuantColors.emeraldMatrix;
    }
  }
}

/// Cryptographic security telemetry headers
class MailHeaderSecurity {
  final String spf;
  final String dkim;
  final String dmarc;
  final String e2ee;
  final String tlsCipher;
  final String returnPath;
  final String mimeVersion;
  final double deliveryLatencyMs;
  final String messageId;
  final String sourceIp;

  // QM-UIUX-059: no fake security telemetry. Defaults are 'unknown';
  // real values come from the backend mail headers API.
  const MailHeaderSecurity({
    this.spf = 'unknown',
    this.dkim = 'unknown',
    this.dmarc = 'unknown',
    this.e2ee = 'unknown',
    this.tlsCipher = 'unknown',
    this.returnPath = 'unknown',
    this.mimeVersion = 'unknown',
    this.deliveryLatencyMs = -1,
    this.messageId = 'unknown',
    this.sourceIp = 'unknown',
  });
}

/// Attachment model with checksum and file details
class MailAttachment {
  final String id;
  final String name;
  final String fileType;
  final int sizeBytes;
  final String formattedSize;
  final String sha256;
  final IconData icon;

  const MailAttachment({
    required this.id,
    required this.name,
    required this.fileType,
    required this.sizeBytes,
    required this.formattedSize,
    required this.sha256,
    required this.icon,
  });
}

/// Interactive action item inside AI executive summary
class MailActionItem {
  final String id;
  final String title;
  bool isCompleted;

  MailActionItem({
    required this.id,
    required this.title,
    this.isCompleted = false,
  });
}

/// AI Executive summary with key points and actionable checklist
class MailAiSummary {
  final String summaryTitle;
  final int latencyMs;
  final List<String> keyPoints;
  final List<MailActionItem> actionItems;

  const MailAiSummary({
    required this.summaryTitle,
    required this.latencyMs,
    required this.keyPoints,
    required this.actionItems,
  });
}

/// Core Mail Thread Entity for QuantMail Superhuman Inbox
class MailThread {
  final String id;
  final String sender;
  final String senderEmail;
  final String senderInitials;
  final List<Color> avatarGradient;
  final bool isVerifiedDomain;
  final String recipient;
  final String subject;
  final String snippet;
  final String bodyHtml;
  final String timestamp;
  final String dateFormatted;
  final MailCategoryLens category;
  bool isUnread;
  bool isStarred;
  bool isArchived;
  bool isSnoozed;
  final bool isPriorityTriage;
  final String priorityShortcut;
  final List<MailAttachment> attachments;
  final MailHeaderSecurity security;
  final MailAiSummary aiSummary;
  final List<String> labels;

  MailThread({
    required this.id,
    required this.sender,
    required this.senderEmail,
    required this.senderInitials,
    required this.avatarGradient,
    this.isVerifiedDomain = true,
    this.recipient = 'Satyam <satyam@quantrinity.in>',
    required this.subject,
    required this.snippet,
    required this.bodyHtml,
    required this.timestamp,
    required this.dateFormatted,
    required this.category,
    this.isUnread = false,
    this.isStarred = false,
    this.isArchived = false,
    this.isSnoozed = false,
    this.isPriorityTriage = false,
    this.priorityShortcut = 'E',
    this.attachments = const [],
    this.security = const MailHeaderSecurity(),
    required this.aiSummary,
    this.labels = const [],
  });

  MailThread copyWith({
    bool? isUnread,
    bool? isStarred,
    bool? isArchived,
    bool? isSnoozed,
  }) {
    return MailThread(
      id: id,
      sender: sender,
      senderEmail: senderEmail,
      senderInitials: senderInitials,
      avatarGradient: avatarGradient,
      isVerifiedDomain: isVerifiedDomain,
      recipient: recipient,
      subject: subject,
      snippet: snippet,
      bodyHtml: bodyHtml,
      timestamp: timestamp,
      dateFormatted: dateFormatted,
      category: category,
      isUnread: isUnread ?? this.isUnread,
      isStarred: isStarred ?? this.isStarred,
      isArchived: isArchived ?? this.isArchived,
      isSnoozed: isSnoozed ?? this.isSnoozed,
      isPriorityTriage: isPriorityTriage,
      priorityShortcut: priorityShortcut,
      attachments: attachments,
      security: security,
      aiSummary: aiSummary,
      labels: labels,
    );
  }

  /// Sample production dataset reflecting sovereign ecosystem
  /// Demo threads are OFF by default: the UI is honest — it shows an empty
  /// state ("No mail yet") until real mail data arrives. Fake threads were
  /// removed in the v2 honesty pass (no invented senders like
  /// "Sundar Pichai <sundar@google.com>").
  static List<MailThread> sampleThreads() => <MailThread>[];
}
