import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:quant_drive/main.dart';
import 'package:quant_drive/models/drive_models.dart';
import 'package:quant_drive/data/drive_data_source.dart';
import 'package:quant_drive/screens/drive_explorer_screen.dart';
import 'package:quant_drive/screens/shared_files_screen.dart';
import 'package:quant_drive/screens/cryptographic_vault_screen.dart';
import 'package:quant_drive/screens/fastcdc_cleaner_screen.dart';
import 'package:quant_drive/screens/document_viewer_screen.dart';
import 'package:quant_drive/screens/file_preview_lightbox.dart';
import 'package:quant_drive/screens/drive_upload_sheet.dart';
import 'package:quant_core/quant_core.dart';

void main() {
  setUp(() {
    // Reset data source to baseline state before each test
    final ds = DriveDataSource.instance;
    ds.usedStorageGb = 14.2;
    ds.totalStorageGb = 100.0;
    ds.duplicateReclaimableGb = 4.8;
    ds.bandwidthSavedPercent = 94.2;
    ds.duplicateChunkCount = 76800;
    ds.rawIngestedGb = 82.8;
    ds.storedCasGb = 4.8;
    ds.lockVault();
  });

  group('QuantDrive Invariant & Domain Tests', () {
    test('Storage quota and FastCDC calculations are mathematically accurate (>94% savings)', () {
      final ds = DriveDataSource.instance;
      expect(ds.usedStorageGb, 14.2);
      expect(ds.totalStorageGb, 100.0);
      expect(ds.duplicateReclaimableGb, 4.8);
      expect(ds.rawIngestedGb, 82.8);
      expect(ds.storedCasGb, 4.8);

      // Verify >94% bandwidth savings calculation formula: 100% * (1 - Stored / Raw)
      final calculatedSavings = ds.calculatedBandwidthSavedPercent;
      expect(calculatedSavings, greaterThan(94.0));
      expect(calculatedSavings, closeTo(94.2, 0.1));
      expect(ds.bandwidthSavedPercent, 94.2);
      expect(ds.duplicateClusters.length, greaterThanOrEqualTo(2));
    });

    test('DriveFileType color coding invariants', () {
      expect(DriveFileType.pdf.color, const Color(0xFFEF4444)); // PDF Red
      expect(DriveFileType.doc.color, const Color(0xFF38BDF8)); // DOC Blue
      expect(DriveFileType.code.color, const Color(0xFF10B981)); // CODE Green
      expect(DriveFileType.zip.color, const Color(0xFFF59E0B)); // ZIP Gold
    });

    test('Cryptographic Vault zero-knowledge lock state toggle', () {
      final ds = DriveDataSource.instance;
      ds.lockVault();
      expect(ds.isVaultUnlocked, false);

      ds.unlockVault();
      expect(ds.isVaultUnlocked, true);
    });

    test('FastCDC storage reclamation prunes duplicate CAS blocks and elevates savings', () {
      final ds = DriveDataSource.instance;
      ds.reclaimStorage();
      expect(ds.duplicateReclaimableGb, 0.0);
      expect(ds.duplicateChunkCount, 0);
      expect(ds.storedCasGb, 1.1);
      expect(ds.bandwidthSavedPercent, greaterThan(95.0));
      expect(ds.calculatedBandwidthSavedPercent, greaterThan(98.0));
    });
  });

  group('QuantDrive Widget Rendering & Telemetry Tests', () {
    testWidgets('Renders QuantDriveApp shell, top bar, and telemetry capsule', (tester) async {
      await tester.pumpWidget(const QuantDriveApp());
      expect(find.text('Quant'), findsWidgets);
      expect(find.text('Drive'), findsWidgets);
      expect(find.byType(QuantDriveShell), findsOneWidget);
      expect(find.text('FastCDC CAS 64KB'), findsOneWidget);
    });

    testWidgets('Renders FastCdcCleanerScreen with telemetry meter and >94% savings badge', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: FastCdcCleanerScreen()),
        ),
      );

      // Verify Telemetry Meter
      expect(find.text('FastCDC CAS Telemetry Meter'), findsOneWidget);
      expect(find.text('>94% SAVINGS'), findsOneWidget);
      expect(find.text('Bandwidth Conservation Meter'), findsOneWidget);
      expect(find.text('BANDWIDTH SAVINGS CALCULATION'), findsOneWidget);
      expect(find.textContaining('76,800 identical 64KB CAS blocks'), findsWidgets);

      // Verify Metrics Grid
      expect(find.text('94.2% Bandwidth Saved'), findsOneWidget);
      expect(find.text('64KB CAS Chunks'), findsOneWidget);
    });

    testWidgets('Renders CryptographicVaultScreen locked view with biometric auth trigger and zero-knowledge badge', (tester) async {
      final ds = DriveDataSource.instance;
      ds.lockVault();

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: CryptographicVaultScreen()),
        ),
      );

      // Verify Locked Vault view
      expect(find.text('AES-256 E2EE Cryptographic Vault'), findsOneWidget);
      expect(find.text('ZERO-KNOWLEDGE BADGE'), findsOneWidget);
      expect(find.text('AES-256-GCM'), findsWidgets);
      expect(find.text('Tap Sensor to Authenticate'), findsOneWidget);
      expect(find.text('Unlock with Biometrics (StrongBox)'), findsOneWidget);
      expect(find.text('Zero-Knowledge Security Invariant'), findsOneWidget);
    });

    testWidgets('Unlocking CryptographicVaultScreen reveals decrypted enclave session and documents', (tester) async {
      final ds = DriveDataSource.instance;
      ds.unlockVault();

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: CryptographicVaultScreen()),
        ),
      );

      // Verify Unlocked Enclave view
      expect(find.text('Hardware Keystore Biometrics Verified'), findsOneWidget);
      expect(find.text('Lock Vault Enclave'), findsOneWidget);
      expect(find.textContaining('Encrypted Documents'), findsOneWidget);
      expect(find.text('Decrypt & View'), findsWidgets);
    });

    testWidgets('Renders DocumentViewerScreen with QuantDocumentBridge', (tester) async {
      const descriptor = QuantDocumentDescriptor(
        id: 'test-cas-hash-e3b0c442',
        title: 'test_specification.pdf',
        uri: 'quant-cas://test-cas-hash-e3b0c442',
        sourceType: QuantDocumentSourceType.fastCdcStream,
        fileSizeBytes: 1048576,
        mimeType: 'application/pdf',
        isEncrypted: false,
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: DocumentViewerScreen(document: descriptor),
        ),
      );

      expect(find.text('test_specification.pdf'), findsOneWidget);
      expect(find.textContaining('FastCDC 64KB CAS'), findsWidgets);
      expect(find.text('Obsidian Invert'), findsOneWidget);
    });
  });

  // ===========================================================================
  // 3. FILE PREVIEW LIGHTBOX TESTS
  // ===========================================================================
  group('FilePreviewLightbox Fullscreen Tests', () {
    testWidgets('Renders Code/Text syntax highlighting with line numbers, tokens, and CAS chip', (WidgetTester tester) async {
      final codeItem = DriveItem(
        id: 'code-test-01',
        name: 'kernel_fastcdc_engine.rs',
        fileType: DriveFileType.code,
        sizeBytes: 1887436,
        modifiedAt: DateTime.now(),
        isStarred: true,
        sha256Cas: '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
        dedupSavingsPercent: 92,
        chunkCount: 29,
        path: '/Core',
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            body: FilePreviewLightbox(item: codeItem),
          ),
        ),
      );
      await tester.pump();

      // Top app bar verification
      expect(find.text('kernel_fastcdc_engine.rs'), findsOneWidget);
      expect(find.textContaining('FastCDC 64KB CAS'), findsWidgets);

      // Telemetry chip bar
      expect(find.text('FASTCDC 64KB CAS'), findsOneWidget);
      expect(find.text('92% DEDUP SAVED'), findsOneWidget);
      expect(find.text('29 Chunks'), findsOneWidget);
      expect(find.textContaining('CAS: 2c26b46b68'), findsOneWidget);

      // Code syntax and line numbers verification
      expect(find.textContaining('Rust / FastCDC CAS Engine'), findsOneWidget);
      expect(find.text('1'), findsWidgets);
      expect(find.textContaining('NOMINAL_CHUNK_SIZE'), findsWidgets);
      expect(find.textContaining('GearTable'), findsWidgets);

      // Star icon state
      expect(find.byIcon(Icons.star_rounded), findsOneWidget);

      // Export action
      expect(find.text('Export CAS'), findsOneWidget);
    });

    testWidgets('Renders PDF document view with multi-page navigation and obsidian canvas inversion', (WidgetTester tester) async {
      final pdfItem = DriveItem(
        id: 'pdf-test-01',
        name: 'quant_architecture_whitepaper_2026.pdf',
        fileType: DriveFileType.pdf,
        sizeBytes: 15518924,
        modifiedAt: DateTime.now(),
        sha256Cas: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        dedupSavingsPercent: 74,
        chunkCount: 231,
        path: '/Architecture',
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            body: FilePreviewLightbox(item: pdfItem),
          ),
        ),
      );
      await tester.pump();

      // Header verification
      expect(find.text('quant_architecture_whitepaper_2026.pdf'), findsOneWidget);
      expect(find.text('PAGE 1 OF 14'), findsOneWidget);
      expect(find.text('QUANT ECOSYSTEM SOVEREIGN ARCHITECTURE'), findsOneWidget);
      expect(find.textContaining('FastCDC CAS 64KB Deduplication Protocol'), findsOneWidget);

      // Navigation: Next Page
      expect(find.text('1 / 14'), findsOneWidget);
      await tester.tap(find.byTooltip('Next Page'));
      await tester.pump();

      expect(find.text('2 / 14'), findsOneWidget);
      expect(find.text('PAGE 2 OF 14'), findsOneWidget);

      // Previous Page
      await tester.tap(find.byTooltip('Previous Page'));
      await tester.pump();
      expect(find.text('1 / 14'), findsOneWidget);

      // Obsidian Canvas Inversion Toggle
      expect(find.byTooltip('Toggle Obsidian Canvas'), findsOneWidget);
      await tester.tap(find.byTooltip('Toggle Obsidian Canvas'));
      await tester.pump();

      // Zoom In and Out
      expect(find.text('100%'), findsOneWidget);
      await tester.tap(find.byTooltip('Zoom In'));
      await tester.pump();
      expect(find.text('120%'), findsOneWidget);

      await tester.tap(find.byTooltip('Zoom Out'));
      await tester.pump();
      expect(find.text('100%'), findsOneWidget);
    });

    testWidgets('Renders Image Viewer with InteractiveViewer zoom/pan controls', (WidgetTester tester) async {
      final imgItem = DriveItem(
        id: 'img-test-01',
        name: 'cluster_topology_2026.png',
        fileType: DriveFileType.image,
        sizeBytes: 4194304,
        modifiedAt: DateTime.now(),
        sha256Cas: 'fcde2b2edba56bf408601fb721fe9b5c338d10ee429ea04fae5511b68fbf8fb9',
        dedupSavingsPercent: 88,
        chunkCount: 64,
        path: '/Images',
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            body: FilePreviewLightbox(item: imgItem),
          ),
        ),
      );
      await tester.pump();

      // Verifies InteractiveViewer exists for pan/zoom
      expect(find.byType(InteractiveViewer), findsOneWidget);
      expect(find.text('cluster_topology_2026.png'), findsWidgets);
      expect(find.textContaining('3840 x 2160 UHD'), findsOneWidget);
      expect(find.textContaining('Interactive Pinch & Pan Zoom Active'), findsOneWidget);

      // Floating reset zoom button
      expect(find.byTooltip('Reset Image Zoom'), findsOneWidget);
    });

    testWidgets('Opens FastCDC Telemetry details modal and dismisses', (WidgetTester tester) async {
      final item = DriveItem(
        id: 'doc-telemetry-01',
        name: 'specs_telemetry_audit.pdf',
        fileType: DriveFileType.pdf,
        sizeBytes: 1048576,
        modifiedAt: DateTime.now(),
        sha256Cas: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
        dedupSavingsPercent: 80,
        chunkCount: 16,
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            body: FilePreviewLightbox(item: item),
          ),
        ),
      );
      await tester.pump();

      // Tap info icon in app bar
      await tester.tap(find.byTooltip('CAS Telemetry Info'));
      await tester.pumpAndSettle();

      // Modal appears
      expect(find.text('FastCDC CAS Telemetry'), findsOneWidget);
      expect(find.textContaining('256-Entry 64-Bit Gear Table'), findsOneWidget);
      expect(find.text('MIME Classification'), findsOneWidget);
      expect(find.text('16 blocks'), findsOneWidget);
      expect(find.text('80% conserved'), findsOneWidget);

      // Dismiss
      await tester.tap(find.text('Dismiss Telemetry'));
      await tester.pumpAndSettle();
      expect(find.text('FastCDC CAS Telemetry'), findsNothing);
    });
  });

  // ===========================================================================
  // 4. DRIVE UPLOAD SHEET TESTS
  // ===========================================================================
  group('DriveUploadSheet Multi-File Chunked Ingestion Tests', () {
    testWidgets('Renders multi-file queue, progress bars, and FastCDC Gear-hash badge', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(
            body: DriveUploadSheet(),
          ),
        ),
      );
      await tester.pump();

      // Sheet title
      expect(find.text('FastCDC CAS Chunk Ingestion'), findsOneWidget);

      // Gear Hash Badge & Telemetry
      expect(find.text('FastCDC Gear-Hash Engine'), findsOneWidget);
      expect(find.text('88% DEDUP SAVED'), findsOneWidget);
      expect(find.text('Gear Mask: 64KB CAS'), findsOneWidget);
      expect(find.text('Sub-5ms Latency'), findsOneWidget);

      // Queue state
      expect(find.textContaining('Upload Queue (3 files)'), findsOneWidget);
      expect(find.text('quant_cas_kernel_spec_v2.pdf'), findsOneWidget);
      expect(find.text('gear_table_simd_avx512.rs'), findsOneWidget);
      expect(find.text('cluster_helm_snapshot_2026.zip'), findsOneWidget);

      // Vault toggle
      expect(find.text('AES-256 E2EE Cryptographic Vault'), findsOneWidget);

      // Action button
      expect(find.text('Start Ingestion'), findsOneWidget);
      expect(find.text('Cancel'), findsOneWidget);
    });

    testWidgets('Toggles AES-256 E2EE Cryptographic Vault switch', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(
            body: DriveUploadSheet(),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('STRONGBOX'), findsNothing);

      // Toggle Switch
      await tester.tap(find.byType(Switch));
      await tester.pump();

      // StrongBox badge appears
      expect(find.text('STRONGBOX'), findsOneWidget);
      expect(find.textContaining('Sealed with Argon2id KDF'), findsOneWidget);
    });

    testWidgets('Adds new file to the upload queue dynamically', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(
            body: DriveUploadSheet(),
          ),
        ),
      );
      await tester.pump();

      expect(find.textContaining('Upload Queue (3 files)'), findsOneWidget);

      // Tap Add File
      await tester.tap(find.text('Add File'));
      await tester.pump();

      // Queue increased to 4 files
      expect(find.textContaining('Upload Queue (4 files)'), findsOneWidget);
      expect(find.text('financial_audit_dataset_04.parquet'), findsOneWidget);
    });

    testWidgets('Simulates chunk ingestion progression across files to completion', (WidgetTester tester) async {
      List<DriveItem>? completedItems;

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            body: DriveUploadSheet(
              onUploadComplete: (items) => completedItems = items,
            ),
          ),
        ),
      );
      await tester.pump();

      // Start Ingestion
      await tester.tap(find.text('Start Ingestion'));
      await tester.pump();

      expect(find.text('Chunk Ingestion Streaming...'), findsOneWidget);

      // Fast forward upload timer ticks until all items complete
      for (int i = 0; i < 35; i++) {
        await tester.pump(const Duration(milliseconds: 200));
      }
      await tester.pumpAndSettle();

      // Verify finished state
      expect(find.text('All Chunks Ingested Successfully'), findsOneWidget);
      expect(find.text('Done (3 Ingested)'), findsOneWidget);
      expect(completedItems, isNotNull);
      expect(completedItems!.length, 3);
      expect(completedItems!.first.dedupSavingsPercent, 88);
    });
  });
}

