import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import 'package:quant_core/quant_core.dart';
import '../models/drive_models.dart';
import '../data/drive_data_source.dart';
import 'document_viewer_screen.dart';

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
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
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
              color: QuantColors.statusSuccess.withOpacity(0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(
              Icons.auto_awesome_rounded,
              color: QuantColors.statusSuccess,
              size: 18,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Text(
                      'FastCDC 64KB CAS Engine',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: QuantColors.textPrimary,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: QuantColors.statusSuccess.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        '${_dataSource.bandwidthSavedPercent}% Saved',
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
                const SizedBox(height: 2),
                Text(
                  'Content Addressable Storage · Sub-5ms chunk indexing',
                  style: QuantTypography.bodySmall,
                ),
              ],
            ),
          ),
          if (widget.onOpenCleaner != null)
            IconButton(
              icon: const Icon(Icons.cleaning_services_rounded, color: QuantColors.sovereignCyan),
              tooltip: 'Open FastCDC Cleaner',
              onPressed: widget.onOpenCleaner,
            ),
        ],
      ),
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
