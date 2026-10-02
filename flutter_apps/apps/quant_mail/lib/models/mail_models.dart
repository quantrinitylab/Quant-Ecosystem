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

  const MailHeaderSecurity({
    this.spf = 'PASS',
    this.dkim = 'PASS',
    this.dmarc = 'PASS',
    this.e2ee = 'Quantum-Resistant Kyber-1024 + AES-256-GCM',
    this.tlsCipher = 'TLS_AES_256_GCM_SHA384 (TLS 1.3)',
    this.returnPath = '<bounces+349@trinity.lab>',
    this.mimeVersion = '1.0 (multipart/alternative)',
    this.deliveryLatencyMs = 1.8,
    this.messageId = '<msg-wave76-88f2@quantmail.in>',
    this.sourceIp = '198.51.100.42 (TLS 1.3 Encrypted)',
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
  static List<MailThread> sampleThreads() {
    return [
      MailThread(
        id: 'th-001',
        sender: 'Alex Mercer',
        senderEmail: 'alex@trinity.lab',
        senderInitials: 'AM',
        avatarGradient: const [Color(0xFFFF8C42), Color(0xFFF59E0B)],
        isVerifiedDomain: true,
        subject: 'Wave 76 Flutter Omni-Presence Architecture Released',
        snippet: 'The Flutter client is compiling across all devices with zero compromises. 120Hz Impeller hardware acceleration active.',
        bodyHtml: '''
Dear Satyam,

The unified sovereign architecture for Wave 76 is now fully operational across our multi-device fleet. All 5 pillars (Mail, Calendar, Drive, QuantDex, and QuantGit) share identical reactive state and cryptographic primitives.

Key Milestones Accomplished:
• Impeller 120Hz zero-allocation pipeline eliminates frame hitching.
• End-to-end encryption with post-quantum Kyber-1024 key encapsulation.
• Sub-5ms FTS5 localized search index across all local SQLite threads.
• Bi-directional CalDAV synchronization conforming strictly to RFC 5545.

Please inspect the attached technical specification and confirm sign-off for staging rollout.

Warm regards,
Alex Mercer
Lead Systems Architect, Trinity Labs
''',
        timestamp: '10:42 AM',
        dateFormatted: 'Today at 10:42:18 AM IST',
        category: MailCategoryLens.primary,
        isUnread: true,
        isStarred: true,
        isPriorityTriage: true,
        priorityShortcut: 'E',
        labels: const ['Architecture', 'Wave 76', 'VIP'],
        attachments: const [
          MailAttachment(
            id: 'att-001',
            name: 'Wave-76-Architecture-Spec.pdf',
            fileType: 'PDF',
            sizeBytes: 2516582,
            formattedSize: '2.4 MB',
            sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
            icon: Icons.picture_as_pdf_rounded,
          ),
          MailAttachment(
            id: 'att-002',
            name: 'Impeller-120Hz-Telemetry.json',
            fileType: 'JSON',
            sizeBytes: 86420,
            formattedSize: '84 KB',
            sha256: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
            icon: Icons.data_object_rounded,
          ),
        ],
        security: const MailHeaderSecurity(
          spf: 'PASS',
          dkim: 'PASS',
          dmarc: 'PASS',
          e2ee: 'Quantum-Resistant Kyber-1024 + AES-256-GCM',
          tlsCipher: 'TLS_AES_256_GCM_SHA384 (TLS 1.3)',
          returnPath: '<alex.mercer+bounces@trinity.lab>',
          mimeVersion: '1.0 (multipart/signed)',
          deliveryLatencyMs: 1.8,
          messageId: '<msg-w76-am01@quantmail.in>',
        ),
        aiSummary: MailAiSummary(
          summaryTitle: 'Wave 76 Architecture Brief',
          latencyMs: 3,
          keyPoints: const [
            'All 5 pillars unified under a single hardware-accelerated Flutter shell.',
            'Impeller 120Hz zero clipPath rendering prevents GPU overhead.',
            'Post-quantum Kyber-1024 E2EE verified across staging nodes.',
            'Sub-5ms FTS5 localized search achieves instantaneous triage.',
          ],
          actionItems: [
            MailActionItem(id: 'act-01', title: 'Review Wave-76-Architecture-Spec.pdf', isCompleted: false),
            MailActionItem(id: 'act-02', title: 'Confirm staging cluster rollout schedule', isCompleted: false),
            MailActionItem(id: 'act-03', title: 'Verify Kyber-1024 cipher test suite', isCompleted: true),
          ],
        ),
      ),
      MailThread(
        id: 'th-002',
        sender: 'Sundar Pichai',
        senderEmail: 'sundar@google.com',
        senderInitials: 'SP',
        avatarGradient: const [Color(0xFF38BDF8), Color(0xFF0284C7)],
        isVerifiedDomain: true,
        subject: 'Sync regarding Sovereign Search & E2EE Standards',
        snippet: 'Impressive work on the <5ms FTS5 index and FastCDC vault architecture. We would welcome a joint protocol discussion.',
        bodyHtml: '''
Hi Satyam,

I have been following the Quant Ecosystem progress with great interest, particularly your team's breakthroughs in sub-5ms localized indexing and content-defined chunking (FastCDC) for sovereign personal data.

Our team at Google would welcome a technical dialogue regarding interoperability standards for quantum-resistant email transport and localized AI privacy frameworks.

Let us schedule 30 minutes next week to explore alignment.

Best regards,
Sundar Pichai
Google LLC
''',
        timestamp: 'Yesterday',
        dateFormatted: 'Yesterday at 4:15:02 PM PST',
        category: MailCategoryLens.primary,
        isUnread: true,
        isStarred: true,
        isPriorityTriage: true,
        priorityShortcut: 'E',
        labels: const ['Sovereign', 'Standards', 'VIP'],
        attachments: const [
          MailAttachment(
            id: 'att-003',
            name: 'Sovereign-E2EE-Search-Standards.pdf',
            fileType: 'PDF',
            sizeBytes: 3984588,
            formattedSize: '3.8 MB',
            sha256: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
            icon: Icons.picture_as_pdf_rounded,
          ),
        ],
        security: const MailHeaderSecurity(
          spf: 'PASS',
          dkim: 'PASS',
          dmarc: 'PASS',
          e2ee: 'Google Sovereign Gateway E2EE (TLS 1.3)',
          tlsCipher: 'TLS_AES_256_GCM_SHA384 (TLS 1.3)',
          returnPath: '<sundar+direct@google.com>',
          deliveryLatencyMs: 2.1,
          messageId: '<msg-google-sp02@google.com>',
        ),
        aiSummary: MailAiSummary(
          summaryTitle: 'Google Sovereign Collaboration Brief',
          latencyMs: 4,
          keyPoints: const [
            'Sundar acknowledged Quant <5ms FTS5 local search and FastCDC vault speed.',
            'Requested 30-minute sync on quantum-resistant transport interoperability.',
            'Opportunity to position Quant Ecosystem as standard-setter for private AI.',
          ],
          actionItems: [
            MailActionItem(id: 'act-04', title: 'Schedule 30-min protocol sync slot via QuantCalendar', isCompleted: false),
            MailActionItem(id: 'act-05', title: 'Prepare FastCDC benchmark summary deck', isCompleted: false),
          ],
        ),
      ),
      MailThread(
        id: 'th-003',
        sender: 'GitHub CI/CD Bot',
        senderEmail: 'notifications@github.com',
        senderInitials: 'GH',
        avatarGradient: const [Color(0xFFA78BFA), Color(0xFF7C3AED)],
        isVerifiedDomain: true,
        subject: 'Build Succeeded: PR #349 Monorepo Cleanse & Wave 76 Test Pass',
        snippet: 'All unit and regression tests passed 100% green across 14 services. Impeller test harness verified with 0 frame drops.',
        bodyHtml: '''
Automated Workflow Report:

Repository: quantrinitylab/Quant-Ecosystem
Branch: main
Commit: d834f89 (Merge pull request #349)
Author: Quant Ecosystem Swarm Leads

Verification Summary:
- TypeScript Typecheck (tsc --noEmit): PASSED (0 errors)
- Unit & Integration Tests (Vitest): PASSED (412 tests green)
- Flutter Impeller Golden Tests: PASSED (120Hz baseline met)
- Fastify Microservices Health: 14/14 operational (<1.8ms response)

Artifacts generated:
- build-matrix-report.json
- coverage-summary.lcov
''',
        timestamp: '09:15 AM',
        dateFormatted: 'Today at 09:15:44 AM IST',
        category: MailCategoryLens.updates,
        isUnread: false,
        isStarred: false,
        isPriorityTriage: false,
        priorityShortcut: 'E',
        labels: const ['CI/CD', 'PR #349', 'Automation'],
        attachments: const [
          MailAttachment(
            id: 'att-004',
            name: 'build-matrix-report.json',
            fileType: 'JSON',
            sizeBytes: 430080,
            formattedSize: '420 KB',
            sha256: 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d',
            icon: Icons.data_object_rounded,
          ),
        ],
        security: const MailHeaderSecurity(
          spf: 'PASS',
          dkim: 'PASS',
          dmarc: 'PASS',
          e2ee: 'GitHub Enterprise Automation TLS 1.3',
          returnPath: '<noreply@github.com>',
          deliveryLatencyMs: 1.2,
          messageId: '<gh-action-349@github.com>',
        ),
        aiSummary: MailAiSummary(
          summaryTitle: 'CI/CD Pipeline Green Summary',
          latencyMs: 2,
          keyPoints: const [
            'All 412 monorepo unit and integration tests passed.',
            'Flutter Impeller golden tests verified at zero frame drops.',
            'Zero open regressions across 14 microservice pods.',
          ],
          actionItems: [
            MailActionItem(id: 'act-06', title: 'Tag release tag v1.76.0-stable', isCompleted: true),
          ],
        ),
      ),
      MailThread(
        id: 'th-004',
        sender: 'Elena Rostova',
        senderEmail: 'elena@cybervault.ch',
        senderInitials: 'ER',
        avatarGradient: const [Color(0xFF10B981), Color(0xFF059669)],
        isVerifiedDomain: true,
        subject: 'Quantum Key Distribution (QKD) Mesh Protocol Validation',
        snippet: 'Swiss cybervault audit completed. Our entropy tests verify 100% resistance against Shor algorithm attacks.',
        bodyHtml: '''
Greetings Satyam,

The independent security evaluation of the QuantMail quantum-resistant key exchange mesh is complete. Our Swiss cryptanalysis facility subjected your hybrid Kyber-1024 + Dilithium-5 implementation to full synthetic lattice attacks.

Results:
1. Zero side-channel leaks detected across constant-time cryptographic routines.
2. Perfect forward secrecy guarantees upheld under simulated key compromise.
3. Message integrity verification executed in under 2.4 microseconds.

Enclosed is the official Swiss CyberVault Certificate of Quantum Hardening.

In solidarity,
Dr. Elena Rostova
Director of Cryptographic Research, CyberVault AG
''',
        timestamp: 'Sep 29',
        dateFormatted: 'September 29, 2026 at 11:30:14 AM CEST',
        category: MailCategoryLens.vips,
        isUnread: true,
        isStarred: true,
        isPriorityTriage: true,
        priorityShortcut: 'E',
        labels: const ['Quantum', 'Security', 'VIP'],
        attachments: const [
          MailAttachment(
            id: 'att-005',
            name: 'QKD-Mesh-Validation-Report.pdf',
            fileType: 'PDF',
            sizeBytes: 5347737,
            formattedSize: '5.1 MB',
            sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
            icon: Icons.picture_as_pdf_rounded,
          ),
        ],
        security: const MailHeaderSecurity(
          spf: 'PASS',
          dkim: 'PASS',
          dmarc: 'PASS',
          e2ee: 'Swiss CyberVault QKD End-to-End Mesh',
          tlsCipher: 'TLS_AES_256_GCM_SHA384 (TLS 1.3)',
          returnPath: '<elena.rostova@cybervault.ch>',
          deliveryLatencyMs: 1.5,
          messageId: '<qkd-swiss-val-88@cybervault.ch>',
        ),
        aiSummary: MailAiSummary(
          summaryTitle: 'Quantum Audit Sign-Off Brief',
          latencyMs: 3,
          keyPoints: const [
            '100% resistance verified against Shor lattice factorization attacks.',
            'Zero side-channel leaks discovered in cryptographic constant-time routines.',
            'Official Swiss CyberVault Certificate of Quantum Hardening attached.',
          ],
          actionItems: [
            MailActionItem(id: 'act-07', title: 'Publish CyberVault validation certificate to security disclosure page', isCompleted: false),
            MailActionItem(id: 'act-08', title: 'Update E2EE whitepaper with Swiss audit parameters', isCompleted: false),
          ],
        ),
      ),
      MailThread(
        id: 'th-005',
        sender: 'Flutter Impeller Team',
        senderEmail: 'impeller-core@googlegroups.com',
        senderInitials: 'FC',
        avatarGradient: const [Color(0xFFE1306C), Color(0xFFC13584)],
        isVerifiedDomain: true,
        subject: 'RFC: 120Hz ProMotion Zero-Allocation Rendering Pipelines',
        snippet: 'Review discussion on hardware-accelerated rounded borders without Skia clipPath overhead.',
        bodyHtml: '''
Community Discussion:

Topic: Zero-Allocation UI Layouts for Mobile 120Hz ProMotion
Group: Flutter Impeller Engineering Working Group

Summary:
The transition to Impeller on iOS and Android eliminates legacy Skia shader compilation jank. As demonstrated by the Quant Ecosystem design system, avoiding CustomClipper clipPath calls in favor of BoxDecoration with BorderRadius allows the Impeller tessellator to run at pure 120fps hardware refresh rates.

We invite engineering contributions to benchmark these widgets against standard Material widgets.
''',
        timestamp: 'Sep 28',
        dateFormatted: 'September 28, 2026 at 8:04:12 PM UTC',
        category: MailCategoryLens.forums,
        isUnread: false,
        isStarred: false,
        isPriorityTriage: false,
        priorityShortcut: 'E',
        labels: const ['Impeller', 'Flutter', 'Performance'],
        attachments: const [],
        security: const MailHeaderSecurity(
          spf: 'PASS',
          dkim: 'PASS',
          dmarc: 'PASS',
          returnPath: '<impeller-core+owner@googlegroups.com>',
          deliveryLatencyMs: 2.4,
          messageId: '<google-groups-rfc-120@googlegroups.com>',
        ),
        aiSummary: MailAiSummary(
          summaryTitle: 'Impeller 120Hz Discussion Brief',
          latencyMs: 2,
          keyPoints: const [
            'Quant Ecosystem design system cited as best-in-class Impeller example.',
            'Avoiding clipPath enables 120fps sustained frame rates on ProMotion displays.',
          ],
          actionItems: [
            MailActionItem(id: 'act-09', title: 'Share Quant UI benchmark figures with Flutter engine team', isCompleted: true),
          ],
        ),
      ),
      MailThread(
        id: 'th-006',
        sender: 'AWS Cloud Advisory',
        senderEmail: 'cloud-advisory@aws.amazon.com',
        senderInitials: 'AW',
        avatarGradient: const [Color(0xFFF59E0B), Color(0xFFD97706)],
        isVerifiedDomain: true,
        subject: 'Invitation: Sovereign Multi-Region Hybrid Cloud Summit 2026',
        snippet: 'Exclusive executive roundtable on air-gapped sovereign Kubernetes clusters and local data residency.',
        bodyHtml: '''
Dear Executive Leader,

You are cordially invited to the AWS Sovereign Hybrid Cloud Executive Summit 2026 in Zurich, Switzerland.

Topics Include:
- Air-gapped bare-metal Kubernetes architectures
- Zero-trust sovereign data boundary enforcement
- Multi-cloud fallback pipelines with sub-millisecond automated failover

Please RSVP via your enterprise credentials.
''',
        timestamp: 'Sep 26',
        dateFormatted: 'September 26, 2026 at 2:00:00 PM CET',
        category: MailCategoryLens.promotions,
        isUnread: false,
        isStarred: false,
        isPriorityTriage: false,
        priorityShortcut: 'E',
        labels: const ['Conference', 'Sovereignty'],
        attachments: const [
          MailAttachment(
            id: 'att-006',
            name: 'AWS-Summit-Agenda.pdf',
            fileType: 'PDF',
            sizeBytes: 1887436,
            formattedSize: '1.8 MB',
            sha256: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
            icon: Icons.picture_as_pdf_rounded,
          ),
        ],
        security: const MailHeaderSecurity(
          spf: 'PASS',
          dkim: 'PASS',
          dmarc: 'PASS',
          returnPath: '<bounces@bounces.amazon.com>',
          deliveryLatencyMs: 3.1,
          messageId: '<aws-summit-2026@amazon.com>',
        ),
        aiSummary: MailAiSummary(
          summaryTitle: 'AWS Summit Invitation Brief',
          latencyMs: 3,
          keyPoints: const [
            'Exclusive executive session on air-gapped Kubernetes and data sovereignty.',
            'Location: Zurich, Switzerland.',
          ],
          actionItems: [
            MailActionItem(id: 'act-10', title: 'Evaluate attendance or send technical delegate', isCompleted: false),
          ],
        ),
      ),
    ];
  }
}
