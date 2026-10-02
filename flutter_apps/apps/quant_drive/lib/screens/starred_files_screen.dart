import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import 'package:quant_core/quant_core.dart';
import '../models/drive_models.dart';
import '../data/drive_data_source.dart';
import 'document_viewer_screen.dart';

/// Sovereign Starred Files Screen
///
/// Displays marked sovereign VIP documents across All Files and Shared files.
/// Zero Skia clipPath calls and zero raw Unicode emojis.
class StarredFilesScreen extends StatefulWidget {
  final String searchQuery;

  const StarredFilesScreen({
    super.key,
    this.searchQuery = '',
  });

  @override
  State<StarredFilesScreen> createState() => _StarredFilesScreenState();
}

class _StarredFilesScreenState extends State<StarredFilesScreen> {
  final DriveDataSource _dataSource = DriveDataSource.instance;

  void _openDocument(DriveItem item) {
    final descriptor = QuantDocumentDescriptor(
      id: item.sha256Cas,
      title: item.name,
      uri: 'quant-cas://${item.sha256Cas}',
      sourceType: QuantDocumentSourceType.fastCdcStream,
      fileSizeBytes: item.sizeBytes,
      mimeType: item.fileType == DriveFileType.pdf ? 'application/pdf' : 'text/plain',
      isEncrypted: item.isEncrypted,
    );

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => DocumentViewerScreen(document: descriptor),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final query = widget.searchQuery.toLowerCase().trim();
    final items = _dataSource.starredItems.where((item) {
      if (query.isNotEmpty && !item.name.toLowerCase().contains(query)) {
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
          _buildStarredHeaderBanner(items.length),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Starred Documents (${items.length})',
                style: QuantTypography.titleMedium.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const Row(
                children: [
                  Icon(Icons.star_rounded, size: 16, color: QuantColors.sunsetGold),
                  SizedBox(width: 4),
                  Text(
                    'Instant Cache',
                    style: TextStyle(
                      fontSize: 11,
                      fontFamily: 'monospace',
                      color: QuantColors.sunsetGold,
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
                return _buildStarredCard(items[index]);
              },
            ),
          const SizedBox(height: 80),
        ],
      ),
    );
  }

  Widget _buildStarredHeaderBanner(int count) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: QuantColors.sunsetGold.withOpacity(0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.star_rounded, color: QuantColors.sunsetGold, size: 24),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'VIP Starred Sovereign Storage',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: QuantColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '$count documents pinned with zero-latency local CAS block caching.',
                  style: QuantTypography.bodySmall,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStarredCard(DriveItem item) {
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
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
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
                    child: Icon(item.fileType.icon, color: item.fileType.color, size: 24),
                  ),
                ),
                const SizedBox(width: 14),
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
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                            decoration: BoxDecoration(
                              color: QuantColors.statusSuccess.withOpacity(0.12),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              '-${item.dedupSavingsPercent}%',
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
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.star_rounded, color: QuantColors.sunsetGold, size: 22),
                  onPressed: () {
                    setState(() {
                      _dataSource.toggleStarred(item.id);
                    });
                  },
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
      child: const Column(
        children: [
          Icon(Icons.star_border_rounded, size: 48, color: QuantColors.textMuted),
          SizedBox(height: 12),
          Text(
            'No starred files yet',
            style: TextStyle(fontSize: 14, color: QuantColors.textSecondary),
          ),
          SizedBox(height: 6),
          Text(
            'Star frequently accessed documents for instant offline CAS access.',
            style: TextStyle(fontSize: 12, color: QuantColors.textMuted),
          ),
        ],
      ),
    );
  }
}
