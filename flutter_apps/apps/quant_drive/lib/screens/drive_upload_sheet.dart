import 'dart:async';
import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../models/drive_models.dart';
import '../data/drive_data_source.dart';

/// Ingestion stage of an individual file in FastCDC pipeline.
enum UploadStage {
  queued('Queued in CAS Pipeline', 0.0),
  partitioning('FastCDC 64KB Partitioning', 0.25),
  gearHashing('64-bit Gear Table Rolling Hash', 0.50),
  deduplicating('CAS Bloom Deduplication Check', 0.75),
  encrypting('AES-256 Envelope Seal', 0.90),
  completed('CAS Committed to Sovereign Tree', 1.0);

  final String label;
  final double defaultProgress;
  const UploadStage(this.label, this.defaultProgress);
}

/// Model representing a queued file inside the chunked upload sheet.
class UploadQueueItem {
  final String id;
  final String name;
  final DriveFileType fileType;
  final int totalBytes;
  final int totalChunks;
  int completedChunks;
  double progress;
  UploadStage stage;
  bool isDeduplicated;
  String casHash;

  UploadQueueItem({
    required this.id,
    required this.name,
    required this.fileType,
    required this.totalBytes,
    required this.totalChunks,
    this.completedChunks = 0,
    this.progress = 0.0,
    this.stage = UploadStage.queued,
    this.isDeduplicated = false,
    required this.casHash,
  });

  String get formattedSize {
    if (totalBytes < 1024 * 1024) {
      return '${(totalBytes / 1024).toStringAsFixed(1)} KB';
    }
    return '${(totalBytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}

/// Multi-File Chunked Upload Sheet
///
/// Features:
/// - Multi-file queue with per-file and aggregate progress bars.
/// - FastCDC 64KB Gear-hash deduplication simulation badge and live telemetry.
/// - AES-256 E2EE vault encryption toggle with Argon2id KDF and StrongBox enclave status.
/// - Zero raw Unicode emojis and zero Skia clipPath calls throughout.
class DriveUploadSheet extends StatefulWidget {
  final ValueChanged<List<DriveItem>>? onUploadComplete;

  const DriveUploadSheet({
    super.key,
    this.onUploadComplete,
  });

  /// Displays the Multi-File Chunked Upload Sheet as a modal bottom sheet.
  static Future<List<DriveItem>?> show(
    BuildContext context, {
    ValueChanged<List<DriveItem>>? onUploadComplete,
  }) {
    return showModalBottomSheet<List<DriveItem>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        side: BorderSide(color: QuantColors.hairlineBorder, width: 1),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(ctx).viewInsets.bottom,
        ),
        child: DriveUploadSheet(
          onUploadComplete: onUploadComplete,
        ),
      ),
    );
  }

  @override
  State<DriveUploadSheet> createState() => _DriveUploadSheetState();
}

class _DriveUploadSheetState extends State<DriveUploadSheet> {
  bool _encryptInVault = false;
  bool _isUploading = false;
  bool _isFinished = false;
  Timer? _uploadTimer;

  late List<UploadQueueItem> _queue;

  @override
  void initState() {
    super.initState();
    _initDefaultQueue();
  }

  @override
  void dispose() {
    _uploadTimer?.cancel();
    super.dispose();
  }

  void _initDefaultQueue() {
    _queue = [
      UploadQueueItem(
        id: 'upload-1',
        name: 'quant_cas_kernel_spec_v2.pdf',
        fileType: DriveFileType.pdf,
        totalBytes: 8388608, // 8 MB
        totalChunks: 128,
        casHash: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
      ),
      UploadQueueItem(
        id: 'upload-2',
        name: 'gear_table_simd_avx512.rs',
        fileType: DriveFileType.code,
        totalBytes: 2097152, // 2 MB
        totalChunks: 32,
        casHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      ),
      UploadQueueItem(
        id: 'upload-3',
        name: 'cluster_helm_snapshot_2026.zip',
        fileType: DriveFileType.zip,
        totalBytes: 33554432, // 32 MB
        totalChunks: 512,
        casHash: 'fcde2b2edba56bf408601fb721fe9b5c338d10ee429ea04fae5511b68fbf8fb9',
      ),
    ];
  }

  void _addMoreSampleFile() {
    final count = _queue.length + 1;
    setState(() {
      _queue.add(
        UploadQueueItem(
          id: 'upload-$count',
          name: 'financial_audit_dataset_0$count.parquet',
          fileType: DriveFileType.doc,
          totalBytes: 16777216, // 16 MB
          totalChunks: 256,
          casHash: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
        ),
      );
    });
  }

  void _startIngestion() {
    setState(() {
      _isUploading = true;
      _isFinished = false;
    });

    _uploadTimer?.cancel();
    _uploadTimer = Timer.periodic(const Duration(milliseconds: 180), (timer) {
      if (!mounted) return;

      bool anyInProgress = false;

      setState(() {
        for (final item in _queue) {
          if (item.stage != UploadStage.completed) {
            anyInProgress = true;
            item.progress = (item.progress + 0.12).clamp(0.0, 1.0);
            item.completedChunks = (item.totalChunks * item.progress).toInt();

            if (item.progress >= 1.0) {
              item.stage = UploadStage.completed;
              item.isDeduplicated = true;
            } else if (item.progress >= 0.85) {
              item.stage = _encryptInVault ? UploadStage.encrypting : UploadStage.deduplicating;
            } else if (item.progress >= 0.50) {
              item.stage = UploadStage.deduplicating;
            } else if (item.progress >= 0.25) {
              item.stage = UploadStage.gearHashing;
            } else {
              item.stage = UploadStage.partitioning;
            }
            break; // Progress files sequentially for high-density visual telemetry
          }
        }
      });

      if (!anyInProgress) {
        timer.cancel();
        setState(() {
          _isUploading = false;
          _isFinished = true;
        });

        // Convert queue items to saved DriveItems
        final uploadedItems = _queue.map((q) {
          return DriveItem(
            id: 'item-${q.id}',
            name: q.name,
            fileType: q.fileType,
            sizeBytes: q.totalBytes,
            modifiedAt: DateTime.now(),
            isEncrypted: _encryptInVault,
            sha256Cas: q.casHash,
            dedupSavingsPercent: 88,
            chunkCount: q.totalChunks,
            path: _encryptInVault ? '/Vault' : '/Uploads',
          );
        }).toList();

        widget.onUploadComplete?.call(uploadedItems);
      }
    });
  }

  double get _aggregateProgress {
    if (_queue.isEmpty) return 0.0;
    final totalSum = _queue.fold<double>(0.0, (sum, item) => sum + item.progress);
    return totalSum / _queue.length;
  }

  int get _totalQueuedBytes {
    return _queue.fold<int>(0, (sum, item) => sum + item.totalBytes);
  }

  int get _totalCompletedBytes {
    return _queue.fold<int>(0, (sum, item) => sum + (item.totalBytes * item.progress).toInt());
  }

  String _formatBytes(int bytes) {
    if (bytes < 1024 * 1024) {
      return '${(bytes / 1024).toStringAsFixed(1)} KB';
    }
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.90,
      ),
      child: Container(
        decoration: const BoxDecoration(
          color: QuantColors.darkSlateCard,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          children: [
            _buildDragHandleAndHeader(),
            const Divider(color: QuantColors.hairlineBorder, height: 1),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildFastCdcGearBadge(),
                    const SizedBox(height: 16),
                    _buildAggregateProgressBar(),
                    const SizedBox(height: 16),
                    _buildVaultEncryptionToggle(),
                    const SizedBox(height: 20),
                    _buildQueueHeader(),
                    const SizedBox(height: 10),
                    _buildQueueList(),
                    const SizedBox(height: 20),
                    _buildActionButtons(),
                    const SizedBox(height: 16),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDragHandleAndHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 16, 12),
      child: Column(
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: QuantColors.activeBorder,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: QuantColors.sovereignCyan.withOpacity(0.18),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(
                      Icons.cloud_upload_rounded,
                      color: QuantColors.sovereignCyan,
                      size: 18,
                    ),
                  ),
                  const SizedBox(width: 10),
                  const Text(
                    'FastCDC CAS Chunk Ingestion',
                    style: QuantTypography.titleLarge,
                  ),
                ],
              ),
              IconButton(
                icon: const Icon(Icons.close_rounded, color: QuantColors.textMuted),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildFastCdcGearBadge() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: QuantColors.voidObsidian,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: QuantColors.sovereignCyan.withOpacity(0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(Icons.memory_rounded, color: QuantColors.sovereignCyan, size: 18),
                  const SizedBox(width: 8),
                  Text(
                    'FastCDC Gear-Hash Engine',
                    style: QuantTypography.bodyMedium.copyWith(
                      fontWeight: FontWeight.w700,
                      color: QuantColors.textPrimary,
                    ),
                  ),
                ],
              ),
              const QuantBadge(
                label: '88% DEDUP SAVED',
                variant: QuantBadgeVariant.success,
                leadingIcon: Icons.bolt_rounded,
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            'Files are chunked into 64KB nominal variable blocks using a 256-entry 64-bit Gear Table. '
            'Identical content addresses are skipped, eliminating network egress and physical SSD writes.',
            style: TextStyle(fontSize: 11, color: QuantColors.textSecondary, height: 1.4),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              _buildMiniChip('Gear Mask: 64KB CAS', Icons.tune_rounded),
              const SizedBox(width: 8),
              _buildMiniChip('Sub-5ms Latency', Icons.speed_rounded),
              const SizedBox(width: 8),
              _buildMiniChip('CAS CAS-Tree', Icons.account_tree_rounded),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMiniChip(String label, IconData icon) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: QuantColors.sovereignCyan),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(fontSize: 10, fontFamily: 'monospace', color: QuantColors.textPrimary),
          ),
        ],
      ),
    );
  }

  Widget _buildAggregateProgressBar() {
    final percent = (_aggregateProgress * 100).toInt();
    final completedStr = _formatBytes(_totalCompletedBytes);
    final totalStr = _formatBytes(_totalQueuedBytes);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: QuantColors.voidObsidian,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                _isFinished
                    ? 'All Chunks Ingested Successfully'
                    : (_isUploading ? 'Chunk Ingestion Streaming...' : 'Queue Ready'),
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: _isFinished ? QuantColors.statusSuccess : QuantColors.textPrimary,
                ),
              ),
              Text(
                '$percent% ($completedStr / $totalStr)',
                style: const TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: QuantColors.sovereignCyan,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: _aggregateProgress,
              minHeight: 8,
              backgroundColor: QuantColors.darkSlateCard,
              valueColor: AlwaysStoppedAnimation<Color>(
                _isFinished ? QuantColors.statusSuccess : QuantColors.sovereignCyan,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVaultEncryptionToggle() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: QuantColors.voidObsidian,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: _encryptInVault ? QuantColors.moltenAmber.withOpacity(0.5) : QuantColors.hairlineBorder,
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: (_encryptInVault ? QuantColors.moltenAmber : QuantColors.textMuted).withOpacity(0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              Icons.lock_rounded,
              color: _encryptInVault ? QuantColors.moltenAmber : QuantColors.textMuted,
              size: 20,
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
                      'AES-256 E2EE Cryptographic Vault',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: QuantColors.textPrimary),
                    ),
                    if (_encryptInVault) ...[
                      const SizedBox(width: 6),
                      const QuantBadge(
                        label: 'STRONGBOX',
                        variant: QuantBadgeVariant.amber,
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  _encryptInVault
                      ? 'Sealed with Argon2id KDF & Android Hardware Keystore Enclave.'
                      : 'Store in standard sovereign CAS content-addressed repository.',
                  style: const TextStyle(fontSize: 11, color: QuantColors.textMuted),
                ),
              ],
            ),
          ),
          Switch(
            value: _encryptInVault,
            activeColor: QuantColors.moltenAmber,
            activeTrackColor: QuantColors.moltenAmber.withOpacity(0.3),
            inactiveThumbColor: QuantColors.textMuted,
            inactiveTrackColor: QuantColors.darkSlateCard,
            onChanged: _isUploading
                ? null
                : (val) {
                    setState(() => _encryptInVault = val);
                  },
          ),
        ],
      ),
    );
  }

  Widget _buildQueueHeader() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          'Upload Queue (${_queue.length} files)',
          style: QuantTypography.bodyMedium.copyWith(fontWeight: FontWeight.w700),
        ),
        if (!_isUploading && !_isFinished)
          TextButton.icon(
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              foregroundColor: QuantColors.sovereignCyan,
            ),
            icon: const Icon(Icons.add_rounded, size: 16),
            label: const Text('Add File', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
            onPressed: _addMoreSampleFile,
          ),
      ],
    );
  }

  Widget _buildQueueList() {
    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: _queue.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        final item = _queue[index];
        final percent = (item.progress * 100).toInt();

        return Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: QuantColors.voidObsidian,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: QuantColors.hairlineBorder),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: item.fileType.color.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(item.fileType.icon, color: item.fileType.color, size: 16),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.name,
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: QuantColors.textPrimary),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${item.formattedSize} · ${item.completedChunks}/${item.totalChunks} chunks · ${item.stage.label}',
                          style: const TextStyle(fontSize: 10, fontFamily: 'monospace', color: QuantColors.textMuted),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '$percent%',
                    style: TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: item.progress >= 1.0 ? QuantColors.statusSuccess : QuantColors.sovereignCyan,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: item.progress,
                  minHeight: 5,
                  backgroundColor: QuantColors.darkSlateCard,
                  valueColor: AlwaysStoppedAnimation<Color>(
                    item.progress >= 1.0 ? QuantColors.statusSuccess : QuantColors.sovereignCyan,
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildActionButtons() {
    return Row(
      children: [
        Expanded(
          child: SquircleButton(
            label: _isFinished ? 'Close' : 'Cancel',
            backgroundColor: QuantColors.elevatedCard,
            textColor: QuantColors.textSecondary,
            border: const BorderSide(color: QuantColors.hairlineBorder),
            onPressed: () => Navigator.of(context).pop(),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          flex: 2,
          child: SquircleButton(
            label: _isFinished
                ? 'Done (${_queue.length} Ingested)'
                : (_isUploading ? 'Chunking...' : 'Start Ingestion'),
            icon: _isFinished
                ? Icons.check_circle_rounded
                : (_isUploading ? Icons.hourglass_top_rounded : Icons.bolt_rounded),
            backgroundColor: _isFinished ? QuantColors.statusSuccess : QuantColors.sovereignCyan,
            textColor: QuantColors.voidObsidian,
            isLoading: _isUploading,
            onPressed: _isUploading
                ? null
                : (_isFinished ? () => Navigator.of(context).pop() : _startIngestion),
          ),
        ),
      ],
    );
  }
}
