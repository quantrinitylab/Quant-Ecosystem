// Sovereign Quant Ecosystem - QuantChat High-Density Media Sheet
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/chat_models.dart';

class ChatMediaSheet extends StatefulWidget {
  final Function(ChatMediaType type, Map<String, dynamic> data)? onActionSelected;

  const ChatMediaSheet({
    super.key,
    this.onActionSelected,
  });

  static Future<Map<String, dynamic>?> show(
    BuildContext context, {
    Function(ChatMediaType type, Map<String, dynamic> data)? onActionSelected,
  }) {
    return showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => ChatMediaSheet(onActionSelected: onActionSelected),
    );
  }

  @override
  State<ChatMediaSheet> createState() => _ChatMediaSheetState();
}

class _ChatMediaSheetState extends State<ChatMediaSheet> {
  ChatMediaType? _activePreviewType;
  late final FastCDCPreview _fastCdcSample;

  @override
  void initState() {
    super.initState();
    _fastCdcSample = const FastCDCPreview(
      fileName: 'Quant_Mesh_Specification_v3.pdf',
      fileSizeBytes: 4404019, // 4.2 MB
      chunkCount: 68,
      averageChunkSizeKb: 64,
      sha256Fingerprint: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      deduplicationRatio: 3.4,
    );
  }

  void _selectAction(ChatMediaType type) {
    if (type == ChatMediaType.document || type == ChatMediaType.location) {
      setState(() {
        _activePreviewType = type;
      });
    } else {
      _dispatchSelection(type, _buildMockPayload(type));
    }
  }

  void _dispatchSelection(ChatMediaType type, Map<String, dynamic> payload) {
    widget.onActionSelected?.call(type, payload);
    Navigator.of(context).pop(payload);
  }

  Map<String, dynamic> _buildMockPayload(ChatMediaType type) {
    switch (type) {
      case ChatMediaType.document:
        return {
          'type': 'document',
          'fileName': _fastCdcSample.fileName,
          'fileSizeBytes': _fastCdcSample.fileSizeBytes,
          'chunkCount': _fastCdcSample.chunkCount,
          'sha256': _fastCdcSample.sha256Fingerprint,
          'dedupRatio': _fastCdcSample.deduplicationRatio,
        };
      case ChatMediaType.camera:
        return {
          'type': 'camera',
          'resolution': '1080p60',
          'timestamp': DateTime.now().toIso8601String(),
          'path': '/storage/encrypted/camera_capture_001.jpg',
        };
      case ChatMediaType.gallery:
        return {
          'type': 'gallery',
          'count': 1,
          'resolution': '4K HDR',
          'path': '/storage/encrypted/gallery_photo_4k.png',
        };
      case ChatMediaType.audio:
        return {
          'type': 'audio',
          'format': 'Opus 48kHz',
          'durationSeconds': 15,
          'bitrate': '128kbps',
        };
      case ChatMediaType.location:
        return {
          'type': 'location',
          'latitude': 37.7749,
          'longitude': -122.4194,
          'locationName': 'Quant Ecosystem Staging Datacenter (SF)',
          'accuracyMeters': 2.4,
        };
      case ChatMediaType.contact:
        return {
          'type': 'contact',
          'contactName': 'CEO Astra',
          'handle': '@astra.ceo',
          'publicKeyFingerprint': 'ED25519-8F92-A104-D309',
        };
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(24),
          topRight: Radius.circular(24),
        ),
        border: Border(
          top: BorderSide(color: QuantColors.hairlineBorder, width: 1.5),
          left: BorderSide(color: QuantColors.hairlineBorder, width: 1),
          right: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Top Drag Handle & Title
            _buildDragHandleAndTitle(),

            // 6 High-Density Squircle Actions Grid
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              child: _buildSixSquircleGrid(),
            ),

            // Optional FastCDC or Location Preview Panel
            if (_activePreviewType != null) ...[
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                child: _buildActivePreviewCard(),
              ),
            ],

            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }

  Widget _buildDragHandleAndTitle() {
    return Container(
      padding: const EdgeInsets.only(top: 10, bottom: 12, left: 20, right: 20),
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(24),
          topRight: Radius.circular(24),
        ),
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Column(
        children: [
          Container(
            width: 38,
            height: 4,
            decoration: BoxDecoration(
              color: QuantColors.activeBorder,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: QuantColors.moltenOrange.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: QuantColors.moltenOrange.withOpacity(0.4)),
                ),
                child: const Icon(
                  Icons.attachment_rounded,
                  color: QuantColors.moltenOrange,
                  size: 18,
                ),
              ),
              const SizedBox(width: 10),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Share Encrypted Media & Data',
                      style: TextStyle(
                        color: QuantColors.textPrimary,
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      'FastCDC Content-Defined Chunking · Local Keystore E2EE',
                      style: TextStyle(
                        color: QuantColors.textSecondary,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close_rounded, color: QuantColors.textSecondary, size: 20),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSixSquircleGrid() {
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: _buildSquircleButton(
                type: ChatMediaType.document,
                icon: Icons.insert_drive_file_rounded,
                label: 'Document',
                subtitle: 'FastCDC Preview',
                accentColor: QuantColors.crimsonRed,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _buildSquircleButton(
                type: ChatMediaType.camera,
                icon: Icons.camera_alt_rounded,
                label: 'Camera',
                subtitle: 'Instant Capture',
                accentColor: QuantColors.moltenOrange,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _buildSquircleButton(
                type: ChatMediaType.gallery,
                icon: Icons.photo_library_rounded,
                label: 'Gallery',
                subtitle: 'HD Photos & 4K',
                accentColor: QuantColors.sovereignCyan,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _buildSquircleButton(
                type: ChatMediaType.audio,
                icon: Icons.mic_rounded,
                label: 'Audio Note',
                subtitle: 'Opus Encrypted',
                accentColor: QuantColors.obsidianPurple,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _buildSquircleButton(
                type: ChatMediaType.location,
                icon: Icons.location_on_rounded,
                label: 'Location',
                subtitle: 'Sovereign GPS',
                accentColor: QuantColors.emeraldMatrix,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _buildSquircleButton(
                type: ChatMediaType.contact,
                icon: Icons.person_pin_rounded,
                label: 'Contact',
                subtitle: 'vCard Key',
                accentColor: QuantColors.sunsetGold,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildSquircleButton({
    required ChatMediaType type,
    required IconData icon,
    required String label,
    required String subtitle,
    required Color accentColor,
  }) {
    final isSelected = _activePreviewType == type;

    return InkWell(
      onTap: () => _selectAction(type),
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
        decoration: BoxDecoration(
          color: isSelected ? accentColor.withOpacity(0.12) : QuantColors.darkSlateCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? accentColor : QuantColors.hairlineBorder,
            width: isSelected ? 1.5 : 1,
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Squircle Vector Icon Container
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: accentColor.withOpacity(0.18),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: accentColor.withOpacity(0.5),
                  width: 1,
                ),
              ),
              child: Icon(icon, color: accentColor, size: 22),
            ),
            const SizedBox(height: 8),
            Text(
              label,
              style: const TextStyle(
                color: QuantColors.textPrimary,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              subtitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: isSelected ? accentColor : QuantColors.textMuted,
                fontSize: 10,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActivePreviewCard() {
    if (_activePreviewType == ChatMediaType.document) {
      return _buildFastCdcPreviewPanel();
    } else if (_activePreviewType == ChatMediaType.location) {
      return _buildLocationPreviewPanel();
    }
    return const SizedBox();
  }

  Widget _buildFastCdcPreviewPanel() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.crimsonRed.withOpacity(0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: QuantColors.crimsonRed.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.picture_as_pdf_rounded, color: QuantColors.crimsonRed, size: 18),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _fastCdcSample.fileName,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const Text(
                      'FastCDC (Fast Content-Defined Chunking) Ready',
                      style: TextStyle(color: QuantColors.textMuted, fontSize: 11),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close_rounded, size: 18, color: QuantColors.textMuted),
                onPressed: () => setState(() => _activePreviewType = null),
              ),
            ],
          ),
          const SizedBox(height: 10),
          const Divider(color: QuantColors.hairlineBorder, height: 1),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _buildMetricCapsule('FILE SIZE', '4.2 MB', QuantColors.sovereignCyan),
              _buildMetricCapsule('CHUNKS', '${_fastCdcSample.chunkCount}', QuantColors.moltenOrange),
              _buildMetricCapsule('DEDUP', '3.4x Savings', QuantColors.statusSuccess),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: QuantColors.voidObsidian,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: QuantColors.hairlineBorder),
            ),
            child: Row(
              children: [
                const Icon(Icons.fingerprint_rounded, size: 14, color: QuantColors.sovereignCyan),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'SHA-256: ${_fastCdcSample.sha256Fingerprint}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: QuantColors.textSecondary,
                      fontSize: 10,
                      fontFamily: 'monospace',
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          ElevatedButton.icon(
            onPressed: () => _dispatchSelection(
              ChatMediaType.document,
              _buildMockPayload(ChatMediaType.document),
            ),
            icon: const Icon(Icons.send_rounded, size: 16),
            label: const Text('Send FastCDC Document (4.2 MB)'),
            style: ElevatedButton.styleFrom(
              backgroundColor: QuantColors.crimsonRed,
              foregroundColor: Colors.white,
              minimumSize: const Size(double.infinity, 42),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLocationPreviewPanel() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.emeraldMatrix.withOpacity(0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: QuantColors.emeraldMatrix.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.my_location_rounded, color: QuantColors.emeraldMatrix, size: 18),
              ),
              const SizedBox(width: 10),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Sovereign GPS Fix: 37.7749 deg N, 122.4194 deg W',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      'Accurate to 2.4 meters · Zero third-party telemetry',
                      style: TextStyle(color: QuantColors.statusSuccess, fontSize: 11),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close_rounded, size: 18, color: QuantColors.textMuted),
                onPressed: () => setState(() => _activePreviewType = null),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ElevatedButton.icon(
            onPressed: () => _dispatchSelection(
              ChatMediaType.location,
              _buildMockPayload(ChatMediaType.location),
            ),
            icon: const Icon(Icons.send_rounded, size: 16),
            label: const Text('Share Live Sovereign Location'),
            style: ElevatedButton.styleFrom(
              backgroundColor: QuantColors.emeraldMatrix,
              foregroundColor: Colors.black,
              minimumSize: const Size(double.infinity, 42),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMetricCapsule(String label, String value, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Column(
        children: [
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 9,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}
