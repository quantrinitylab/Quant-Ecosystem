import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import 'package:quant_core/quant_core.dart';
import '../models/drive_models.dart';
import '../data/drive_data_source.dart';
import 'document_viewer_screen.dart';

/// Sovereign AES-256 E2EE Cryptographic Vault Screen
///
/// Features Hardware Keystore biometric unlock badge, encrypted document cards
/// with padlock vectors, SHA-256 copy chips, and on-demand decrypt action.
/// Zero Skia clipPath calls and zero raw Unicode emojis.
class CryptographicVaultScreen extends StatefulWidget {
  final String searchQuery;

  const CryptographicVaultScreen({
    super.key,
    this.searchQuery = '',
  });

  @override
  State<CryptographicVaultScreen> createState() => _CryptographicVaultScreenState();
}

class _CryptographicVaultScreenState extends State<CryptographicVaultScreen> {
  final DriveDataSource _dataSource = DriveDataSource.instance;
  bool _isDecrypting = false;
  String? _decryptingItemId;

  void _toggleBiometricLock() {
    setState(() {
      if (_dataSource.isVaultUnlocked) {
        _dataSource.lockVault();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            backgroundColor: QuantColors.darkSlateCard,
            content: Text(
              'Cryptographic Vault locked. Encryption keys purged from RAM.',
              style: TextStyle(color: QuantColors.moltenAmber),
            ),
          ),
        );
      } else {
        _dataSource.unlockVault();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            backgroundColor: QuantColors.darkSlateCard,
            content: Text(
              'Hardware Keystore biometric authenticated. Master keys unwrapped.',
              style: TextStyle(color: QuantColors.statusSuccess),
            ),
          ),
        );
      }
    });
  }

  void _decryptAndOpen(DriveItem item) async {
    if (!_dataSource.isVaultUnlocked) {
      _showBiometricPrompt(item);
      return;
    }

    setState(() {
      _isDecrypting = true;
      _decryptingItemId = item.id;
    });

    // Simulate Hardware Keystore AES-GCM-256 block decryption
    await Future.delayed(const Duration(milliseconds: 650));

    if (!mounted) return;
    setState(() {
      _isDecrypting = false;
      _decryptingItemId = null;
    });

    final descriptor = QuantDocumentDescriptor(
      id: item.sha256Cas,
      title: item.name,
      uri: 'quant-vault://${item.sha256Cas}',
      sourceType: QuantDocumentSourceType.fastCdcStream,
      fileSizeBytes: item.sizeBytes,
      mimeType: item.name.endsWith('.pdf') ? 'application/pdf' : 'text/plain',
      isEncrypted: true,
    );

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => DocumentViewerScreen(
          document: descriptor,
          config: const QuantDocumentViewerConfig(
            darkModeInversion: true,
            enableTextSelection: true,
          ),
        ),
      ),
    );
  }

  void _showBiometricPrompt(DriveItem pendingItem) {
    showDialog(
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
              Icon(Icons.fingerprint_rounded, color: QuantColors.sovereignCyan, size: 28),
              SizedBox(width: 10),
              Text('Biometric Authentication', style: QuantTypography.titleMedium),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Unlock Sovereign AES-256 Vault using Hardware Keystore biometric sensor.',
                style: TextStyle(fontSize: 13, color: QuantColors.textSecondary),
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: QuantColors.elevatedCard,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: QuantColors.hairlineBorder),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.verified_user_rounded, color: QuantColors.statusSuccess, size: 18),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Enclave Level: StrongBox HSM Level 3',
                        style: TextStyle(
                          fontSize: 11,
                          fontFamily: 'monospace',
                          color: QuantColors.statusSuccess,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel', style: TextStyle(color: QuantColors.textMuted)),
            ),
            SquircleButton(
              height: 40,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              label: 'Verify Biometric',
              icon: Icons.fingerprint_rounded,
              backgroundColor: QuantColors.sovereignCyan,
              textColor: Colors.black,
              onPressed: () {
                Navigator.pop(context);
                _toggleBiometricLock();
                _decryptAndOpen(pendingItem);
              },
            ),
          ],
        );
      },
    );
  }

  void _copySha256(String hash) {
    Clipboard.setData(ClipboardData(text: hash));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        content: Text(
          'SHA-256 Hash copied: ${hash.substring(0, 16)}...',
          style: const TextStyle(color: QuantColors.sovereignCyan),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final query = widget.searchQuery.toLowerCase().trim();
    final items = _dataSource.vaultItems.where((item) {
      if (query.isNotEmpty && !item.name.toLowerCase().contains(query)) {
        return false;
      }
      return true;
    }).toList();

    if (!_dataSource.isVaultUnlocked) {
      return _buildLockedVaultScreen();
    }

    return _buildUnlockedVaultScreen(items);
  }

  Widget _buildLockedVaultScreen() {
    return SingleChildScrollView(
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        children: [
          const SizedBox(height: 10),
          Container(
            width: 76,
            height: 76,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [QuantColors.moltenAmber, Color(0xFFD97706)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(22),
              boxShadow: [
                BoxShadow(
                  color: QuantColors.moltenAmber.withOpacity(0.35),
                  blurRadius: 18,
                  spreadRadius: 2,
                ),
              ],
            ),
            child: const Center(
              child: Icon(
                Icons.enhanced_encryption_rounded,
                color: Colors.black,
                size: 40,
              ),
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            'AES-256 E2EE Cryptographic Vault',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: QuantColors.textPrimary,
              letterSpacing: -0.3,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 4),
          const Text(
            'Hardware StrongBox HSM · Zero-Knowledge Sovereign Enclave',
            style: TextStyle(fontSize: 12, color: QuantColors.textSecondary),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 14),
          const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              QuantBadge(
                label: 'ZERO-KNOWLEDGE BADGE',
                variant: QuantBadgeVariant.amber,
                leadingIcon: Icons.verified_user_rounded,
              ),
              SizedBox(width: 8),
              QuantBadge(
                label: 'AES-256-GCM',
                variant: QuantBadgeVariant.neutral,
                leadingIcon: Icons.lock_rounded,
              ),
            ],
          ),
          const SizedBox(height: 20),
          GestureDetector(
            onTap: _toggleBiometricLock,
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 22, horizontal: 20),
              decoration: BoxDecoration(
                color: QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: QuantColors.moltenAmber.withOpacity(0.5),
                  width: 1.5,
                ),
                boxShadow: [
                  BoxShadow(
                    color: QuantColors.moltenAmber.withOpacity(0.12),
                    blurRadius: 14,
                    spreadRadius: 1,
                  ),
                ],
              ),
              child: Column(
                children: [
                  Container(
                    width: 68,
                    height: 68,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: QuantColors.voidObsidian,
                      border: Border.all(
                        color: QuantColors.moltenAmber,
                        width: 2,
                      ),
                    ),
                    child: const Center(
                      child: Icon(
                        Icons.fingerprint_rounded,
                        color: QuantColors.moltenAmber,
                        size: 40,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Tap Sensor to Authenticate',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: QuantColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Touch ID / Face ID / StrongBox KeyMint Biometrics',
                    style: TextStyle(
                      fontSize: 11,
                      color: QuantColors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 18),
          SquircleButton(
            isFullWidth: true,
            height: 48,
            label: 'Unlock with Biometrics (StrongBox)',
            icon: Icons.fingerprint_rounded,
            backgroundColor: QuantColors.moltenAmber,
            textColor: Colors.black,
            onPressed: _toggleBiometricLock,
          ),
          const SizedBox(height: 18),
          _buildVaultTelemetrySummary(),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: QuantColors.darkSlateCard,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: QuantColors.hairlineBorder),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.shield_outlined, size: 16, color: QuantColors.statusSuccess),
                    SizedBox(width: 8),
                    Text(
                      'Zero-Knowledge Security Invariant',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: QuantColors.textPrimary,
                      ),
                    ),
                  ],
                ),
                SizedBox(height: 6),
                Text(
                  'Master encryption keys are derived on-device via Argon2id (m=64MB, t=3, p=4) '
                  'and sealed inside hardware KeyMint StrongBox. Server and storage layers '
                  'possess zero plaintext access.',
                  style: TextStyle(fontSize: 11, color: QuantColors.textSecondary, height: 1.4),
                ),
              ],
            ),
          ),
          const SizedBox(height: 80),
        ],
      ),
    );
  }

  Widget _buildUnlockedVaultScreen(List<DriveItem> items) {
    return SingleChildScrollView(
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildBiometricKeystoreBadge(),
          const SizedBox(height: 16),
          _buildVaultTelemetrySummary(),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Encrypted Documents (${items.length})',
                style: QuantTypography.titleMedium.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: QuantColors.moltenAmber.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.lock_rounded, size: 12, color: QuantColors.moltenAmber),
                    SizedBox(width: 4),
                    Text(
                      'AES-GCM-256',
                      style: TextStyle(
                        fontSize: 10,
                        fontFamily: 'monospace',
                        fontWeight: FontWeight.w700,
                        color: QuantColors.moltenAmber,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: items.length,
            separatorBuilder: (context, index) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              return _buildEncryptedCard(items[index]);
            },
          ),
          const SizedBox(height: 80),
        ],
      ),
    );
  }

  Widget _buildBiometricKeystoreBadge() {
    final isUnlocked = _dataSource.isVaultUnlocked;
    final accentColor = isUnlocked ? QuantColors.statusSuccess : QuantColors.moltenAmber;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: accentColor.withOpacity(0.5), width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: accentColor.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  isUnlocked ? Icons.lock_open_rounded : Icons.lock_rounded,
                  color: accentColor,
                  size: 24,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isUnlocked
                          ? 'Hardware Keystore Biometrics Verified'
                          : 'Hardware Keystore Biometric Locked',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: accentColor,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      isUnlocked
                          ? 'Zero-Knowledge Session Active · Argon2id memory-hard KDF'
                          : 'Biometric authorization required to release AES-256 master keys',
                      style: QuantTypography.bodySmall,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: SquircleButton(
                  height: 42,
                  label: isUnlocked ? 'Lock Vault Enclave' : 'Unlock with Biometrics',
                  icon: isUnlocked ? Icons.lock_outline_rounded : Icons.fingerprint_rounded,
                  backgroundColor: isUnlocked ? QuantColors.elevatedCard : QuantColors.moltenAmber,
                  textColor: isUnlocked ? QuantColors.textPrimary : Colors.black,
                  onPressed: _toggleBiometricLock,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildVaultTelemetrySummary() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: QuantColors.elevatedCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildTelemetryMetric('Encryption', 'AES-256-GCM', Icons.shield_rounded),
          Container(width: 1, height: 32, color: QuantColors.hairlineBorder),
          _buildTelemetryMetric('KDF Protocol', 'Argon2id', Icons.vpn_key_rounded),
          Container(width: 1, height: 32, color: QuantColors.hairlineBorder),
          _buildTelemetryMetric('Keystore Tier', 'StrongBox', Icons.verified_rounded),
        ],
      ),
    );
  }

  Widget _buildTelemetryMetric(String label, String value, IconData icon) {
    return Column(
      children: [
        Icon(icon, size: 16, color: QuantColors.sovereignCyan),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(
            fontSize: 12,
            fontFamily: 'monospace',
            fontWeight: FontWeight.w700,
            color: QuantColors.textPrimary,
          ),
        ),
        Text(
          label,
          style: const TextStyle(fontSize: 10, color: QuantColors.textMuted),
        ),
      ],
    );
  }

  Widget _buildEncryptedCard(DriveItem item) {
    final isThisItemDecrypting = _isDecrypting && _decryptingItemId == item.id;

    return Container(
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: QuantColors.hairlineBorder, width: 1),
      ),
      child: Material(
        color: Colors.transparent,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  // Padlock Vector Icon
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: QuantColors.moltenAmber.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: QuantColors.moltenAmber.withOpacity(0.3),
                        width: 1,
                      ),
                    ),
                    child: const Center(
                      child: Icon(
                        Icons.enhanced_encryption_rounded,
                        color: QuantColors.moltenAmber,
                        size: 24,
                      ),
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
                              'Encrypted ${item.formattedSize}',
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
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              // SHA-256 Copy Chip
              InkWell(
                onTap: () => _copySha256(item.sha256Cas),
                borderRadius: BorderRadius.circular(8),
                child: Container(
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
                          'SHA-256: ${item.sha256Cas}',
                          style: const TextStyle(
                            fontSize: 11,
                            fontFamily: 'monospace',
                            color: QuantColors.textSecondary,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const Icon(Icons.copy_rounded, size: 14, color: QuantColors.textMuted),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              // On-Demand Decrypt Action
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  SquircleButton(
                    height: 38,
                    padding: const EdgeInsets.symmetric(horizontal: 14),
                    label: isThisItemDecrypting ? 'Decrypting...' : 'Decrypt & View',
                    icon: isThisItemDecrypting ? null : Icons.lock_open_rounded,
                    isLoading: isThisItemDecrypting,
                    backgroundColor: QuantColors.sovereignCyan,
                    textColor: Colors.black,
                    onPressed: () => _decryptAndOpen(item),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
