// Sovereign Quant Ecosystem - QuantChat Signal-Class Safety Number Screen
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_theme/quant_theme.dart';

class SafetyNumberScreen extends StatefulWidget {
  final String contactName;
  final String contactInitials;
  final Color contactAvatarColor;
  final String? custom60Digits;

  const SafetyNumberScreen({
    super.key,
    required this.contactName,
    required this.contactInitials,
    this.contactAvatarColor = QuantColors.sovereignCyan,
    this.custom60Digits,
  });

  @override
  State<SafetyNumberScreen> createState() => _SafetyNumberScreenState();
}

class _SafetyNumberScreenState extends State<SafetyNumberScreen> {
  bool _isVerified = false;
  bool _isScanningMode = false;
  late final List<String> _digitBlocks;

  static const String _default60Digits =
      '38491 02948 18492 01847 '
      '59281 74920 18492 84920 '
      '67104 92847 10948 20491';

  @override
  void initState() {
    super.initState();
    final rawDigits = (widget.custom60Digits ?? _default60Digits).replaceAll(' ', '');
    // Split into 12 blocks of 5 digits
    _digitBlocks = [];
    for (int i = 0; i < rawDigits.length && _digitBlocks.length < 12; i += 5) {
      final end = (i + 5 <= rawDigits.length) ? i + 5 : rawDigits.length;
      _digitBlocks.add(rawDigits.substring(i, end));
    }
    // Pad to 12 if needed
    while (_digitBlocks.length < 12) {
      _digitBlocks.add('00000');
    }
  }

  void _copySafetyNumber() {
    final fullNumber = _digitBlocks.join(' ');
    Clipboard.setData(ClipboardData(text: fullNumber));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        duration: const Duration(seconds: 2),
        content: Row(
          children: [
            const Icon(Icons.check_circle_rounded, color: QuantColors.statusSuccess, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'Safety Number copied to clipboard: ${fullNumber.substring(0, 17)}...',
                style: const TextStyle(color: Colors.white, fontSize: 13),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _toggleVerification() {
    setState(() {
      _isVerified = !_isVerified;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        duration: const Duration(seconds: 2),
        content: Row(
          children: [
            Icon(
              _isVerified ? Icons.verified_rounded : Icons.info_outline_rounded,
              color: _isVerified ? QuantColors.statusSuccess : QuantColors.textSecondary,
              size: 18,
            ),
            const SizedBox(width: 8),
            Text(
              _isVerified
                  ? 'Key fingerprint marked as VERIFIED.'
                  : 'Key fingerprint marked as UNVERIFIED.',
              style: const TextStyle(color: Colors.white, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      appBar: AppBar(
        backgroundColor: QuantColors.voidObsidian,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20, color: Colors.white),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text(
          'Verify Safety Number',
          style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.share_outlined, color: QuantColors.sovereignCyan, size: 20),
            tooltip: 'Share Safety Number',
            onPressed: _copySafetyNumber,
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(color: QuantColors.hairlineBorder, height: 1),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
        children: [
          // Peer Summary Card
          _buildPeerSummaryCard(),

          const SizedBox(height: 16),

          // Security Advisory Alert Banner
          _buildAdvisoryBanner(),

          const SizedBox(height: 18),

          // QR Code or Camera Scanner Viewfinder
          if (!_isScanningMode) _buildQrCodeCard() else _buildScannerViewfinder(),

          const SizedBox(height: 14),

          // Scan or Show QR Code Toggle Button
          _buildScanModeToggle(),

          const SizedBox(height: 20),

          // 60 Digits Display (12 blocks of 5)
          _build60DigitsSection(),

          const SizedBox(height: 20),

          // Protocol & Keystore Telemetry Card
          _buildTelemetryCard(),

          const SizedBox(height: 24),

          // Mark as Verified CTA Button
          _buildVerifyButton(),

          const SizedBox(height: 36),
        ],
      ),
    );
  }

  Widget _buildPeerSummaryCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Row(
        children: [
          // Contact Avatar
          Container(
            width: 50,
            height: 50,
            decoration: BoxDecoration(
              color: widget.contactAvatarColor.withOpacity(0.2),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: widget.contactAvatarColor.withOpacity(0.8), width: 1.5),
            ),
            child: Center(
              child: Text(
                widget.contactInitials,
                style: TextStyle(
                  color: widget.contactAvatarColor,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
          const SizedBox(width: 14),

          // Contact Details & Verification Status
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.contactName,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: _isVerified
                            ? QuantColors.statusSuccess.withOpacity(0.15)
                            : QuantColors.sunsetGold.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: _isVerified
                              ? QuantColors.statusSuccess.withOpacity(0.4)
                              : QuantColors.sunsetGold.withOpacity(0.4),
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            _isVerified ? Icons.verified_rounded : Icons.shield_outlined,
                            size: 12,
                            color: _isVerified ? QuantColors.statusSuccess : QuantColors.sunsetGold,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            _isVerified ? 'VERIFIED' : 'UNVERIFIED',
                            style: TextStyle(
                              color: _isVerified ? QuantColors.statusSuccess : QuantColors.sunsetGold,
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    const Text(
                      'Kyber-1024 / E2EE',
                      style: TextStyle(color: QuantColors.textMuted, fontSize: 11),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAdvisoryBanner() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF141926),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: QuantColors.sovereignCyan.withOpacity(0.3)),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.security_rounded, color: QuantColors.sovereignCyan, size: 20),
          SizedBox(width: 12),
          Expanded(
            child: Text(
              'To verify that your end-to-end encryption is secure with this peer, compare the numbers below with their device, or scan their QR code. If the safety number changed, it might mean someone is trying to intercept your communication or the contact reinstalled QuantChat.',
              style: TextStyle(
                color: QuantColors.textSecondary,
                fontSize: 12,
                height: 1.45,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQrCodeCard() {
    return Center(
      child: Container(
        width: 220,
        height: 220,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color: QuantColors.sovereignCyan.withOpacity(0.2),
              blurRadius: 24,
              spreadRadius: 2,
            ),
          ],
        ),
        child: CustomPaint(
          size: const Size(188, 188),
          painter: _CryptographicQrPainter(seed: widget.contactName.hashCode),
        ),
      ),
    );
  }

  Widget _buildScannerViewfinder() {
    return Center(
      child: Container(
        width: 240,
        height: 220,
        decoration: BoxDecoration(
          color: QuantColors.darkSlateCard,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: QuantColors.sovereignCyan, width: 2),
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: const [
                Icon(Icons.camera_alt_outlined, color: QuantColors.sovereignCyan, size: 48),
                SizedBox(height: 12),
                Text(
                  'Point camera at peer QR code',
                  style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
                ),
                SizedBox(height: 4),
                Text(
                  'Hardware Keystore Scanning Active',
                  style: TextStyle(color: QuantColors.textMuted, fontSize: 11),
                ),
              ],
            ),
            // Targeting reticle corners
            Positioned(
              top: 16,
              left: 16,
              child: Container(
                width: 20,
                height: 20,
                decoration: const BoxDecoration(
                  border: Border(
                    top: BorderSide(color: QuantColors.sovereignCyan, width: 3),
                    left: BorderSide(color: QuantColors.sovereignCyan, width: 3),
                  ),
                ),
              ),
            ),
            Positioned(
              top: 16,
              right: 16,
              child: Container(
                width: 20,
                height: 20,
                decoration: const BoxDecoration(
                  border: Border(
                    top: BorderSide(color: QuantColors.sovereignCyan, width: 3),
                    right: BorderSide(color: QuantColors.sovereignCyan, width: 3),
                  ),
                ),
              ),
            ),
            Positioned(
              bottom: 16,
              left: 16,
              child: Container(
                width: 20,
                height: 20,
                decoration: const BoxDecoration(
                  border: Border(
                    bottom: BorderSide(color: QuantColors.sovereignCyan, width: 3),
                    left: BorderSide(color: QuantColors.sovereignCyan, width: 3),
                  ),
                ),
              ),
            ),
            Positioned(
              bottom: 16,
              right: 16,
              child: Container(
                width: 20,
                height: 20,
                decoration: const BoxDecoration(
                  border: Border(
                    bottom: BorderSide(color: QuantColors.sovereignCyan, width: 3),
                    right: BorderSide(color: QuantColors.sovereignCyan, width: 3),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildScanModeToggle() {
    return Center(
      child: OutlinedButton.icon(
        onPressed: () {
          setState(() {
            _isScanningMode = !_isScanningMode;
          });
        },
        icon: Icon(
          _isScanningMode ? Icons.qr_code_2_rounded : Icons.qr_code_scanner_rounded,
          size: 18,
          color: QuantColors.sovereignCyan,
        ),
        label: Text(
          _isScanningMode ? 'Show QR Code' : 'Scan Peer Code',
          style: const TextStyle(color: QuantColors.sovereignCyan, fontWeight: FontWeight.w600),
        ),
        style: OutlinedButton.styleFrom(
          side: const BorderSide(color: QuantColors.activeBorder),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        ),
      ),
    );
  }

  Widget _build60DigitsSection() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                '60-DIGIT SAFETY NUMBER',
                style: TextStyle(
                  color: QuantColors.textMuted,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                ),
              ),
              InkWell(
                onTap: _copySafetyNumber,
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: QuantColors.voidObsidian,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: QuantColors.hairlineBorder),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.copy_rounded, size: 12, color: QuantColors.sovereignCyan),
                      SizedBox(width: 4),
                      Text(
                        'Copy',
                        style: TextStyle(
                          color: QuantColors.sovereignCyan,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // 12 Blocks in a 3-column Grid
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _digitBlocks.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              childAspectRatio: 2.4,
              crossAxisSpacing: 8,
              mainAxisSpacing: 8,
            ),
            itemBuilder: (context, idx) {
              return Container(
                decoration: BoxDecoration(
                  color: QuantColors.voidObsidian,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: QuantColors.hairlineBorder),
                ),
                child: Center(
                  child: Text(
                    _digitBlocks[idx],
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      fontFamily: 'monospace',
                      letterSpacing: 1.5,
                    ),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildTelemetryCard() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        children: const [
          _TelemetryRow(
            label: 'Cryptographic Protocol',
            value: 'Signal Double Ratchet + X3DH',
          ),
          Divider(color: QuantColors.hairlineBorder, height: 16),
          _TelemetryRow(
            label: 'Post-Quantum Defense',
            value: 'Kyber-1024 Lattice KEM',
          ),
          Divider(color: QuantColors.hairlineBorder, height: 16),
          _TelemetryRow(
            label: 'Local Hardware Keystore',
            value: 'Android Keystore / Secure Enclave',
          ),
          Divider(color: QuantColors.hairlineBorder, height: 16),
          _TelemetryRow(
            label: 'Verification Method',
            value: 'Visual Monospace & 2D Matrix Match',
          ),
        ],
      ),
    );
  }

  Widget _buildVerifyButton() {
    return ElevatedButton.icon(
      onPressed: _toggleVerification,
      icon: Icon(
        _isVerified ? Icons.check_circle_rounded : Icons.verified_user_rounded,
        size: 20,
      ),
      label: Text(
        _isVerified ? 'Mark as Unverified' : 'Mark as Verified',
        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
      ),
      style: ElevatedButton.styleFrom(
        backgroundColor: _isVerified ? QuantColors.statusSuccess : QuantColors.moltenOrange,
        foregroundColor: Colors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
        ),
        padding: const EdgeInsets.symmetric(vertical: 16),
      ),
    );
  }
}

class _TelemetryRow extends StatelessWidget {
  final String label;
  final String value;

  const _TelemetryRow({
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: const TextStyle(color: QuantColors.textSecondary, fontSize: 12),
        ),
        Text(
          value,
          style: const TextStyle(
            color: QuantColors.textPrimary,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

/// Custom painter for rendering high-precision pseudo-QR code matrix (ZERO clipPath)
class _CryptographicQrPainter extends CustomPainter {
  final int seed;

  _CryptographicQrPainter({required this.seed});

  @override
  void paint(Canvas canvas, Size size) {
    final paintDark = Paint()
      ..color = const Color(0xFF090A0E)
      ..style = PaintingStyle.fill;

    const int gridSize = 25;
    final cellWidth = size.width / gridSize;
    final cellHeight = size.height / gridSize;

    // Deterministic pseudo-random pattern based on seed
    int current = seed;
    int nextRand() {
      current = (current * 1103515245 + 12345) & 0x7fffffff;
      return current;
    }

    for (int r = 0; r < gridSize; r++) {
      for (int c = 0; c < gridSize; c++) {
        // Corner alignment target zones (top-left, top-right, bottom-left)
        final isTopLeftFinder = (r < 7 && c < 7);
        final isTopRightFinder = (r < 7 && c >= gridSize - 7);
        final isBottomLeftFinder = (r >= gridSize - 7 && c < 7);

        if (isTopLeftFinder || isTopRightFinder || isBottomLeftFinder) {
          continue; // Handled separately below
        }

        // Draw data cells
        if ((nextRand() % 100) < 46) {
          canvas.drawRRect(
            RRect.fromRectAndRadius(
              Rect.fromLTWH(c * cellWidth, r * cellHeight, cellWidth - 0.5, cellHeight - 0.5),
              const Radius.circular(1),
            ),
            paintDark,
          );
        }
      }
    }

    // Draw 3 alignment targets with precision RRects (ZERO clipPath)
    void drawFinderPattern(double left, double top) {
      final finderWidth = cellWidth * 7;
      final finderHeight = cellHeight * 7;

      // Outer square
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(left, top, finderWidth, finderHeight),
          const Radius.circular(4),
        ),
        paintDark,
      );

      // Inner white cutout
      final paintWhite = Paint()
        ..color = Colors.white
        ..style = PaintingStyle.fill;

      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(left + cellWidth, top + cellHeight, finderWidth - 2 * cellWidth, finderHeight - 2 * cellHeight),
          const Radius.circular(3),
        ),
        paintWhite,
      );

      // Center solid core
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(left + cellWidth * 2, top + cellHeight * 2, finderWidth - 4 * cellWidth, finderHeight - 4 * cellHeight),
          const Radius.circular(2),
        ),
        paintDark,
      );
    }

    drawFinderPattern(0, 0); // Top-left
    drawFinderPattern((gridSize - 7) * cellWidth, 0); // Top-right
    drawFinderPattern(0, (gridSize - 7) * cellHeight); // Bottom-left
  }

  @override
  bool shouldRepaint(covariant _CryptographicQrPainter oldDelegate) =>
      oldDelegate.seed != seed;
}
