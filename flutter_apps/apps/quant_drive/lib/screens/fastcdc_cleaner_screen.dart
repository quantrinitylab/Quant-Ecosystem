import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../models/drive_models.dart';
import '../data/drive_data_source.dart';

/// Sovereign FastCDC 64KB CAS Deduplication Cleaner Screen
///
/// Features metric cards (94.2% Bandwidth Saved, 4.8 GB Duplicate Blocks Identified),
/// duplicate file cluster cards, and [Reclaim 4.8 GB Storage] action button.
/// Zero Skia clipPath calls and zero raw Unicode emojis.
class FastCdcCleanerScreen extends StatefulWidget {
  final VoidCallback? onStorageReclaimed;

  const FastCdcCleanerScreen({
    super.key,
    this.onStorageReclaimed,
  });

  @override
  State<FastCdcCleanerScreen> createState() => _FastCdcCleanerScreenState();
}

class _FastCdcCleanerScreenState extends State<FastCdcCleanerScreen> {
  final DriveDataSource _dataSource = DriveDataSource.instance;
  bool _isReclaiming = false;
  bool _hasReclaimed = false;

  void _triggerReclaim() async {
    final amountGb = _dataSource.duplicateReclaimableGb;
    if (amountGb <= 0.0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          backgroundColor: QuantColors.darkSlateCard,
          content: Text(
            'All duplicate CAS blocks have already been pruned!',
            style: TextStyle(color: QuantColors.sovereignCyan),
          ),
        ),
      );
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: QuantColors.darkSlateCard,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
            side: const BorderSide(color: QuantColors.hairlineBorder),
          ),
          title: const Row(
            children: [
              Icon(Icons.cleaning_services_rounded, color: QuantColors.sovereignCyan, size: 26),
              SizedBox(width: 10),
              Text('Reclaim CAS Storage', style: QuantTypography.titleMedium),
            ],
          ),
          content: Text(
            'Reclaiming ${amountGb.toStringAsFixed(1)} GB will prune unreferenced FastCDC '
            'CAS blocks. All files remain 100% accessible via shared content pointers.',
            style: const TextStyle(fontSize: 13, color: QuantColors.textSecondary),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel', style: TextStyle(color: QuantColors.textMuted)),
            ),
            SquircleButton(
              height: 40,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              label: 'Prune Blocks',
              icon: Icons.check_circle_rounded,
              backgroundColor: QuantColors.statusSuccess,
              textColor: Colors.black,
              onPressed: () => Navigator.pop(context, true),
            ),
          ],
        );
      },
    );

    if (confirmed != true) return;

    setState(() => _isReclaiming = true);
    await Future.delayed(const Duration(milliseconds: 900));

    if (!mounted) return;
    setState(() {
      _dataSource.reclaimStorage();
      _isReclaiming = false;
      _hasReclaimed = true;
    });

    widget.onStorageReclaimed?.call();

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateSurface,
        content: Text(
          'Successfully reclaimed ${amountGb.toStringAsFixed(1)} GB! Quota updated.',
          style: const TextStyle(color: QuantColors.statusSuccess),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final reclaimableGb = _dataSource.duplicateReclaimableGb;
    final clusters = _dataSource.duplicateClusters;

    return SingleChildScrollView(
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildHeroReclaimBanner(reclaimableGb),
          const SizedBox(height: 16),
          _buildMetricsGrid(),
          const SizedBox(height: 20),
          _buildEngineArchitectureBanner(),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Identified CAS Duplicate Clusters (${clusters.length})',
                style: QuantTypography.titleMedium.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const Row(
                children: [
                  Icon(Icons.hub_rounded, size: 14, color: QuantColors.sovereignCyan),
                  SizedBox(width: 4),
                  Text(
                    '64KB Chunk Aliasing',
                    style: TextStyle(
                      fontSize: 11,
                      fontFamily: 'monospace',
                      color: QuantColors.sovereignCyan,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: clusters.length,
            separatorBuilder: (context, index) => const SizedBox(height: 12),
            itemBuilder: (context, index) {
              return _buildClusterCard(clusters[index]);
            },
          ),
          const SizedBox(height: 80),
        ],
      ),
    );
  }

  Widget _buildHeroReclaimBanner(double reclaimableGb) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: _hasReclaimed ? QuantColors.statusSuccess : QuantColors.sovereignCyan.withOpacity(0.5),
          width: 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: _hasReclaimed
                      ? QuantColors.statusSuccess.withOpacity(0.15)
                      : QuantColors.sovereignCyan.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  _hasReclaimed ? Icons.check_circle_outline_rounded : Icons.recycling_rounded,
                  color: _hasReclaimed ? QuantColors.statusSuccess : QuantColors.sovereignCyan,
                  size: 26,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _hasReclaimed
                          ? 'Storage Optimized & Pruned'
                          : '${reclaimableGb.toStringAsFixed(1)} GB Duplicate Storage Detected',
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: QuantColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _hasReclaimed
                          ? 'Zero redundant CAS chunks remaining across cluster.'
                          : '76,800 identical 64KB CAS blocks ready for immediate reclamation.',
                      style: QuantTypography.bodySmall,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          SquircleButton(
            isFullWidth: true,
            height: 48,
            label: _hasReclaimed
                ? 'Storage Optimized (Zero Waste)'
                : 'Reclaim ${reclaimableGb.toStringAsFixed(1)} GB Storage',
            icon: _hasReclaimed ? Icons.verified_rounded : Icons.cleaning_services_rounded,
            isLoading: _isReclaiming,
            backgroundColor: _hasReclaimed ? QuantColors.elevatedCard : QuantColors.sovereignCyan,
            textColor: _hasReclaimed ? QuantColors.statusSuccess : Colors.black,
            onPressed: _hasReclaimed ? null : _triggerReclaim,
          ),
        ],
      ),
    );
  }

  Widget _buildMetricsGrid() {
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: _buildMetricTile(
                title: '94.2% Bandwidth Saved',
                subtitle: 'FastCDC Delta Ingestion',
                icon: Icons.speed_rounded,
                accentColor: QuantColors.statusSuccess,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _buildMetricTile(
                title: '4.8 GB Duplicates',
                subtitle: 'Cross-Tenant CAS Deduplicated',
                icon: Icons.cloud_sync_rounded,
                accentColor: QuantColors.sovereignCyan,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _buildMetricTile(
                title: '64KB CAS Chunks',
                subtitle: 'Content-Addressable Variable Cut',
                icon: Icons.layers_rounded,
                accentColor: QuantColors.sunsetGold,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _buildMetricTile(
                title: '<0.02ms Latency',
                subtitle: 'Rolling Rabin Fingerprint',
                icon: Icons.bolt_rounded,
                accentColor: QuantColors.moltenAmber,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildMetricTile({
    required String title,
    required String subtitle,
    required IconData icon,
    required Color accentColor,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Icon(icon, size: 20, color: accentColor),
              Container(
                width: 6,
                height: 6,
                decoration: BoxDecoration(
                  color: accentColor,
                  shape: BoxShape.circle,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            title,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: QuantColors.textPrimary,
              fontFamily: 'monospace',
            ),
          ),
          const SizedBox(height: 2),
          Text(
            subtitle,
            style: const TextStyle(fontSize: 10, color: QuantColors.textMuted),
          ),
        ],
      ),
    );
  }

  Widget _buildEngineArchitectureBanner() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: QuantColors.elevatedCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: const Row(
        children: [
          Icon(Icons.memory_rounded, color: QuantColors.sovereignCyan, size: 22),
          SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'FastCDC 64KB Rabin Boundary Protocol',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: QuantColors.textPrimary,
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  'Blocks are sliced via sub-byte sliding window, hashing only differences. '
                  'Redundant storage is dropped before writing to disk.',
                  style: TextStyle(fontSize: 11, color: QuantColors.textSecondary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildClusterCard(FastCdcDuplicateCluster cluster) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: QuantColors.hairlineBorder),
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
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: QuantColors.sunsetGold.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(Icons.copy_all_rounded, color: QuantColors.sunsetGold, size: 16),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Cluster ${cluster.clusterId}',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: QuantColors.textPrimary,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: QuantColors.statusSuccess.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  'Save ${cluster.formattedReclaimableSize}',
                  style: const TextStyle(
                    fontSize: 11,
                    fontFamily: 'monospace',
                    fontWeight: FontWeight.w700,
                    color: QuantColors.statusSuccess,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            'Primary CAS: ${cluster.primaryHash}... (${cluster.sharedChunkCount} shared chunks)',
            style: const TextStyle(
              fontSize: 11,
              fontFamily: 'monospace',
              color: QuantColors.textSecondary,
            ),
          ),
          const SizedBox(height: 12),
          const Divider(height: 1),
          const SizedBox(height: 10),
          ...cluster.duplicateFiles.map((file) {
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  Icon(file.fileType.icon, size: 16, color: file.fileType.color),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      file.name,
                      style: const TextStyle(fontSize: 12, color: QuantColors.textPrimary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Text(
                    file.formattedSize,
                    style: const TextStyle(
                      fontSize: 11,
                      fontFamily: 'monospace',
                      color: QuantColors.textMuted,
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}
