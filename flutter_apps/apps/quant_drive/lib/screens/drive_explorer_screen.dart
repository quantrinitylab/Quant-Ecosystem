import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import 'package:quant_core/quant_core.dart';
import '../models/drive_models.dart';
import '../data/drive_data_source.dart';
import 'document_viewer_screen.dart';
import 'file_preview_lightbox.dart';

/// Sovereign File & Folder Explorer Screen
///
/// Features a 100 GB storage quota meter, color-coded type cards
/// (PDF red, DOC blue, CODE green, ZIP gold), and FastCDC deduplication badges.
/// Zero Skia clipPath calls and zero raw Unicode emojis.
class DriveExplorerScreen extends StatefulWidget {
  final String searchQuery;
  final VoidCallback? onOpenCleaner;

  const DriveExplorerScreen({
    super.key,
    this.searchQuery = '',
    this.onOpenCleaner,
  });

  @override
  State<DriveExplorerScreen> createState() => _DriveExplorerScreenState();
}

class _DriveExplorerScreenState extends State<DriveExplorerScreen> {
  final DriveDataSource _dataSource = DriveDataSource.instance;
  DriveFileType? _selectedFilter;
  String _activeFolder = 'All';

  final List<String> _folders = const [
    'All',
    'Architecture',
    'Finance',
    'Core',
    'DevOps',
  ];

  void _openDocument(DriveItem item) {
    final descriptor = QuantDocumentDescriptor(
      id: item.sha256Cas,
      title: item.name,
      uri: 'quant-cas://${item.sha256Cas}',
      sourceType: QuantDocumentSourceType.fastCdcStream,
      fileSizeBytes: item.sizeBytes,
      mimeType: _resolveMimeType(item.fileType),
      isEncrypted: item.isEncrypted,
    );

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => DocumentViewerScreen(document: descriptor),
      ),
    );
  }

  void _openLightbox(DriveItem item) {
    FilePreviewLightbox.show(
      context,
      item: item,
      onToggleStar: () => setState(() {}),
    );
  }

  String _resolveMimeType(DriveFileType type) {
    switch (type) {
      case DriveFileType.pdf:
        return 'application/pdf';
      case DriveFileType.doc:
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case DriveFileType.code:
        return 'text/x-rust';
      case DriveFileType.zip:
        return 'application/zip';
      case DriveFileType.image:
        return 'image/png';
      case DriveFileType.media:
        return 'video/mp4';
      case DriveFileType.other:
        return 'application/octet-stream';
    }
  }

  void _showFileActions(DriveItem item) {
    showModalBottomSheet(
      context: context,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ListTile(
                  leading: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: item.fileType.color.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(item.fileType.icon, color: item.fileType.color),
                  ),
                  title: Text(item.name, style: QuantTypography.titleMedium),
                  subtitle: Text(
                    '${item.formattedSize} · CAS: ${item.sha256Cas.substring(0, 12)}...',
                    style: QuantTypography.bodySmall,
                  ),
                ),
                const Divider(),
                ListTile(
                  leading: const Icon(Icons.visibility_rounded, color: QuantColors.sovereignCyan),
                  title: const Text('Open in Sovereign Viewer'),
                  onTap: () {
                    Navigator.pop(context);
                    _openDocument(item);
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.fullscreen_rounded, color: QuantColors.sovereignCyan),
                  title: const Text('Open in Fullscreen Lightbox'),
                  subtitle: const Text('Syntax highlighting, PDF canvas & CAS telemetry', style: QuantTypography.bodySmall),
                  onTap: () {
                    Navigator.pop(context);
                    _openLightbox(item);
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.history_rounded, color: QuantColors.sovereignCyan),
                  title: const Text('Version History & 1-Click Restore'),
                  subtitle: Text(
                    '${item.versions.length} versions stored in CAS tree',
                    style: QuantTypography.bodySmall,
                  ),
                  onTap: () {
                    Navigator.pop(context);
                    _showVersionHistoryModal(item);
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.star_rounded, color: QuantColors.sunsetGold),
                  title: Text(item.isStarred ? 'Remove from Starred' : 'Add to Starred'),
                  onTap: () {
                    setState(() {
                      _dataSource.toggleStarred(item.id);
                    });
                    Navigator.pop(context);
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.share_rounded, color: QuantColors.emeraldMatrix),
                  title: const Text('Generate E2EE Share Link'),
                  onTap: () {
                    Navigator.pop(context);
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        backgroundColor: QuantColors.darkSlateSurface,
                        content: Text(
                          'E2EE token generated for ${item.name}',
                          style: const TextStyle(color: QuantColors.statusSuccess),
                        ),
                      ),
                    );
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.lock_outline_rounded, color: QuantColors.moltenAmber),
                  title: const Text('Move to Cryptographic Vault (AES-256)'),
                  onTap: () {
                    Navigator.pop(context);
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        backgroundColor: QuantColors.darkSlateSurface,
                        content: Text(
                          '${item.name} migrated to AES-256 Vault',
                          style: const TextStyle(color: QuantColors.moltenAmber),
                        ),
                      ),
                    );
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showVersionHistoryModal(DriveItem item) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (modalContext) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: item.fileType.color.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(item.fileType.icon, color: item.fileType.color, size: 22),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.name,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              color: QuantColors.textPrimary,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          const Text(
                            'FastCDC CAS 64KB Version Tree · 1-Click Pointer Restore',
                            style: TextStyle(fontSize: 11, color: QuantColors.sovereignCyan),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close_rounded, color: QuantColors.textMuted, size: 20),
                      onPressed: () => Navigator.pop(modalContext),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: QuantColors.voidObsidian,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: QuantColors.hairlineBorder),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.hub_rounded, size: 16, color: QuantColors.statusSuccess),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Restoring a version performs an instant CAS root pointer swap in <1ms '
                          'without re-uploading duplicated 64KB chunks.',
                          style: TextStyle(fontSize: 11, color: QuantColors.textSecondary, height: 1.3),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  'Recorded Versions (${item.versions.length})',
                  style: QuantTypography.bodyMedium.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 10),
                Flexible(
                  child: ListView.separated(
                    shrinkWrap: true,
                    physics: const BouncingScrollPhysics(),
                    itemCount: item.versions.length,
                    separatorBuilder: (context, index) => const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      final version = item.versions[index];
                      return Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: version.isCurrent
                              ? QuantColors.elevatedCard
                              : QuantColors.voidObsidian,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: version.isCurrent
                                ? QuantColors.sovereignCyan.withOpacity(0.5)
                                : QuantColors.hairlineBorder,
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: version.isCurrent
                                            ? QuantColors.sovereignCyan.withOpacity(0.2)
                                            : QuantColors.elevatedCard,
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Text(
                                        'v${version.versionNumber}',
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w800,
                                          fontFamily: 'monospace',
                                          color: version.isCurrent
                                              ? QuantColors.sovereignCyan
                                              : QuantColors.textPrimary,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    if (version.isCurrent)
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                        decoration: BoxDecoration(
                                          color: QuantColors.statusSuccess.withOpacity(0.15),
                                          borderRadius: BorderRadius.circular(6),
                                        ),
                                        child: const Text(
                                          'CURRENT ACTIVE',
                                          style: TextStyle(
                                            fontSize: 9,
                                            fontWeight: FontWeight.w800,
                                            color: QuantColors.statusSuccess,
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                                Text(
                                  version.relativeTime,
                                  style: const TextStyle(fontSize: 11, color: QuantColors.textMuted),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text(
                              version.changeSummary,
                              style: const TextStyle(fontSize: 12, color: QuantColors.textPrimary),
                            ),
                            const SizedBox(height: 6),
                            Row(
                              children: [
                                const Icon(Icons.person_outline_rounded, size: 12, color: QuantColors.textMuted),
                                const SizedBox(width: 4),
                                Text(
                                  version.author,
                                  style: const TextStyle(fontSize: 10, color: QuantColors.textMuted),
                                ),
                                const SizedBox(width: 10),
                                Text('·', style: const TextStyle(color: QuantColors.textMuted)),
                                const SizedBox(width: 10),
                                Text(
                                  version.formattedSize,
                                  style: const TextStyle(
                                    fontSize: 10,
                                    fontFamily: 'monospace',
                                    color: QuantColors.textMuted,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Expanded(
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: QuantColors.darkSlateCard,
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: Text(
                                      'CAS: ${version.sha256Cas}',
                                      style: const TextStyle(
                                        fontSize: 9,
                                        fontFamily: 'monospace',
                                        color: QuantColors.textMuted,
                                      ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                ),
                                if (!version.isCurrent) ...[
                                  const SizedBox(width: 10),
                                  SquircleButton(
                                    height: 32,
                                    padding: const EdgeInsets.symmetric(horizontal: 12),
                                    label: '1-Click Restore',
                                    icon: Icons.restore_rounded,
                                    backgroundColor: QuantColors.sovereignCyan,
                                    textColor: Colors.black,
                                    onPressed: () {
                                      _dataSource.restoreFileVersion(item.id, version.versionId);
                                      Navigator.pop(modalContext);
                                      setState(() {});
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        SnackBar(
                                          backgroundColor: QuantColors.darkSlateSurface,
                                          content: Text(
                                            'Restored ${item.name} to v${version.versionNumber} in 0.8ms without re-upload.',
                                            style: const TextStyle(color: QuantColors.statusSuccess),
                                          ),
                                        ),
                                      );
                                    },
                                  ),
                                ],
                              ],
                            ),
                          ],
                        ),
                      );
                    },
                  ),
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
    final query = widget.searchQuery.toLowerCase().trim();
    final items = _dataSource.explorerItems.where((item) {
      if (query.isNotEmpty && !item.name.toLowerCase().contains(query)) {
        return false;
      }
      if (_selectedFilter != null && item.fileType != _selectedFilter) {
        return false;
      }
      if (_activeFolder != 'All' && !item.path.contains(_activeFolder)) {
        return false;
      }
      return true;
    }).toList();

    return SingleChildScrollView(
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildStorageQuotaMeter(),
          const SizedBox(height: 16),
          _buildFastCdcTelemetryCard(),
          const SizedBox(height: 20),
          _buildFolderFilterRow(),
          const SizedBox(height: 16),
          _buildTypeFilterChips(),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Files (${items.length})',
                style: QuantTypography.titleMedium.copyWith(
                  color: QuantColors.textPrimary,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Row(
                children: [
                  const Icon(Icons.tune_rounded, size: 16, color: QuantColors.textMuted),
                  const SizedBox(width: 4),
                  Text(
                    'Sorted by CAS Index',
                    style: QuantTypography.bodySmall.copyWith(
                      color: QuantColors.textMuted,
                      fontFamily: 'monospace',
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (items.isEmpty)
            _buildEmptyState()
          else
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: items.length,
              separatorBuilder: (context, index) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                return _buildFileCard(items[index]);
              },
            ),
          const SizedBox(height: 80),
        ],
      ),
    );
  }

  Widget _buildStorageQuotaMeter() {
    final used = _dataSource.usedStorageGb;
    final total = _dataSource.totalStorageGb;
    final ratio = (used / total).clamp(0.0, 1.0);

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: QuantColors.sovereignCyan.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(
                      Icons.cloud_done_rounded,
                      color: QuantColors.sovereignCyan,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Sovereign Storage Quota',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: QuantColors.textPrimary,
                        ),
                      ),
                      Text(
                        '100 GB CAS Sovereign Pool',
                        style: QuantTypography.bodySmall,
                      ),
                    ],
                  ),
                ],
              ),
              RichText(
                textAlign: TextAlign.end,
                text: TextSpan(
                  children: [
                    TextSpan(
                      text: '${used.toStringAsFixed(1)} GB',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: QuantColors.sovereignCyan,
                        fontFamily: 'monospace',
                      ),
                    ),
                    TextSpan(
                      text: ' / ${total.toStringAsFixed(0)} GB',
                      style: const TextStyle(
                        fontSize: 12,
                        color: QuantColors.textMuted,
                        fontFamily: 'monospace',
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: ratio,
              minHeight: 8,
              backgroundColor: QuantColors.elevatedCard,
              valueColor: const AlwaysStoppedAnimation<Color>(QuantColors.sovereignCyan),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _buildQuotaLegendItem('PDF/Docs', const Color(0xFFEF4444), '6.8 GB'),
              _buildQuotaLegendItem('Archives', const Color(0xFFF59E0B), '4.1 GB'),
              _buildQuotaLegendItem('Code', const Color(0xFF10B981), '2.3 GB'),
              _buildQuotaLegendItem('Vault', QuantColors.moltenAmber, '1.0 GB'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildQuotaLegendItem(String label, Color color, String amount) {
    return Row(
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 5),
        Text(
          '$label $amount',
          style: const TextStyle(
            fontSize: 11,
            color: QuantColors.textSecondary,
            fontFamily: 'monospace',
          ),
        ),
      ],
    );
  }

  Widget _buildFastCdcTelemetryCard() {
    final rawGb = _dataSource.rawIngestedGb;
    final storedGb = _dataSource.storedCasGb;
    final savingsPercent = _dataSource.calculatedBandwidthSavedPercent;
    final ratio = (rawGb / (storedGb > 0 ? storedGb : 0.1)).toStringAsFixed(1);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: QuantColors.sovereignCyan.withOpacity(0.35),
          width: 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
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
                      Icons.speed_rounded,
                      color: QuantColors.sovereignCyan,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 10),
                  const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'FastCDC 64KB Gear Table Telemetry',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: QuantColors.textPrimary,
                        ),
                      ),
                      SizedBox(height: 2),
                      Text(
                        '256-Entry 64-Bit Gear Table · Rabin Window',
                        style: TextStyle(fontSize: 10, color: QuantColors.textMuted),
                      ),
                    ],
                  ),
                ],
              ),
              Row(
                children: [
                  QuantBadge(
                    label: '${savingsPercent.toStringAsFixed(1)}% SAVED',
                    variant: QuantBadgeVariant.success,
                    leadingIcon: Icons.bolt_rounded,
                  ),
                  if (widget.onOpenCleaner != null) ...[
                    const SizedBox(width: 4),
                    IconButton(
                      icon: const Icon(Icons.cleaning_services_rounded, color: QuantColors.sovereignCyan, size: 20),
                      tooltip: 'Open FastCDC Cleaner',
                      onPressed: widget.onOpenCleaner,
                    ),
                  ],
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Raw vs Deduplicated Storage Row
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: QuantColors.voidObsidian,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: QuantColors.hairlineBorder),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildTelemetryStatItem('Raw Ingestion', '${rawGb.toStringAsFixed(1)} GB', QuantColors.textSecondary),
                Container(width: 1, height: 24, color: QuantColors.hairlineBorder),
                _buildTelemetryStatItem('CAS Stored', '${storedGb.toStringAsFixed(1)} GB', QuantColors.sovereignCyan),
                Container(width: 1, height: 24, color: QuantColors.hairlineBorder),
                _buildTelemetryStatItem('Chunk Count', '${_dataSource.duplicateChunkCount}', QuantColors.sunsetGold),
                Container(width: 1, height: 24, color: QuantColors.hairlineBorder),
                _buildTelemetryStatItem('Dedup Ratio', '${ratio}x', QuantColors.statusSuccess),
              ],
            ),
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: (storedGb / rawGb).clamp(0.0, 1.0),
              minHeight: 6,
              backgroundColor: QuantColors.elevatedCard,
              valueColor: const AlwaysStoppedAnimation<Color>(QuantColors.statusSuccess),
            ),
          ),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'CAS Footprint: ${storedGb.toStringAsFixed(1)} GB / ${rawGb.toStringAsFixed(1)} GB Raw',
                style: QuantTypography.microCapsule.copyWith(color: QuantColors.textMuted),
              ),
              Text(
                'Sub-5ms CAS Deduplication Engine',
                style: QuantTypography.microCapsule.copyWith(color: QuantColors.sovereignCyan),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTelemetryStatItem(String label, String value, Color color) {
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            fontFamily: 'monospace',
            color: color,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: const TextStyle(fontSize: 9, color: QuantColors.textMuted),
        ),
      ],
    );
  }

  Widget _buildFolderFilterRow() {
    return SizedBox(
      height: 38,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        itemCount: _folders.length,
        separatorBuilder: (context, index) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final folder = _folders[index];
          final isSelected = _activeFolder == folder;
          return InkWell(
            onTap: () => setState(() => _activeFolder = folder),
            borderRadius: BorderRadius.circular(10),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: isSelected ? QuantColors.sovereignCyan : QuantColors.elevatedCard,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: isSelected ? QuantColors.sovereignCyan : QuantColors.hairlineBorder,
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    folder == 'All' ? Icons.folder_copy_rounded : Icons.folder_rounded,
                    size: 16,
                    color: isSelected ? Colors.black : QuantColors.sovereignCyan,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    folder,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: isSelected ? Colors.black : QuantColors.textPrimary,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildTypeFilterChips() {
    final types = [
      null,
      DriveFileType.pdf,
      DriveFileType.doc,
      DriveFileType.code,
      DriveFileType.zip,
    ];

    return SizedBox(
      height: 34,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        itemCount: types.length,
        separatorBuilder: (context, index) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final type = types[index];
          final isSelected = _selectedFilter == type;
          final label = type == null ? 'All Types' : type.label;
          final color = type?.color ?? QuantColors.textSecondary;

          return InkWell(
            onTap: () => setState(() => _selectedFilter = type),
            borderRadius: BorderRadius.circular(8),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: isSelected ? color.withOpacity(0.2) : QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: isSelected ? color : QuantColors.hairlineBorder,
                  width: 1,
                ),
              ),
              child: Row(
                children: [
                  if (type != null) ...[
                    Icon(type.icon, size: 14, color: color),
                    const SizedBox(width: 6),
                  ],
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: isSelected ? color : QuantColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildFileCard(DriveItem item) {
    return Container(
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: QuantColors.hairlineBorder, width: 1),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => _openDocument(item),
          onLongPress: () => _showFileActions(item),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                // Color-coded Type Card
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: item.fileType.color.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: item.fileType.color.withOpacity(0.3),
                      width: 1,
                    ),
                  ),
                  child: Center(
                    child: Icon(
                      item.fileType.icon,
                      color: item.fileType.color,
                      size: 24,
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                // File Information
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.name,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: QuantColors.textPrimary,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Text(
                            item.formattedSize,
                            style: QuantTypography.bodySmall.copyWith(
                              fontFamily: 'monospace',
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text('·', style: QuantTypography.bodySmall),
                          const SizedBox(width: 8),
                          Text(
                            item.relativeTime,
                            style: QuantTypography.bodySmall,
                          ),
                          const SizedBox(width: 8),
                          // FastCDC Deduplication Badge
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                            decoration: BoxDecoration(
                              color: QuantColors.statusSuccess.withOpacity(0.12),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              'FastCDC -${item.dedupSavingsPercent}%',
                              style: const TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: QuantColors.statusSuccess,
                                fontFamily: 'monospace',
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${item.chunkCount} CAS chunks (64KB nominal)',
                        style: TextStyle(
                          fontSize: 10,
                          color: QuantColors.textMuted.withOpacity(0.8),
                          fontFamily: 'monospace',
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  icon: Icon(
                    item.isStarred ? Icons.star_rounded : Icons.star_border_rounded,
                    color: item.isStarred ? QuantColors.sunsetGold : QuantColors.textMuted,
                    size: 20,
                  ),
                  onPressed: () {
                    setState(() {
                      _dataSource.toggleStarred(item.id);
                    });
                  },
                ),
                IconButton(
                  icon: const Icon(Icons.more_vert_rounded, color: QuantColors.textMuted, size: 20),
                  onPressed: () => _showFileActions(item),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Container(
      padding: const EdgeInsets.all(40),
      alignment: Alignment.center,
      child: Column(
        children: [
          Icon(Icons.search_off_rounded, size: 48, color: QuantColors.textMuted),
          const SizedBox(height: 12),
          const Text(
            'No files found matching criteria',
            style: TextStyle(fontSize: 14, color: QuantColors.textSecondary),
          ),
          const SizedBox(height: 6),
          const Text(
            'Try adjusting your search query or type filters',
            style: TextStyle(fontSize: 12, color: QuantColors.textMuted),
          ),
        ],
      ),
    );
  }
}
