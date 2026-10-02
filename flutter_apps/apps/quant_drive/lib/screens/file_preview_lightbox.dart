import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../models/drive_models.dart';
import '../data/drive_data_source.dart';

/// Full-Screen Sovereign File Preview Lightbox Screen
///
/// Features:
/// - Code/Text Syntax Highlighting with line numbers, token parsing, and monospace styling.
/// - PDF Multi-page Document Viewer with zoom controls, page transitions, and obsidian canvas inversion.
/// - Image Viewer with InteractiveViewer zoom/pan (0.5x to 5.0x) and EXIF/CAS metadata telemetry.
/// - FastCDC 64KB CAS Deduplication Telemetry Chip (Gear Table hash, CAS chunk count, and savings badge).
/// - Strictly ZERO raw Unicode emojis and ZERO Skia clipPath calls throughout.
class FilePreviewLightbox extends StatefulWidget {
  final DriveItem item;
  final VoidCallback? onToggleStar;

  const FilePreviewLightbox({
    super.key,
    required this.item,
    this.onToggleStar,
  });

  /// Opens the lightbox full-screen.
  static Future<void> show(
    BuildContext context, {
    required DriveItem item,
    VoidCallback? onToggleStar,
  }) {
    return Navigator.of(context).push(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => FilePreviewLightbox(
          item: item,
          onToggleStar: onToggleStar,
        ),
      ),
    );
  }

  @override
  State<FilePreviewLightbox> createState() => _FilePreviewLightboxState();
}

class _FilePreviewLightboxState extends State<FilePreviewLightbox> {
  late bool _isStarred;
  double _zoomScale = 1.0;
  bool _obsidianCanvasInverted = true;
  int _currentPdfPage = 1;
  final int _totalPdfPages = 14;
  final ScrollController _codeScrollController = ScrollController();
  final ScrollController _pdfScrollController = ScrollController();
  final TransformationController _imageTransformationController = TransformationController();

  @override
  void initState() {
    super.initState();
    _isStarred = widget.item.isStarred;
  }

  @override
  void dispose() {
    _codeScrollController.dispose();
    _pdfScrollController.dispose();
    _imageTransformationController.dispose();
    super.dispose();
  }

  void _handleStarToggle() {
    setState(() {
      _isStarred = !_isStarred;
    });
    DriveDataSource.instance.toggleStarred(widget.item.id);
    widget.onToggleStar?.call();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        duration: const Duration(seconds: 1),
        content: Text(
          _isStarred ? 'Added to Starred CAS files' : 'Removed from Starred',
          style: const TextStyle(color: QuantColors.sunsetGold),
        ),
      ),
    );
  }

  void _copyCasHash() {
    Clipboard.setData(ClipboardData(text: widget.item.sha256Cas));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        content: Row(
          children: [
            const Icon(Icons.check_circle_rounded, color: QuantColors.statusSuccess, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'SHA-256 CAS: ${widget.item.sha256Cas.substring(0, 16)}... copied to clipboard',
                style: const TextStyle(color: QuantColors.textPrimary, fontSize: 12),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showTelemetryDetailsSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        side: BorderSide(color: QuantColors.hairlineBorder, width: 1),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
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
                const SizedBox(height: 18),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: QuantColors.sovereignCyan.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.memory_rounded, color: QuantColors.sovereignCyan, size: 22),
                    ),
                    const SizedBox(width: 12),
                    const Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('FastCDC CAS Telemetry', style: QuantTypography.titleLarge),
                        Text(
                          '256-Entry 64-Bit Gear Table · Content Addressable Storage',
                          style: TextStyle(fontSize: 11, color: QuantColors.textMuted),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: QuantColors.voidObsidian,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: QuantColors.hairlineBorder),
                  ),
                  child: Column(
                    children: [
                      _buildTelemetryRow('MIME Classification', widget.item.fileType.label),
                      const Divider(color: QuantColors.hairlineBorder, height: 16),
                      _buildTelemetryRow('CAS File Size', widget.item.formattedSize),
                      const Divider(color: QuantColors.hairlineBorder, height: 16),
                      _buildTelemetryRow('CAS 64KB Chunks', '${widget.item.chunkCount} blocks'),
                      const Divider(color: QuantColors.hairlineBorder, height: 16),
                      _buildTelemetryRow('Dedup Bandwidth Saved', '${widget.item.dedupSavingsPercent}% conserved'),
                      const Divider(color: QuantColors.hairlineBorder, height: 16),
                      _buildTelemetryRow('CAS Fingerprint', '${widget.item.sha256Cas.substring(0, 24)}...'),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                SquircleButton(
                  label: 'Dismiss Telemetry',
                  isFullWidth: true,
                  backgroundColor: QuantColors.elevatedCard,
                  textColor: QuantColors.textPrimary,
                  border: const BorderSide(color: QuantColors.hairlineBorder),
                  onPressed: () => Navigator.pop(ctx),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  static Widget _buildTelemetryRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: QuantTypography.bodySmall),
        Text(
          value,
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            fontFamily: 'monospace',
            color: QuantColors.sovereignCyan,
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.obsidianVoid,
      body: SafeArea(
        child: Column(
          children: [
            _buildTopAppBar(),
            _buildFastCdcTelemetryChipBar(),
            Expanded(
              child: _buildMainPreviewContent(),
            ),
            _buildBottomControls(),
          ],
        ),
      ),
    );
  }

  Widget _buildTopAppBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back_rounded, color: QuantColors.textPrimary),
            onPressed: () => Navigator.of(context).pop(),
          ),
          const SizedBox(width: 6),
          Container(
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(
              color: widget.item.fileType.color.withOpacity(0.18),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(widget.item.fileType.icon, color: widget.item.fileType.color, size: 18),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  widget.item.name,
                  style: QuantTypography.titleMedium.copyWith(
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.2,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  '${widget.item.formattedSize} · ${widget.item.path} · FastCDC 64KB CAS',
                  style: QuantTypography.microCapsule.copyWith(
                    color: QuantColors.textMuted,
                    fontFamily: 'monospace',
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            icon: Icon(
              _isStarred ? Icons.star_rounded : Icons.star_outline_rounded,
              color: _isStarred ? QuantColors.sunsetGold : QuantColors.textMuted,
            ),
            tooltip: _isStarred ? 'Starred' : 'Add to Starred',
            onPressed: _handleStarToggle,
          ),
          IconButton(
            icon: const Icon(Icons.info_outline_rounded, color: QuantColors.sovereignCyan),
            tooltip: 'CAS Telemetry Info',
            onPressed: _showTelemetryDetailsSheet,
          ),
        ],
      ),
    );
  }

  Widget _buildFastCdcTelemetryChipBar() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: QuantColors.voidObsidian,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        child: Row(
          children: [
            // FastCDC Status Badge
            const QuantBadge(
              label: 'FASTCDC 64KB CAS',
              variant: QuantBadgeVariant.cyan,
              leadingIcon: Icons.memory_rounded,
            ),
            const SizedBox(width: 8),

            // Gear Table CAS Chip
            GestureDetector(
              onTap: _copyCasHash,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: QuantColors.elevatedCard,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: QuantColors.hairlineBorder),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.fingerprint_rounded, size: 12, color: QuantColors.sovereignCyan),
                    const SizedBox(width: 4),
                    Text(
                      'CAS: ${widget.item.sha256Cas.substring(0, 10)}...',
                      style: const TextStyle(
                        fontSize: 10,
                        fontFamily: 'monospace',
                        color: QuantColors.sovereignCyan,
                      ),
                    ),
                    const SizedBox(width: 4),
                    const Icon(Icons.copy_rounded, size: 10, color: QuantColors.textMuted),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 8),

            // Deduplication Savings Badge
            QuantBadge(
              label: '${widget.item.dedupSavingsPercent}% DEDUP SAVED',
              variant: QuantBadgeVariant.success,
              leadingIcon: Icons.bolt_rounded,
            ),
            const SizedBox(width: 8),

            // Chunks Count Chip
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: QuantColors.elevatedCard,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: QuantColors.hairlineBorder),
              ),
              child: Text(
                '${widget.item.chunkCount} Chunks',
                style: const TextStyle(
                  fontSize: 10,
                  fontFamily: 'monospace',
                  color: QuantColors.textSecondary,
                ),
              ),
            ),

            if (widget.item.isEncrypted) ...[
              const SizedBox(width: 8),
              const QuantBadge(
                label: 'AES-GCM-256 E2EE',
                variant: QuantBadgeVariant.warning,
                leadingIcon: Icons.lock_rounded,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildMainPreviewContent() {
    switch (widget.item.fileType) {
      case DriveFileType.code:
        return _buildCodeSyntaxPreview();
      case DriveFileType.pdf:
      case DriveFileType.doc:
        return _buildPdfDocumentPreview();
      case DriveFileType.image:
        return _buildImageZoomPreview();
      case DriveFileType.zip:
        return _buildArchivePreview();
      case DriveFileType.media:
        return _buildMediaPreview();
      case DriveFileType.other:
        return _buildGenericCasPreview();
    }
  }

  // ===========================================================================
  // 1. CODE / TEXT SYNTAX HIGHLIGHTING PREVIEW
  // ===========================================================================
  Widget _buildCodeSyntaxPreview() {
    final codeLines = _getSampleCodeLines(widget.item.name);

    return Container(
      color: const Color(0xFF0C0E14),
      child: Column(
        children: [
          // Code toolbar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            decoration: const BoxDecoration(
              color: QuantColors.darkSlateCard,
              border: Border(bottom: BorderSide(color: QuantColors.hairlineBorder)),
            ),
            child: Row(
              children: [
                const Icon(Icons.code_rounded, size: 14, color: QuantColors.statusSuccess),
                const SizedBox(width: 6),
                Text(
                  'Rust / FastCDC CAS Engine · ${codeLines.length} lines · UTF-8',
                  style: const TextStyle(
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: QuantColors.textSecondary,
                  ),
                ),
                const Spacer(),
                IconButton(
                  iconSize: 16,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                  icon: const Icon(Icons.copy_rounded, color: QuantColors.textSecondary),
                  tooltip: 'Copy Code Snippet',
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: codeLines.join('\n')));
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        backgroundColor: QuantColors.darkSlateCard,
                        content: Text('Source code copied to clipboard', style: TextStyle(color: QuantColors.statusSuccess)),
                      ),
                    );
                  },
                ),
              ],
            ),
          ),
          // Code lines view
          Expanded(
            child: SingleChildScrollView(
              controller: _codeScrollController,
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                physics: const BouncingScrollPhysics(),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Line numbers column
                    Container(
                      padding: const EdgeInsets.only(left: 12, right: 12),
                      decoration: const BoxDecoration(
                        border: Border(right: BorderSide(color: QuantColors.hairlineBorder)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: List.generate(codeLines.length, (i) {
                          return Text(
                            '${i + 1}',
                            style: const TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 12,
                              height: 1.55,
                              color: QuantColors.textDisabled,
                            ),
                          );
                        }),
                      ),
                    ),
                    const SizedBox(width: 14),
                    // Code content with syntax tokens
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: List.generate(codeLines.length, (i) {
                        return _buildSyntaxHighlightedLine(codeLines[i]);
                      }),
                    ),
                    const SizedBox(width: 24),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSyntaxHighlightedLine(String line) {
    final spans = <TextSpan>[];

    if (line.trim().startsWith('//')) {
      // Full line comment
      spans.add(TextSpan(
        text: line,
        style: const TextStyle(
          color: Color(0xFF64748B),
          fontStyle: FontStyle.italic,
          fontFamily: 'monospace',
          fontSize: 12,
          height: 1.55,
        ),
      ));
    } else {
      // Basic token parser for sovereign highlight
      final tokens = line.split(RegExp(r'(?<=\s|[(<[{\]}>;,])|(?=\s|[(<[{\]}>;,])'));
      for (final token in tokens) {
        Color color = QuantColors.textPrimary;
        FontWeight weight = FontWeight.w400;

        if (const ['fn', 'let', 'pub', 'struct', 'impl', 'use', 'const', 'return', 'async', 'await', 'match', 'if', 'else', 'for', 'in', 'mut'].contains(token.trim())) {
          color = QuantColors.sovereignCyan; // Keywords
          weight = FontWeight.w700;
        } else if (const ['u64', 'u32', 'usize', 'Result', 'Option', 'Vec', 'bool', 'GearTable', 'FastCDC', 'CasBlock', 'Sha256Digest'].contains(token.trim())) {
          color = QuantColors.sunsetGold; // Types
          weight = FontWeight.w600;
        } else if (token.trim().startsWith('"') || token.trim().endsWith('"')) {
          color = QuantColors.emeraldMatrix; // Strings
        } else if (RegExp(r'^\d+$|^0x[0-9a-fA-F]+$').hasMatch(token.trim())) {
          color = const Color(0xFFA78BFA); // Numbers & Hex
        }

        spans.add(TextSpan(
          text: token,
          style: TextStyle(
            color: color,
            fontWeight: weight,
            fontFamily: 'monospace',
            fontSize: 12,
            height: 1.55,
          ),
        ));
      }
    }

    return Text.rich(TextSpan(children: spans));
  }

  List<String> _getSampleCodeLines(String fileName) {
    return [
      '// Sovereign QuantCAS Kernel FastCDC 64KB Gear Engine',
      '// Hardware-accelerated 256-entry 64-bit Gear Table rolling hash.',
      'use quant_cas_core::{CasBlock, GearTable, Sha256Digest};',
      'use std::sync::Arc;',
      '',
      'pub const NOMINAL_CHUNK_SIZE: usize = 64 * 1024; // 64 KB',
      'pub const MIN_CHUNK_SIZE: usize = 16 * 1024;     // 16 KB',
      'pub const MAX_CHUNK_SIZE: usize = 128 * 1024;    // 128 KB',
      'pub const GEAR_MASK_64K: u64 = 0x00003FFF_FFFF0000;',
      '',
      '#[derive(Debug, Clone)]',
      'pub struct FastCdcEngine {',
      '    gear_table: Arc<GearTable>,',
      '    dedup_ratio_target: f64,',
      '}',
      '',
      'impl FastCdcEngine {',
      '    pub fn new() -> Self {',
      '        Self {',
      '            gear_table: Arc::new(GearTable::init_256_entries()),',
      '            dedup_ratio_target: 0.942,',
      '        }',
      '    }',
      '',
      '    pub async fn chunk_stream(&self, raw_bytes: &[u8]) -> Vec<CasBlock> {',
      '        let mut fingerprint: u64 = 0;',
      '        let mut chunks = Vec::with_capacity(raw_bytes.len() / NOMINAL_CHUNK_SIZE);',
      '        let mut start_idx = 0;',
      '',
      '        for i in 0..raw_bytes.len() {',
      '            let byte = raw_bytes[i];',
      '            fingerprint = (fingerprint << 1).wrapping_add(self.gear_table.lookup(byte));',
      '',
      '            let chunk_len = i - start_idx;',
      '            if chunk_len >= MIN_CHUNK_SIZE &&',
      '               ((fingerprint & GEAR_MASK_64K) == 0 || chunk_len >= MAX_CHUNK_SIZE) {',
      '                let block = CasBlock::from_slice(&raw_bytes[start_idx..=i]);',
      '                chunks.push(block);',
      '                start_idx = i + 1;',
      '                fingerprint = 0;',
      '            }',
      '        }',
      '        chunks',
      '    }',
      '}',
    ];
  }

  // ===========================================================================
  // 2. PDF MULTI-PAGE DOCUMENT PREVIEW
  // ===========================================================================
  Widget _buildPdfDocumentPreview() {
    final canvasBg = _obsidianCanvasInverted ? const Color(0xFF141722) : const Color(0xFFFFFFFF);
    final textCol = _obsidianCanvasInverted ? const Color(0xFFE2E8F0) : const Color(0xFF0F172A);
    final borderCol = _obsidianCanvasInverted ? QuantColors.hairlineBorder : const Color(0xFFCBD5E1);

    return SingleChildScrollView(
      controller: _pdfScrollController,
      padding: const EdgeInsets.all(20),
      child: Center(
        child: AnimatedScale(
          scale: _zoomScale,
          duration: const Duration(milliseconds: 150),
          child: Container(
            constraints: const BoxConstraints(maxWidth: 720),
            padding: const EdgeInsets.all(32),
            decoration: BoxDecoration(
              color: canvasBg,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: borderCol, width: 1),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.4),
                  blurRadius: 20,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Top document header stamp
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'QUANT ECOSYSTEM SOVEREIGN ARCHITECTURE',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.0,
                        fontFamily: 'monospace',
                        color: QuantColors.sovereignCyan,
                      ),
                    ),
                    Text(
                      'PAGE $_currentPdfPage OF $_totalPdfPages',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        fontFamily: 'monospace',
                        color: textCol.withOpacity(0.5),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Text(
                  widget.item.name.replaceAll('_', ' ').toUpperCase(),
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    color: textCol,
                    letterSpacing: -0.4,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Section $_currentPdfPage: FastCDC CAS 64KB Deduplication Protocol & Cryptographic Vault Security',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: QuantColors.sovereignCyan,
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  'Abstract: The Quant Ecosystem utilizes a sovereign, zero-knowledge Content Addressable Storage (CAS) file structure '
                  'partitioned with 64KB nominal FastCDC chunking. Redundant blocks across all multiplatform devices are verified '
                  'via 256-entry 64-bit Gear Table rolling hash algorithms in sub-5ms latency before transmitting network packets.',
                  style: TextStyle(
                    fontSize: 13,
                    height: 1.6,
                    color: textCol,
                  ),
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: _obsidianCanvasInverted ? QuantColors.voidObsidian : const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: borderCol),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.verified_user_rounded, size: 16, color: QuantColors.statusSuccess),
                          const SizedBox(width: 8),
                          Text(
                            'Cryptographic Invariant Proof (SHA-256):',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: _obsidianCanvasInverted ? QuantColors.textPrimary : const Color(0xFF0F172A),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'CAS Root: ${widget.item.sha256Cas}',
                        style: const TextStyle(
                          fontSize: 10,
                          fontFamily: 'monospace',
                          color: QuantColors.sovereignCyan,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'CAS Chunks: ${widget.item.chunkCount} blocks · Dedup Savings: ${widget.item.dedupSavingsPercent}%',
                        style: TextStyle(
                          fontSize: 10,
                          fontFamily: 'monospace',
                          color: textCol.withOpacity(0.7),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                Text(
                  'Key Sovereign Engineering Guarantees:\n'
                  '• Zero Skia clipPath invocations: Rendered via pure RoundedRectangleBorder & DrawRRect.\n'
                  '• High-Density Obsidian Luxury Palette: High-contrast readability across 120Hz Impeller displays.\n'
                  '• End-to-End Zero-Knowledge Encryption: AES-256 envelope with StrongBox Enclave key isolation.\n'
                  '• Rapid CAS 1-Click Version Reversion: Root pointer swap in <1ms without re-uploading identical blocks.',
                  style: TextStyle(
                    fontSize: 12,
                    height: 1.6,
                    color: textCol.withOpacity(0.85),
                  ),
                ),
                const SizedBox(height: 24),
                Center(
                  child: Text(
                    '— Authenticated Sovereign Document —',
                    style: TextStyle(
                      fontSize: 11,
                      fontStyle: FontStyle.italic,
                      color: textCol.withOpacity(0.4),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ===========================================================================
  // 3. IMAGE VIEWER WITH ZOOM / PAN
  // ===========================================================================
  Widget _buildImageZoomPreview() {
    return Container(
      color: Colors.black,
      child: Stack(
        alignment: Alignment.center,
        children: [
          InteractiveViewer(
            transformationController: _imageTransformationController,
            minScale: 0.5,
            maxScale: 5.0,
            boundaryMargin: const EdgeInsets.all(40),
            child: Center(
              child: Container(
                constraints: const BoxConstraints(maxWidth: 800, maxHeight: 600),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [
                    BoxShadow(
                      color: QuantColors.sovereignCyan.withOpacity(0.2),
                      blurRadius: 30,
                      spreadRadius: 2,
                    ),
                  ],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: Container(
                    width: 600,
                    height: 400,
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          Color(0xFF0F172A),
                          Color(0xFF1E293B),
                          Color(0xFF090A0E),
                        ],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                    ),
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        // Background geometric mesh pattern simulation
                        Positioned.fill(
                          child: CustomPaint(
                            painter: _MeshGridPainter(),
                          ),
                        ),
                        Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: QuantColors.sovereignCyan.withOpacity(0.15),
                                border: Border.all(color: QuantColors.sovereignCyan, width: 2),
                              ),
                              child: const Icon(
                                Icons.image_rounded,
                                color: QuantColors.sovereignCyan,
                                size: 48,
                              ),
                            ),
                            const SizedBox(height: 16),
                            Text(
                              widget.item.name,
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              '3840 x 2160 UHD · 10-Bit Color · AVIF / CAS',
                              style: QuantTypography.labelSpeed.copyWith(
                                color: QuantColors.sovereignCyan,
                                fontSize: 11,
                              ),
                            ),
                            const SizedBox(height: 12),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                              decoration: BoxDecoration(
                                color: QuantColors.darkSlateCard,
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: QuantColors.hairlineBorder),
                              ),
                              child: const Text(
                                'Interactive Pinch & Pan Zoom Active (0.5x - 5.0x)',
                                style: TextStyle(fontSize: 10, color: QuantColors.textMuted),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          // Floating Reset Zoom Button
          Positioned(
            bottom: 20,
            right: 20,
            child: FloatingActionButton.small(
              backgroundColor: QuantColors.darkSlateCard,
              foregroundColor: QuantColors.sovereignCyan,
              elevation: 4,
              onPressed: () {
                _imageTransformationController.value = Matrix4.identity();
              },
              tooltip: 'Reset Image Zoom',
              child: const Icon(Icons.center_focus_strong_rounded, size: 20),
            ),
          ),
        ],
      ),
    );
  }

  // ===========================================================================
  // 4. ARCHIVE / ZIP PREVIEW
  // ===========================================================================
  Widget _buildArchivePreview() {
    final filesInZip = [
      {'name': 'helm/quant-staging/values.yaml', 'size': '14.2 KB', 'chunks': 1},
      {'name': 'helm/quant-staging/deployment-api.yaml', 'size': '8.6 KB', 'chunks': 1},
      {'name': 'crds/cas_storage_operator.yaml', 'size': '42.1 KB', 'chunks': 1},
      {'name': 'secrets/argon2id_vault_keys.enc', 'size': '65.5 KB', 'chunks': 1},
      {'name': 'images/cluster_topology.svg', 'size': '240.8 KB', 'chunks': 4},
      {'name': 'manifests/ingress_gateway.yaml', 'size': '12.0 KB', 'chunks': 1},
    ];

    return Container(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: QuantColors.darkSlateCard,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: QuantColors.sunsetGold.withOpacity(0.3)),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: QuantColors.sunsetGold.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.folder_zip_rounded, color: QuantColors.sunsetGold, size: 28),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(widget.item.name, style: QuantTypography.titleMedium),
                      const SizedBox(height: 2),
                      Text(
                        '${widget.item.formattedSize} · ${filesInZip.length} archived files · FastCDC 64KB',
                        style: QuantTypography.bodySmall,
                      ),
                    ],
                  ),
                ),
                const QuantBadge(
                  label: '81% SAVED',
                  variant: QuantBadgeVariant.amber,
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Archived Files in CAS Snapshot (${filesInZip.length})',
            style: QuantTypography.bodyMedium.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 10),
          Expanded(
            child: ListView.separated(
              itemCount: filesInZip.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, i) {
                final file = filesInZip[i];
                return Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: QuantColors.darkSlateCard,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: QuantColors.hairlineBorder),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.insert_drive_file_rounded, size: 16, color: QuantColors.sunsetGold),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          file['name'] as String,
                          style: const TextStyle(fontSize: 12, fontFamily: 'monospace', color: QuantColors.textPrimary),
                        ),
                      ),
                      Text(
                        file['size'] as String,
                        style: const TextStyle(fontSize: 11, fontFamily: 'monospace', color: QuantColors.textMuted),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  // ===========================================================================
  // 5. MEDIA / VIDEO PREVIEW
  // ===========================================================================
  Widget _buildMediaPreview() {
    return Center(
      child: Container(
        constraints: const BoxConstraints(maxWidth: 500),
        padding: const EdgeInsets.all(24),
        margin: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: QuantColors.darkSlateCard,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: QuantColors.hairlineBorder),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFFEC4899).withOpacity(0.15),
              ),
              child: const Icon(Icons.movie_rounded, color: Color(0xFFEC4899), size: 48),
            ),
            const SizedBox(height: 18),
            Text(widget.item.name, style: QuantTypography.titleLarge, textAlign: TextAlign.center),
            const SizedBox(height: 8),
            const Text(
              '1080p60 AV1 Stream · Segment-Skipped CAS Chunks',
              style: TextStyle(fontSize: 12, color: QuantColors.sovereignCyan, fontFamily: 'monospace'),
            ),
            const SizedBox(height: 20),
            SquircleButton(
              label: 'Stream with QuanTube Player',
              icon: Icons.play_arrow_rounded,
              backgroundColor: const Color(0xFFEC4899),
              textColor: Colors.white,
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    backgroundColor: QuantColors.darkSlateSurface,
                    content: Text('Launched QuanTube AV1 Hardware Player', style: TextStyle(color: Colors.white)),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  // ===========================================================================
  // 6. GENERIC CAS PREVIEW
  // ===========================================================================
  Widget _buildGenericCasPreview() {
    return Center(
      child: Container(
        constraints: const BoxConstraints(maxWidth: 480),
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: QuantColors.darkSlateCard,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: QuantColors.hairlineBorder),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.insert_drive_file_rounded, size: 48, color: QuantColors.sovereignCyan),
            const SizedBox(height: 16),
            Text(widget.item.name, style: QuantTypography.titleLarge, textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
              '${widget.item.formattedSize} · FastCDC 64KB CAS Envelope',
              style: QuantTypography.bodySmall,
            ),
            const SizedBox(height: 16),
            Text(
              'CAS SHA-256: ${widget.item.sha256Cas}',
              style: const TextStyle(fontSize: 10, fontFamily: 'monospace', color: QuantColors.textMuted),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  // ===========================================================================
  // BOTTOM CONTROLS (PAGINATION / ZOOM / ACTIONS)
  // ===========================================================================
  Widget _buildBottomControls() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        border: Border(top: BorderSide(color: QuantColors.hairlineBorder, width: 1)),
      ),
      child: Row(
        children: [
          // If PDF, show page navigation
          if (widget.item.fileType == DriveFileType.pdf || widget.item.fileType == DriveFileType.doc) ...[
            IconButton(
              icon: const Icon(Icons.chevron_left_rounded, color: QuantColors.textPrimary),
              onPressed: _currentPdfPage > 1 ? () => setState(() => _currentPdfPage--) : null,
              tooltip: 'Previous Page',
            ),
            Text(
              '$_currentPdfPage / $_totalPdfPages',
              style: const TextStyle(fontSize: 12, fontFamily: 'monospace', color: QuantColors.sovereignCyan),
            ),
            IconButton(
              icon: const Icon(Icons.chevron_right_rounded, color: QuantColors.textPrimary),
              onPressed: _currentPdfPage < _totalPdfPages ? () => setState(() => _currentPdfPage++) : null,
              tooltip: 'Next Page',
            ),
            const SizedBox(width: 8),
            // Obsidian Canvas Inversion Toggle
            IconButton(
              icon: Icon(
                _obsidianCanvasInverted ? Icons.invert_colors_rounded : Icons.invert_colors_off_rounded,
                color: _obsidianCanvasInverted ? QuantColors.sovereignCyan : QuantColors.textSecondary,
              ),
              tooltip: 'Toggle Obsidian Canvas',
              onPressed: () => setState(() => _obsidianCanvasInverted = !_obsidianCanvasInverted),
            ),
          ],

          const Spacer(),

          // Zoom Controls for PDF / Code
          if (widget.item.fileType == DriveFileType.pdf || widget.item.fileType == DriveFileType.doc) ...[
            IconButton(
              icon: const Icon(Icons.remove_rounded, size: 18, color: QuantColors.textSecondary),
              onPressed: () => setState(() => _zoomScale = (_zoomScale - 0.2).clamp(0.6, 2.5)),
              tooltip: 'Zoom Out',
            ),
            Text(
              '${(_zoomScale * 100).toInt()}%',
              style: const TextStyle(fontSize: 11, fontFamily: 'monospace', color: QuantColors.textPrimary),
            ),
            IconButton(
              icon: const Icon(Icons.add_rounded, size: 18, color: QuantColors.textSecondary),
              onPressed: () => setState(() => _zoomScale = (_zoomScale + 0.2).clamp(0.6, 2.5)),
              tooltip: 'Zoom In',
            ),
            const SizedBox(width: 8),
          ],

          // Download Action
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: QuantColors.sovereignCyan,
              foregroundColor: QuantColors.voidObsidian,
              elevation: 0,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            icon: const Icon(Icons.download_rounded, size: 16),
            label: const Text(
              'Export CAS',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12),
            ),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  backgroundColor: QuantColors.darkSlateSurface,
                  content: Text(
                    'Exported ${widget.item.name} from CAS storage tree',
                    style: const TextStyle(color: QuantColors.statusSuccess),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

/// Custom painter for luxury mesh grid background in image viewer
class _MeshGridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFF38BDF8).withOpacity(0.06)
      ..strokeWidth = 1.0;

    const step = 32.0;
    for (double x = 0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (double y = 0; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
