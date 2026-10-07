import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import 'screens/drive_explorer_screen.dart';
import 'screens/shared_files_screen.dart';
import 'screens/cryptographic_vault_screen.dart';
import 'screens/starred_files_screen.dart';
import 'screens/fastcdc_cleaner_screen.dart';
import 'screens/drive_upload_sheet.dart';
import 'screens/file_preview_lightbox.dart';
import 'data/drive_data_source.dart';
import 'models/drive_models.dart';

void main() {
  runApp(const QuantDriveApp());
}

/// Sovereign QuantDrive Standalone Application
///
/// Sovereign Google Drive & Dropbox Killer FastCDC 64KB CAS Flutter Application
/// for Quant Ecosystem.
/// Hardware-accelerated Skia & Impeller rendering with zero clipPath calls
/// and strictly zero raw Unicode emojis.
class QuantDriveApp extends StatelessWidget {
  const QuantDriveApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'QuantDrive',
      debugShowCheckedModeBanner: false,
      theme: QuantTheme.obsidianDarkTheme.copyWith(
        primaryColor: QuantColors.sovereignCyan,
        colorScheme: const ColorScheme.dark(
          primary: QuantColors.sovereignCyan,
          secondary: QuantColors.emeraldMatrix,
          surface: QuantColors.darkSlateCard,
          error: QuantColors.statusError,
        ),
      ),
      home: const QuantDriveShell(),
    );
  }
}

/// Master Shell for QuantDrive containing top telemetry, search bar,
/// Dynamic Island capsule, five navigation tabs, and context bottom navigation.
class QuantDriveShell extends StatefulWidget {
  const QuantDriveShell({super.key});

  @override
  State<QuantDriveShell> createState() => _QuantDriveShellState();
}

class _QuantDriveShellState extends State<QuantDriveShell> {
  int _currentTabIndex = 0;
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';
  final DriveDataSource _dataSource = DriveDataSource.instance;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _onTabSelected(int index) {
    setState(() {
      _currentTabIndex = index;
    });
  }

  void _showNewUploadDialog() {
    showModalBottomSheet(
      context: context,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.cloud_upload_rounded, color: QuantColors.sovereignCyan, size: 24),
                    SizedBox(width: 10),
                    Text(
                      'FastCDC CAS Ingestion',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: QuantColors.textPrimary,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                const Text(
                  'Files are partitioned into 64KB nominal variable-size blocks. '
                  'Redundant blocks are deduplicated across the sovereign cluster.',
                  style: TextStyle(fontSize: 12, color: QuantColors.textSecondary),
                ),
                const SizedBox(height: 16),
                SquircleButton(
                  label: 'Open Multi-File Chunked Ingestion Sheet',
                  icon: Icons.upload_file_rounded,
                  isFullWidth: true,
                  backgroundColor: QuantColors.sovereignCyan,
                  textColor: Colors.black,
                  onPressed: () {
                    Navigator.pop(context);
                    DriveUploadSheet.show(context);
                  },
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: _buildUploadOption(
                        title: 'PDF Document',
                        icon: Icons.picture_as_pdf_rounded,
                        color: const Color(0xFFEF4444),
                        onTap: () => _simulateIngestion('Quarterly_Report_2026.pdf', DriveFileType.pdf),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _buildUploadOption(
                        title: 'Office DOC',
                        icon: Icons.description_rounded,
                        color: const Color(0xFF38BDF8),
                        onTap: () => _simulateIngestion('Technical_Spec_v3.docx', DriveFileType.doc),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: _buildUploadOption(
                        title: 'Source Code',
                        icon: Icons.terminal_rounded,
                        color: const Color(0xFF10B981),
                        onTap: () => _simulateIngestion('consensus_engine.rs', DriveFileType.code),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _buildUploadOption(
                        title: 'Archive ZIP',
                        icon: Icons.folder_zip_rounded,
                        color: const Color(0xFFF59E0B),
                        onTap: () => _simulateIngestion('firmware_release.zip', DriveFileType.zip),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildUploadOption({
    required String title,
    required IconData icon,
    required Color color,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
        decoration: BoxDecoration(
          color: QuantColors.elevatedCard,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: QuantColors.hairlineBorder),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: color.withOpacity(0.15),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                title,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: QuantColors.textPrimary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _simulateIngestion(String fileName, DriveFileType type) {
    Navigator.pop(context);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateSurface,
        duration: const Duration(seconds: 3),
        content: Row(
          children: [
            const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: QuantColors.sovereignCyan,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                'Ingesting $fileName: FastCDC chunked 48 blocks, 88% dedup ratio.',
                style: const TextStyle(
                  color: QuantColors.textPrimary,
                  fontSize: 12,
                  fontFamily: 'monospace',
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showDynamicIslandCopilot() {
    showModalBottomSheet(
      context: context,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: QuantColors.sovereignCyan.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(
                        Icons.auto_awesome_rounded,
                        color: QuantColors.sovereignCyan,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 12),
                    const Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Quant AI Drive Copilot', style: QuantTypography.titleMedium),
                        Text(
                          'Semantic Content Addressable Assistant (<5ms)',
                          style: TextStyle(fontSize: 11, color: QuantColors.textMuted),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                const Text(
                  'Quant AI analyzes your FastCDC chunks locally via ONNX Runtime without '
                  'sending unencrypted document bytes outside your sovereign enclave.',
                  style: TextStyle(fontSize: 13, color: QuantColors.textSecondary, height: 1.5),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: SquircleButton(
                        height: 42,
                        label: 'Synthesize Summaries',
                        icon: Icons.summarize_rounded,
                        backgroundColor: QuantColors.elevatedCard,
                        textColor: QuantColors.textPrimary,
                        onPressed: () {
                          Navigator.pop(context);
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              backgroundColor: QuantColors.darkSlateSurface,
                              content: Text(
                                'AI Drive synthesis generated in 4.2ms',
                                style: TextStyle(color: QuantColors.statusSuccess),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: SquircleButton(
                        height: 42,
                        label: 'Prune Duplicates',
                        icon: Icons.cleaning_services_rounded,
                        backgroundColor: QuantColors.sovereignCyan,
                        textColor: Colors.black,
                        onPressed: () {
                          Navigator.pop(context);
                          setState(() => _currentTabIndex = 4);
                        },
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.obsidianVoid,
      body: SafeArea(
        child: Column(
          children: [
            _buildTopHeader(),
            _buildSearchBar(),
            Expanded(
              child: IndexedStack(
                index: _currentTabIndex,
                children: [
                  DriveExplorerScreen(
                    searchQuery: _searchQuery,
                    onOpenCleaner: () => setState(() => _currentTabIndex = 4),
                  ),
                  SharedFilesScreen(
                    searchQuery: _searchQuery,
                  ),
                  CryptographicVaultScreen(
                    searchQuery: _searchQuery,
                  ),
                  StarredFilesScreen(
                    searchQuery: _searchQuery,
                  ),
                  FastCdcCleanerScreen(
                    onStorageReclaimed: () => setState(() {}),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: ContextBottomNavBar(
        activePillar: QuantPillar.drive,
        selectedIndex: _currentTabIndex,
        onTabSelected: _onTabSelected,
        badges: {
          'vault': _dataSource.isVaultUnlocked ? 0 : 3,
          'cleaner': _dataSource.duplicateReclaimableGb > 0 ? 2 : 0,
        },
      ),
      floatingActionButton: FloatingActionButton(
        backgroundColor: QuantColors.sovereignCyan,
        foregroundColor: Colors.black,
        elevation: 4,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        onPressed: _showNewUploadDialog,
        child: const Icon(Icons.add_rounded, size: 28),
      ),
    );
  }

  Widget _buildTopHeader() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [QuantColors.sovereignCyan, Color(0xFF0284C7)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Center(
                  child: Text(
                    'Q',
                    style: TextStyle(
                      color: Colors.black,
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              RichText(
                text: const TextSpan(
                  children: [
                    TextSpan(
                      text: 'Quant',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                    TextSpan(
                      text: 'Drive',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: QuantColors.sovereignCyan,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          // Dynamic Island Live Capsule
          QuantAiCapsule(
            title: 'Quant AI Live',
            statusText: 'FastCDC CAS 64KB',
            beaconColor: QuantColors.sovereignCyan,
            onTap: _showDynamicIslandCopilot,
          ),
        ],
      ),
    );
  }

  Widget _buildSearchBar() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: QuantVoiceSearchBar(
        controller: _searchController,
        activePillar: QuantPillar.drive,
        placeholder: 'Search files, vault, chunks... FastCDC <5ms',
        onChanged: (value) {
          setState(() {
            _searchQuery = value;
          });
        },
        onClear: () {
          setState(() {
            _searchQuery = '';
            _searchController.clear();
          });
        },
      ),
    );
  }
}
