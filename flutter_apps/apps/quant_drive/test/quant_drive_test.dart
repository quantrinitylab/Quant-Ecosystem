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
import 'package:quant_core/quant_core.dart';

void main() {
  group('QuantDrive Invariant & Domain Tests', () {
    test('Storage quota and FastCDC calculations are mathematically accurate', () {
      final ds = DriveDataSource.instance;
      expect(ds.usedStorageGb, 14.2);
      expect(ds.totalStorageGb, 100.0);
      expect(ds.duplicateReclaimableGb, 4.8);
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

    test('FastCDC storage reclamation prunes duplicate CAS blocks', () {
      final ds = DriveDataSource.instance;
      ds.reclaimStorage();
      expect(ds.duplicateReclaimableGb, 0.0);
      expect(ds.duplicateChunkCount, 0);
      expect(ds.bandwidthSavedPercent, greaterThan(95.0));
    });
  });

  group('QuantDrive Widget Rendering Tests', () {
    testWidgets('Renders QuantDriveApp shell and top bar', (tester) async {
      await tester.pumpWidget(const QuantDriveApp());
      expect(find.text('Quant'), findsWidgets);
      expect(find.text('Drive'), findsWidgets);
      expect(find.byType(QuantDriveShell), findsOneWidget);
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
}
