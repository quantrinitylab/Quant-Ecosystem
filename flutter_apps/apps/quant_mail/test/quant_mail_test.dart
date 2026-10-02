import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';

import 'package:quant_mail/main.dart';
import 'package:quant_mail/models/mail_models.dart';
import 'package:quant_mail/models/composer_models.dart';
import 'package:quant_mail/screens/composer/undo_send_manager.dart';
import 'package:quant_mail/screens/composer/undo_send_bar.dart';
import 'package:quant_mail/screens/composer/email_composer_modal.dart';
import 'package:quant_mail/screens/mail/mail_inbox_screen.dart';
import 'package:quant_mail/screens/contacts/contacts_pillar_view.dart';
import 'package:quant_mail/screens/quantgit/quantgit_pillar_view.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // ===========================================================================
  // 1. DOMAIN MODEL UNIT TESTS
  // ===========================================================================
  group('QuantMail Domain Models Unit Tests', () {
    test('MailCategoryLens: Validates all 5 lenses, IDs, labels, icons and accent colors', () {
      expect(MailCategoryLens.values.length, 5);

      final expectedLenses = [
        MailCategoryLens.primary,
        MailCategoryLens.updates,
        MailCategoryLens.promotions,
        MailCategoryLens.forums,
        MailCategoryLens.vips,
      ];
      expect(MailCategoryLens.values, equals(expectedLenses));

      // 1. Primary Lens
      expect(MailCategoryLens.primary.id, 'primary');
      expect(MailCategoryLens.primary.label, 'Primary');
      expect(MailCategoryLens.primary.icon, Icons.inbox_rounded);
      expect(MailCategoryLens.primary.accentColor, QuantColors.moltenAmber);

      // 2. Updates Lens
      expect(MailCategoryLens.updates.id, 'updates');
      expect(MailCategoryLens.updates.label, 'Updates');
      expect(MailCategoryLens.updates.icon, Icons.notifications_active_outlined);
      expect(MailCategoryLens.updates.accentColor, QuantColors.sovereignCyan);

      // 3. Promotions Lens
      expect(MailCategoryLens.promotions.id, 'promotions');
      expect(MailCategoryLens.promotions.label, 'Promotions');
      expect(MailCategoryLens.promotions.icon, Icons.local_offer_outlined);
      expect(MailCategoryLens.promotions.accentColor, QuantColors.sunsetGold);

      // 4. Forums Lens
      expect(MailCategoryLens.forums.id, 'forums');
      expect(MailCategoryLens.forums.label, 'Forums');
      expect(MailCategoryLens.forums.icon, Icons.forum_outlined);
      expect(MailCategoryLens.forums.accentColor, QuantColors.obsidianPurple);

      // 5. VIPs Lens
      expect(MailCategoryLens.vips.id, 'vips');
      expect(MailCategoryLens.vips.label, 'VIPs');
      expect(MailCategoryLens.vips.icon, Icons.stars_rounded);
      expect(MailCategoryLens.vips.accentColor, QuantColors.emeraldMatrix);
    });

    test('MailThread: Validates sample dataset, copyWith, security telemetry, and AI summary', () {
      final sampleThreads = MailThread.sampleThreads();
      expect(sampleThreads.isNotEmpty, isTrue);
      expect(sampleThreads.length, 6);

      final thread1 = sampleThreads.first;
      expect(thread1.id, 'th-001');
      expect(thread1.sender, 'Alex Mercer');
      expect(thread1.senderEmail, 'alex@trinity.lab');
      expect(thread1.category, MailCategoryLens.primary);
      expect(thread1.isUnread, isTrue);
      expect(thread1.isStarred, isTrue);
      expect(thread1.isPriorityTriage, isTrue);
      expect(thread1.priorityShortcut, 'E');

      // Security telemetry verification
      expect(thread1.security.spf, 'PASS');
      expect(thread1.security.dkim, 'PASS');
      expect(thread1.security.dmarc, 'PASS');
      expect(thread1.security.e2ee.contains('Kyber-1024'), isTrue);
      expect(thread1.security.deliveryLatencyMs, lessThan(5.0));

      // AI Summary verification
      expect(thread1.aiSummary.summaryTitle, 'Wave 76 Architecture Brief');
      expect(thread1.aiSummary.keyPoints.length, 4);
      expect(thread1.aiSummary.actionItems.length, 3);
      expect(thread1.aiSummary.actionItems.first.isCompleted, isFalse);

      // Action Item toggle mutation
      thread1.aiSummary.actionItems.first.isCompleted = true;
      expect(thread1.aiSummary.actionItems.first.isCompleted, isTrue);

      // Attachments verification
      expect(thread1.attachments.length, 2);
      expect(thread1.attachments.first.name, 'Wave-76-Architecture-Spec.pdf');
      expect(thread1.attachments.first.fileType, 'PDF');
      expect(thread1.attachments.first.sha256.length, 64);

      // copyWith immutable state transition
      final archivedThread = thread1.copyWith(
        isArchived: true,
        isUnread: false,
        isStarred: false,
      );
      expect(archivedThread.isArchived, isTrue);
      expect(archivedThread.isUnread, isFalse);
      expect(archivedThread.isStarred, isFalse);
      expect(archivedThread.id, thread1.id);
      expect(archivedThread.subject, thread1.subject);
    });

    test('EmailRecipient: Initials generation, displayLabel, case-insensitive equality, and JSON serialization', () {
      // 1. Multi-word name
      const recipient1 = EmailRecipient(
        name: 'Sundar Pichai',
        email: 'sundar@google.com',
        isContact: true,
      );
      expect(recipient1.initials, 'SP');
      expect(recipient1.displayLabel, 'Sundar Pichai <sundar@google.com>');

      // 2. Single-word name
      const recipient2 = EmailRecipient(
        name: 'Satyam',
        email: 'satyam@quantrinity.in',
      );
      expect(recipient2.initials, 'SA');

      // 3. Empty name falls back to email prefix
      const recipient3 = EmailRecipient(
        name: '',
        email: 'dev@quantmail.in',
      );
      expect(recipient3.initials, 'DE');
      expect(recipient3.displayLabel, 'dev@quantmail.in');

      // 4. Equality and HashCode by case-insensitive email
      const recipientCaseA = EmailRecipient(
        name: 'Sundar',
        email: 'SUNDAR@GOOGLE.COM',
      );
      const recipientCaseB = EmailRecipient(
        name: 'Sundar P.',
        email: 'sundar@google.com',
      );
      expect(recipientCaseA, equals(recipientCaseB));
      expect(recipientCaseA.hashCode, equals(recipientCaseB.hashCode));

      // 5. JSON serialization roundtrip
      final json = recipient1.toJson();
      expect(json['name'], 'Sundar Pichai');
      expect(json['email'], 'sundar@google.com');
      expect(json['isContact'], isTrue);

      final deserialized = EmailRecipient.fromJson(json);
      expect(deserialized, equals(recipient1));
      expect(deserialized.name, recipient1.name);

      // 6. Sovereign contacts registry presence
      expect(EmailRecipient.sovereignContacts.length, greaterThanOrEqualTo(5));
      expect(EmailRecipient.sovereignContacts.any((c) => c.name == 'Demis Hassabis'), isTrue);
      expect(EmailRecipient.sovereignContacts.any((c) => c.email == 'alex@trinity.lab'), isTrue);
    });

    test('EmailAttachment: File extensions, formattedSize, icon mapping, and JSON roundtrip', () {
      const pdfAttachment = EmailAttachment(
        id: 'att-1',
        name: 'architecture-spec.pdf',
        sizeBytes: 2400000,
        mimeType: 'application/pdf',
      );
      expect(pdfAttachment.extension, 'pdf');
      expect(pdfAttachment.formattedSize, '2.3 MB');
      expect(pdfAttachment.icon, Icons.picture_as_pdf_rounded);

      const smallAttachment = EmailAttachment(
        id: 'att-2',
        name: 'small_log.txt',
        sizeBytes: 512,
        mimeType: 'text/plain',
      );
      expect(smallAttachment.formattedSize, '512 B');

      const kbAttachment = EmailAttachment(
        id: 'att-3',
        name: 'telemetry.json',
        sizeBytes: 15360,
        mimeType: 'application/json',
      );
      expect(kbAttachment.formattedSize, '15.0 KB');
      expect(kbAttachment.icon, Icons.code_rounded);

      // JSON roundtrip
      final json = pdfAttachment.toJson();
      expect(json['id'], 'att-1');
      expect(json['name'], 'architecture-spec.pdf');
      expect(json['sizeBytes'], 2400000);

      final deserialized = EmailAttachment.fromJson(json);
      expect(deserialized.id, pdfAttachment.id);
      expect(deserialized.name, pdfAttachment.name);
      expect(deserialized.sizeBytes, pdfAttachment.sizeBytes);
    });

    test('EmailDraft: 25MB Guard limits, byte computations, canSend rules, autosave storage', () {
      final now = DateTime.now();
      final emptyDraft = EmailDraft.empty();
      expect(emptyDraft.id.startsWith('draft-'), isTrue);
      expect(emptyDraft.to, isEmpty);
      expect(emptyDraft.attachments, isEmpty);
      expect(emptyDraft.canSend, isFalse); // No recipient

      // Valid draft within 25MB boundary
      final validDraft = EmailDraft(
        id: 'draft-101',
        to: const [
          EmailRecipient(name: 'Alex Mercer', email: 'alex@trinity.lab'),
        ],
        subject: 'QuantMail Impeller Integration',
        body: 'Zero clipPath verified.',
        attachments: const [
          EmailAttachment(
            id: 'att-1',
            name: 'spec.pdf',
            sizeBytes: 10 * 1024 * 1024, // 10 MB
            mimeType: 'application/pdf',
          ),
          EmailAttachment(
            id: 'att-2',
            name: 'code.zip',
            sizeBytes: 12 * 1024 * 1024, // 12 MB
            mimeType: 'application/zip',
          ),
        ],
        lastSaved: now,
      );

      expect(validDraft.totalAttachmentBytes, 22 * 1024 * 1024);
      expect(validDraft.isOverAttachmentLimit, isFalse);
      expect(validDraft.canSend, isTrue);
      expect(validDraft.formattedTotalAttachmentSize, '22.0 MB');
      expect(validDraft.attachmentLimitRatio, closeTo(22 / 25, 0.01));

      // Over 25MB limit draft
      final overLimitDraft = validDraft.copyWith(
        attachments: [
          ...validDraft.attachments,
          const EmailAttachment(
            id: 'att-3',
            name: 'dataset.tar',
            sizeBytes: 5 * 1024 * 1024, // +5 MB = 27 MB total (> 25MB)
            mimeType: 'application/x-tar',
          ),
        ],
      );

      expect(overLimitDraft.totalAttachmentBytes, 27 * 1024 * 1024);
      expect(overLimitDraft.isOverAttachmentLimit, isTrue);
      expect(overLimitDraft.canSend, isFalse); // Blocked by 25MB guard
      expect(overLimitDraft.attachmentLimitRatio, 1.0); // Clamped

      // JSON serialization roundtrip
      final json = validDraft.toJson();
      expect(json['id'], 'draft-101');
      expect(json['subject'], 'QuantMail Impeller Integration');
      expect((json['to'] as List).length, 1);
      expect((json['attachments'] as List).length, 2);

      final deserialized = EmailDraft.fromJson(json);
      expect(deserialized.id, validDraft.id);
      expect(deserialized.subject, validDraft.subject);
      expect(deserialized.to.first.email, 'alex@trinity.lab');
      expect(deserialized.attachments.length, 2);

      // DraftLocalStorage In-Memory singleton tests
      final storage = DraftLocalStorage.instance;
      storage.clearDraft();
      expect(storage.loadDraft(), isNull);

      storage.saveDraft(validDraft);
      final loaded = storage.loadDraft();
      expect(loaded, isNotNull);
      expect(loaded!.id, validDraft.id);
      expect(loaded.isAutosaved, isTrue);

      storage.clearDraft();
      expect(storage.loadDraft(), isNull);
    });

    test('UndoSendManager: State machine transitions, countdown parameters, recall, and sendNow', () {
      final manager = UndoSendManager.instance;
      manager.dismiss();

      expect(manager.state, UndoSendState.idle);
      expect(manager.isQueued, isFalse);
      expect(manager.isSending, isFalse);
      expect(manager.isVisible, isFalse);
      expect(manager.remainingSeconds, 10);
      expect(manager.progress, 1.0);

      final draft = EmailDraft(
        id: 'draft-undo-test',
        to: const [EmailRecipient(name: 'Demis', email: 'demis@deepmind.google')],
        subject: 'Sovereign Swarm Architecture',
        lastSaved: DateTime.now(),
      );

      bool finalSendCalled = false;
      bool recallCalled = false;
      String? toastMessage;

      // 1. Enqueue draft into 10s countdown queue
      manager.enqueueDraft(
        draft: draft,
        onFinalSend: (d) async => finalSendCalled = true,
        onRecall: (d) => recallCalled = true,
        onStatusToast: (msg) => toastMessage = msg,
      );

      expect(manager.state, UndoSendState.queued);
      expect(manager.isQueued, isTrue);
      expect(manager.isVisible, isTrue);
      expect(manager.activeDraft, equals(draft));
      expect(manager.remainingSeconds, 10);
      expect(manager.progress, 1.0);

      // 2. Immediate Undo recall action
      manager.undo();

      expect(recallCalled, isTrue);
      expect(toastMessage, contains('Email recalled successfully'));
      expect(manager.state, UndoSendState.idle);
      expect(manager.isQueued, isFalse);

      // 3. Test sendNow immediate flush
      recallCalled = false;
      finalSendCalled = false;

      manager.enqueueDraft(
        draft: draft,
        onFinalSend: (d) async => finalSendCalled = true,
        onRecall: (d) => recallCalled = true,
      );
      expect(manager.isQueued, isTrue);

      manager.sendNow();
      expect(finalSendCalled, isTrue);

      manager.dismiss();
      expect(manager.state, UndoSendState.idle);
    });
  });

  // ===========================================================================
  // 2. WIDGET TESTS FOR QuantMailApp & MailInboxScreen
  // ===========================================================================
  group('QuantMailApp & MailInboxScreen Widget Tests', () {
    testWidgets('QuantMailApp initializes cleanly with Obsidian Dark theme and home Inbox', (tester) async {
      await tester.pumpWidget(const QuantMailApp());
      await tester.pump();

      // Verify Application Title and branding
      expect(find.text('Quant'), findsOneWidget);
      expect(find.text('Mail'), findsOneWidget);

      // Verify Superhuman Core AI Capsule (<5ms FTS5)
      expect(find.text('Superhuman Core'), findsOneWidget);
      expect(find.text('<5ms FTS5'), findsOneWidget);

      // Verify Inbox Screen rendered
      expect(find.byType(MailInboxScreen), findsOneWidget);

      // Verify Search hint bar
      expect(find.textContaining('<5ms local FTS5'), findsOneWidget);
    });

    testWidgets('MailInboxScreen: Category lenses switching across all 5 lenses', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const MailInboxScreen(),
        ),
      );
      await tester.pump();

      // Check all 5 Category Lenses present in the horizontal tab bar
      expect(find.text('Primary'), findsOneWidget);
      expect(find.text('Updates'), findsOneWidget);
      expect(find.text('Promotions'), findsOneWidget);
      expect(find.text('Forums'), findsOneWidget);
      expect(find.text('VIPs'), findsOneWidget);

      // By default, Primary lens is active: shows Alex Mercer & Sundar Pichai
      expect(find.text('Wave 76 Flutter Omni-Presence Architecture Released'), findsOneWidget);
      expect(find.text('Sync regarding Sovereign Search & E2EE Standards'), findsOneWidget);

      // 1. Switch to 'Updates' Lens
      await tester.tap(find.text('Updates'));
      await tester.pumpAndSettle();

      // Updates lens contains GitHub CI/CD Bot PR #349 thread
      expect(find.text('Build Succeeded: PR #349 Monorepo Cleanse & Wave 76 Test Pass'), findsOneWidget);
      expect(find.text('Wave 76 Flutter Omni-Presence Architecture Released'), findsNothing);

      // 2. Switch to 'VIPs' Lens
      await tester.tap(find.text('VIPs'));
      await tester.pumpAndSettle();

      // VIPs lens contains Dr. Elena Rostova QKD thread
      expect(find.text('Quantum Key Distribution (QKD) Mesh Protocol Validation'), findsOneWidget);

      // 3. Switch to 'Forums' Lens
      await tester.tap(find.text('Forums'));
      await tester.pumpAndSettle();

      // Forums lens contains Flutter Impeller Team RFC
      expect(find.text('RFC: 120Hz ProMotion Zero-Allocation Rendering Pipelines'), findsOneWidget);

      // 4. Switch to 'Promotions' Lens
      await tester.tap(find.text('Promotions'));
      await tester.pumpAndSettle();

      // Promotions lens contains AWS Cloud Advisory Summit thread
      expect(find.text('Invitation: Sovereign Multi-Region Hybrid Cloud Summit 2026'), findsOneWidget);

      // 5. Switch back to 'Primary' Lens
      await tester.tap(find.text('Primary'));
      await tester.pumpAndSettle();

      expect(find.text('Wave 76 Flutter Omni-Presence Architecture Released'), findsOneWidget);
    });

    testWidgets('MailInboxScreen: Search query filtering (<5ms index) and clear action', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const MailInboxScreen(),
        ),
      );
      await tester.pump();

      // Initially both Primary threads are present
      expect(find.text('Wave 76 Flutter Omni-Presence Architecture Released'), findsOneWidget);
      expect(find.text('Sync regarding Sovereign Search & E2EE Standards'), findsOneWidget);

      // Locate search TextField
      final searchField = find.byType(TextField).first;
      expect(searchField, findsOneWidget);

      // Enter search query targeting 'Wave 76'
      await tester.enterText(searchField, 'Wave 76');
      await tester.pump();

      // Matching thread remains, non-matching thread is filtered out
      expect(find.text('Wave 76 Flutter Omni-Presence Architecture Released'), findsOneWidget);
      expect(find.text('Sync regarding Sovereign Search & E2EE Standards'), findsNothing);

      // Enter search query targeting 'Sundar'
      await tester.enterText(searchField, 'Sundar');
      await tester.pump();

      expect(find.text('Wave 76 Flutter Omni-Presence Architecture Released'), findsNothing);
      expect(find.text('Sync regarding Sovereign Search & E2EE Standards'), findsOneWidget);

      // Clear search query
      await tester.enterText(searchField, '');
      await tester.pump();

      // Both threads restored
      expect(find.text('Wave 76 Flutter Omni-Presence Architecture Released'), findsOneWidget);
      expect(find.text('Sync regarding Sovereign Search & E2EE Standards'), findsOneWidget);
    });

    testWidgets('MailInboxScreen: Long-press multi-select toggle, selection header, and actions', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const MailInboxScreen(),
        ),
      );
      await tester.pump();

      // Selection header not visible initially
      expect(find.textContaining('selected'), findsNothing);

      // Long press on first thread card to enter multi-select mode
      final threadCard = find.text('Wave 76 Flutter Omni-Presence Architecture Released');
      await tester.longPress(threadCard);
      await tester.pump();

      // Contextual SelectionHeader appears
      expect(find.text('1 selected'), findsOneWidget);
      expect(find.byIcon(Icons.select_all_rounded), findsOneWidget);
      expect(find.byIcon(Icons.archive_outlined), findsOneWidget);
      expect(find.byIcon(Icons.mark_email_read_outlined), findsOneWidget);
      expect(find.byIcon(Icons.delete_outline_rounded), findsOneWidget);

      // Tap 'Select All'
      await tester.tap(find.byIcon(Icons.select_all_rounded));
      await tester.pump();

      // Both threads selected
      expect(find.text('2 selected'), findsOneWidget);

      // Tap Close button on selection header to clear selection
      await tester.tap(find.byIcon(Icons.close_rounded));
      await tester.pump();

      // Normal top header restored
      expect(find.textContaining('selected'), findsNothing);
      expect(find.text('Quant'), findsOneWidget);
      expect(find.text('Mail'), findsOneWidget);
    });
  });

  // ===========================================================================
  // 3. WIDGET TESTS FOR UndoSendBar & UndoSendManager
  // ===========================================================================
  group('UndoSendBar & UndoSendManager Widget Tests', () {
    setUp(() {
      UndoSendManager.instance.dismiss();
    });

    tearDown(() {
      UndoSendManager.instance.dismiss();
    });

    testWidgets('UndoSendBar: 10s countdown trigger, recipient snippet, and instant Undo (Z) recall', (tester) async {
      final manager = UndoSendManager.instance;
      bool undoTapped = false;
      bool recalled = false;

      final testDraft = EmailDraft(
        id: 'draft-undo-widget-1',
        to: const [EmailRecipient(name: 'Alex Mercer', email: 'alex@trinity.lab')],
        subject: 'Test Subject',
        lastSaved: DateTime.now(),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            body: Stack(
              children: [
                UndoSendBar(
                  manager: manager,
                  onUndoTapped: () => undoTapped = true,
                ),
              ],
            ),
          ),
        ),
      );
      await tester.pump();

      // Initially bar is not queued
      expect(manager.isQueued, isFalse);

      // Enqueue draft
      manager.enqueueDraft(
        draft: testDraft,
        onFinalSend: (d) async {},
        onRecall: (d) => recalled = true,
      );
      await tester.pump();

      // Verify UI displays active 10s countdown and recipient
      expect(find.text('Sending in 10s...'), findsOneWidget);
      expect(find.text('To: Alex Mercer'), findsOneWidget);
      expect(find.text('Undo (Z)'), findsOneWidget);
      expect(find.text('Send Now'), findsOneWidget);

      // Tap Undo (Z) button
      await tester.tap(find.text('Undo (Z)'));
      await tester.pump();

      expect(undoTapped, isTrue);
      expect(recalled, isTrue);
      expect(manager.state, UndoSendState.idle);
    });

    testWidgets('UndoSendBar: Send Now flushes queue immediately', (tester) async {
      final manager = UndoSendManager.instance;
      bool sendNowTapped = false;
      bool finalSent = false;

      final testDraft = EmailDraft(
        id: 'draft-undo-widget-2',
        to: const [EmailRecipient(name: 'Satya Nadella', email: 'satya@microsoft.com')],
        subject: 'Enterprise Sync',
        lastSaved: DateTime.now(),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            body: Stack(
              children: [
                UndoSendBar(
                  manager: manager,
                  onSendNowTapped: () => sendNowTapped = true,
                ),
              ],
            ),
          ),
        ),
      );
      await tester.pump();

      manager.enqueueDraft(
        draft: testDraft,
        onFinalSend: (d) async => finalSent = true,
        onRecall: (d) {},
      );
      await tester.pump();

      expect(find.text('Send Now'), findsOneWidget);

      // Tap Send Now
      await tester.tap(find.text('Send Now'));
      await tester.pump();

      expect(sendNowTapped, isTrue);
      expect(finalSent, isTrue);
    });
  });

  // ===========================================================================
  // 4. WIDGET TESTS FOR EmailComposerModal
  // ===========================================================================
  group('EmailComposerModal Widget Tests', () {
    testWidgets('EmailComposerModal: Recipient chips, contact autocomplete, subject and body inputs', (tester) async {
      final initialDraft = EmailDraft(
        id: 'draft-comp-1',
        to: const [
          EmailRecipient(name: 'Sundar Pichai', email: 'sundar@google.com', isContact: true),
        ],
        subject: 'Impeller Architecture Review',
        body: 'Here are the telemetry numbers.',
        lastSaved: DateTime.now(),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            body: EmailComposerModal(
              initialDraft: initialDraft,
            ),
          ),
        ),
      );
      await tester.pump();

      // Verify Modal Title
      expect(find.text('New Message'), findsOneWidget);

      // Verify recipient chip rendered with initials 'SP' and name 'Sundar Pichai'
      expect(find.text('Sundar Pichai'), findsOneWidget);
      expect(find.text('SP'), findsOneWidget);

      // Verify Subject and Body pre-filled
      expect(find.text('Impeller Architecture Review'), findsOneWidget);
      expect(find.text('Here are the telemetry numbers.'), findsOneWidget);

      // Verify remove recipient action
      final removeIcon = find.descendant(
        of: find.byType(Container),
        matching: find.byIcon(Icons.close_rounded),
      ).first;
      await tester.tap(removeIcon);
      await tester.pump();

      // Recipient chip removed
      expect(find.text('Sundar Pichai'), findsNothing);
    });

    testWidgets('EmailComposerModal: 25MB attachment limit validation triggers security banner', (tester) async {
      // Draft with attachment exceeding 25MB (28MB)
      final heavyDraft = EmailDraft(
        id: 'draft-comp-heavy',
        to: const [
          EmailRecipient(name: 'Dev Sentinel', email: 'sentinel@quantrinity.lab'),
        ],
        subject: 'Heavy Dataset Transfer',
        body: 'Check attached large archive.',
        attachments: const [
          EmailAttachment(
            id: 'att-heavy-1',
            name: 'heavy_cluster_snapshot.mp4',
            sizeBytes: 28 * 1024 * 1024, // 28.0 MB
            mimeType: 'video/mp4',
          ),
        ],
        lastSaved: DateTime.now(),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            body: EmailComposerModal(
              initialDraft: heavyDraft,
            ),
          ),
        ),
      );
      await tester.pump();

      // Verify 25MB Attachment Guard warning banner is rendered
      expect(find.textContaining('Attachment limit exceeded:'), findsOneWidget);
      expect(find.textContaining('25.0 MB max'), findsOneWidget);
      expect(find.textContaining('28.0 MB'), findsOneWidget);
    });
  });

  // ===========================================================================
  // 5. TESTS FOR ContactsPillarView & QuantGitPillarView
  // ===========================================================================
  group('ContactsPillarView & QuantGitPillarView Sub-Views Tests', () {
    testWidgets('ContactsPillarView: Verifies all 5 sub-views (Contacts, VIPs, Companies, Dedup, Circles)', (tester) async {
      int activeIndex = 0;

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            body: ContactsPillarView(
              onSubViewChanged: (idx) => activeIndex = idx,
            ),
          ),
        ),
      );
      await tester.pump();

      // 1. Verify 5 sub-view tabs rendered
      expect(find.text('Contacts'), findsOneWidget);
      expect(find.text('VIPs'), findsOneWidget);
      expect(find.text('Companies'), findsOneWidget);
      expect(find.text('AI Dedup'), findsOneWidget);
      expect(find.text('Circles'), findsOneWidget);

      // Default subview is Contacts
      expect(find.text('Ada Lovelace'), findsOneWidget);

      // 2. Switch to VIPs
      await tester.tap(find.text('VIPs'));
      await tester.pumpAndSettle();
      expect(activeIndex, 1);
      expect(find.text('Executive Luminary Directory'), findsOneWidget);

      // 3. Switch to Companies
      await tester.tap(find.text('Companies'));
      await tester.pumpAndSettle();
      expect(activeIndex, 2);
      expect(find.text('Enterprise Organizations'), findsOneWidget);

      // 4. Switch to AI Dedup
      await tester.tap(find.text('AI Dedup'));
      await tester.pumpAndSettle();
      expect(activeIndex, 3);
      expect(find.text('Quant AI Identity Deduplication'), findsOneWidget);

      // 5. Switch to Circles
      await tester.tap(find.text('Circles'));
      await tester.pumpAndSettle();
      expect(activeIndex, 4);
      expect(find.text('Cryptographic Enterprise Circles'), findsOneWidget);
    });

    testWidgets('QuantGitPillarView: Verifies all 5 sub-views (Repos, PRs, Issues, Actions, Copilot)', (tester) async {
      int activeIndex = 0;

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            body: QuantGitPillarView(
              onSubViewChanged: (idx) => activeIndex = idx,
            ),
          ),
        ),
      );
      await tester.pump();

      // 1. Verify 5 sub-view tabs rendered
      expect(find.text('Repos'), findsOneWidget);
      expect(find.text('PRs'), findsOneWidget);
      expect(find.text('Issues'), findsOneWidget);
      expect(find.text('Actions'), findsOneWidget);
      expect(find.text('Copilot'), findsOneWidget);

      // Default subview is Repos
      expect(find.text('quant-ecosystem'), findsOneWidget);
      expect(find.text('quant-kernel'), findsOneWidget);

      // 2. Switch to PRs
      await tester.tap(find.text('PRs'));
      await tester.pumpAndSettle();
      expect(activeIndex, 1);
      expect(find.textContaining('Pull Requests'), findsOneWidget);

      // 3. Switch to Issues
      await tester.tap(find.text('Issues'));
      await tester.pumpAndSettle();
      expect(activeIndex, 2);
      expect(find.textContaining('Issues'), findsWidgets);

      // 4. Switch to Actions
      await tester.tap(find.text('Actions'));
      await tester.pumpAndSettle();
      expect(activeIndex, 3);
      expect(find.text('CI/CD Workflows'), findsOneWidget);

      // 5. Switch to Copilot
      await tester.tap(find.text('Copilot'));
      await tester.pumpAndSettle();
      expect(activeIndex, 4);
      expect(find.textContaining('Quanty AI Copilot'), findsWidgets);
    });
  });

  // ===========================================================================
  // 6. INVARIANT ASSERTION TESTS
  // ===========================================================================
  group('QuantMail Sovereign Architecture Invariant Assertion Tests', () {
    test('Invariant: ZERO raw Unicode emojis across all .dart source files in quant_mail/lib', () {
      final libDir = Directory('lib').existsSync()
          ? Directory('lib')
          : (Directory('flutter_apps/apps/quant_mail/lib').existsSync()
              ? Directory('flutter_apps/apps/quant_mail/lib')
              : Directory('c:/Users/Pc/Quant-Ecosystem/flutter_apps/apps/quant_mail/lib'));

      expect(libDir.existsSync(), isTrue, reason: 'quant_mail lib directory must exist');

      final emojiRegex = RegExp(
        r'[\u{1F000}-\u{1FAFF}]|[\u{2300}-\u{23FF}]|[\u{2600}-\u{27BF}]|[\u{2B50}-\u{2B55}]',
        unicode: true,
      );

      final dartFiles = libDir
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart'))
          .toList();

      expect(dartFiles.isNotEmpty, isTrue, reason: 'Must scan at least 1 Dart file');

      final violations = <String>[];

      for (final file in dartFiles) {
        final lines = file.readAsLinesSync();
        for (int i = 0; i < lines.length; i++) {
          final line = lines[i];
          final matches = emojiRegex.allMatches(line);
          for (final match in matches) {
            final char = match.group(0)!;
            // Exclude legitimate Apple/Mac Command key symbol ⌘ (U+2318)
            if (char.runes.first == 0x2318) continue;

            violations.add(
              '${file.path}:${i + 1} -> Found raw Unicode emoji "$char" (0x${char.runes.first.toRadixString(16).toUpperCase()}) in: ${line.trim()}',
            );
          }
        }
      }

      expect(
        violations,
        isEmpty,
        reason: 'Violation of Sovereign Rule: Zero raw Unicode emojis allowed in code or comments.',
      );
    });

    test('Invariant: ZERO Skia clipPath method invocations across all .dart source files in quant_mail/lib', () {
      final libDir = Directory('lib').existsSync()
          ? Directory('lib')
          : (Directory('flutter_apps/apps/quant_mail/lib').existsSync()
              ? Directory('flutter_apps/apps/quant_mail/lib')
              : Directory('c:/Users/Pc/Quant-Ecosystem/flutter_apps/apps/quant_mail/lib'));

      expect(libDir.existsSync(), isTrue, reason: 'quant_mail lib directory must exist');

      // Detects actual method invocations: .clipPath(...) or canvas.clipPath(...)
      final clipPathCallRegex = RegExp(r'(\.clipPath\s*\(|canvas\.clipPath\s*\()');

      final dartFiles = libDir
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart'))
          .toList();

      expect(dartFiles.isNotEmpty, isTrue);

      final violations = <String>[];

      for (final file in dartFiles) {
        final lines = file.readAsLinesSync();
        for (int i = 0; i < lines.length; i++) {
          final line = lines[i];
          if (clipPathCallRegex.hasMatch(line)) {
            violations.add(
              '${file.path}:${i + 1} -> Found Skia clipPath invocation: ${line.trim()}',
            );
          }
        }
      }

      expect(
        violations,
        isEmpty,
        reason: 'Violation of Sovereign Impeller Rule: Zero Skia clipPath calls allowed. Use BorderRadius/BoxDecoration.',
      );
    });
  });
}
