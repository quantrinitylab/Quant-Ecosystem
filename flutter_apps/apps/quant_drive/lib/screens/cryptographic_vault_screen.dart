import 'dart:async';
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
/// Features Hardware Keystore biometric unlock badge, master password Argon2id challenge,
/// zero-knowledge recovery key chip, configurable auto-lock timer countdown,
/// encrypted document cards with padlock vectors, SHA-256 copy chips, and on-demand decrypt action.
/// Zero Skia clipPath calls and strictly zero raw Unicode emojis.
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
  Timer? _autoLockPeriodicTimer;

  @override
  void initState() {
    super.initState();
    if (_dataSource.isVaultUnlocked) {
      _startAutoLockTimer();
    }
  }

  @override
  void dispose() {
    _autoLockPeriodicTimer?.cancel();
    super.dispose();
  }

  void _startAutoLockTimer() {
    _autoLockPeriodicTimer?.cancel();
    _autoLockPeriodicTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      if (_dataSource.isVaultUnlocked) {
        setState(() {
          _dataSource.tickAutoLockTimer();
        });
      } else {
        timer.cancel();
      }
    });
  }

  void _lockVault() {
    setState(() {
      _autoLockPeriodicTimer?.cancel();
      _dataSource.lockVault();
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        content: Text(
          'Cryptographic Vault locked. Encryption keys purged from RAM.',
          style: TextStyle(color: QuantColors.moltenAmber),
        ),
      ),
    );
  }

  void _showUnlockSheet({int initialTab = 0, DriveItem? pendingItem}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (modalContext) {
        return _VaultUnlockBottomSheet(
          initialTab: initialTab,
          onUnlocked: (method) {
            Navigator.pop(modalContext);
            setState(() {
              _startAutoLockTimer();
            });
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                backgroundColor: QuantColors.darkSlateCard,
                content: Text(
                  'Vault unlocked via $method. Enclave session active.',
                  style: const TextStyle(color: QuantColors.statusSuccess),
                ),
              ),
            );
            if (pendingItem != null) {
              _decryptAndOpen(pendingItem);
            }
          },
        );
      },
    );
  }

  void _decryptAndOpen(DriveItem item) async {
    if (!_dataSource.isVaultUnlocked) {
      _showUnlockSheet(pendingItem: item);
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

  void _copyRecoveryKey() {
    Clipboard.setData(ClipboardData(text: _dataSource.zeroKnowledgeRecoveryKey));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        content: Text(
          'Zero-Knowledge Recovery Key copied to secure clipboard.',
          style: TextStyle(color: QuantColors.statusSuccess),
        ),
      ),
    );
  }

  String _formatTimerCountdown(int totalSeconds) {
    final minutes = (totalSeconds / 60).floor().toString().padLeft(2, '0');
    final seconds = (totalSeconds % 60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
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
            onTap: () => _showUnlockSheet(initialTab: 0),
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
          Row(
            children: [
              Expanded(
                child: SquircleButton(
                  height: 48,
                  label: 'Unlock with Biometrics',
                  icon: Icons.fingerprint_rounded,
                  backgroundColor: QuantColors.moltenAmber,
                  textColor: Colors.black,
                  onPressed: () => _showUnlockSheet(initialTab: 0),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: SquircleButton(
                  height: 42,
                  label: 'Master Password / Recovery Key',
                  icon: Icons.key_rounded,
                  backgroundColor: QuantColors.elevatedCard,
                  textColor: QuantColors.textPrimary,
                  onPressed: () => _showUnlockSheet(initialTab: 1),
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          _buildZeroKnowledgeRecoveryChip(isUnlocked: false),
          const SizedBox(height: 16),
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
          const SizedBox(height: 12),
          _buildAutoLockTimerBar(),
          const SizedBox(height: 12),
          _buildZeroKnowledgeRecoveryChip(isUnlocked: true),
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
    final method = _dataSource.vaultUnlockMethod;
    final methodLabel = method == 'biometric'
        ? 'Biometric Hardware StrongBox'
        : method == 'master_password'
            ? 'Argon2id Master Password'
            : 'Zero-Knowledge Recovery Key';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.statusSuccess.withOpacity(0.5), width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: QuantColors.statusSuccess.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.lock_open_rounded,
                  color: QuantColors.statusSuccess,
                  size: 24,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Hardware Keystore Unlocked',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: QuantColors.statusSuccess,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Session: $methodLabel · Argon2id memory-hard KDF active',
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
                  height: 40,
                  label: 'Lock Vault Enclave',
                  icon: Icons.lock_outline_rounded,
                  backgroundColor: QuantColors.elevatedCard,
                  textColor: QuantColors.moltenAmber,
                  onPressed: _lockVault,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildAutoLockTimerBar() {
    final remaining = _dataSource.remainingAutoLockSeconds;
    final isLow = remaining < 60;
    final countdownStr = _formatTimerCountdown(remaining);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: QuantColors.elevatedCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isLow ? QuantColors.statusError.withOpacity(0.5) : QuantColors.hairlineBorder,
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Icon(
                Icons.timer_outlined,
                size: 16,
                color: isLow ? QuantColors.statusError : QuantColors.sovereignCyan,
              ),
              const SizedBox(width: 8),
              Text(
                'Auto-Lock Timer',
                style: QuantTypography.bodySmall.copyWith(
                  fontWeight: FontWeight.w600,
                  color: QuantColors.textPrimary,
                ),
              ),
            ],
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: isLow
                  ? QuantColors.statusError.withOpacity(0.15)
                  : QuantColors.sovereignCyan.withOpacity(0.15),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              countdownStr,
              style: TextStyle(
                fontFamily: 'monospace',
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: isLow ? QuantColors.statusError : QuantColors.sovereignCyan,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildZeroKnowledgeRecoveryChip({required bool isUnlocked}) {
    return InkWell(
      onTap: _copyRecoveryKey,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: QuantColors.voidObsidian,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: QuantColors.hairlineBorder),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: QuantColors.moltenAmber.withOpacity(0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.key_rounded, size: 16, color: QuantColors.moltenAmber),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Zero-Knowledge Recovery Key Sealed',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: QuantColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _dataSource.zeroKnowledgeRecoveryKey,
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 10,
                      color: QuantColors.textSecondary,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const Icon(Icons.copy_rounded, size: 16, color: QuantColors.textMuted),
          ],
        ),
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

/// AES-256 E2EE Cryptographic Vault Unlock Bottom Sheet
class _VaultUnlockBottomSheet extends StatefulWidget {
  final int initialTab;
  final ValueChanged<String> onUnlocked;

  const _VaultUnlockBottomSheet({
    required this.initialTab,
    required this.onUnlocked,
  });

  @override
  State<_VaultUnlockBottomSheet> createState() => _VaultUnlockBottomSheetState();
}

class _VaultUnlockBottomSheetState extends State<_VaultUnlockBottomSheet> {
  final DriveDataSource _dataSource = DriveDataSource.instance;
  late int _activeTab;
  final TextEditingController _passwordController = TextEditingController();
  final TextEditingController _recoveryKeyController = TextEditingController();
  bool _obscurePassword = true;
  String? _errorMessage;
  int _selectedAutoLockSeconds = 300;

  @override
  void initState() {
    super.initState();
    _activeTab = widget.initialTab;
    _selectedAutoLockSeconds = _dataSource.autoLockDurationSeconds;
  }

  @override
  void dispose() {
    _passwordController.dispose();
    _recoveryKeyController.dispose();
    super.dispose();
  }

  void _verifyBiometric() {
    _dataSource.setAutoLockDuration(_selectedAutoLockSeconds);
    _dataSource.unlockVaultBiometric();
    widget.onUnlocked('Biometrics (StrongBox HSM)');
  }

  void _verifyPassword() {
    final password = _passwordController.text.trim();
    if (password.isEmpty) {
      setState(() => _errorMessage = 'Please enter master password');
      return;
    }

    _dataSource.setAutoLockDuration(_selectedAutoLockSeconds);
    final success = _dataSource.unlockVaultWithPassword(password);
    if (success) {
      widget.onUnlocked('Argon2id Master Password');
    } else {
      setState(() => _errorMessage = 'Invalid master password');
    }
  }

  void _verifyRecoveryKey() {
    final key = _recoveryKeyController.text.trim();
    if (key.isEmpty) {
      setState(() => _errorMessage = 'Please enter recovery key');
      return;
    }

    _dataSource.setAutoLockDuration(_selectedAutoLockSeconds);
    final success = _dataSource.unlockVaultWithRecoveryKey(key);
    if (success) {
      widget.onUnlocked('Zero-Knowledge Recovery Key');
    } else {
      setState(() => _errorMessage = 'Invalid recovery key format');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(Icons.shield_rounded, color: QuantColors.moltenAmber, size: 24),
                  SizedBox(width: 10),
                  Text(
                    'Unlock Cryptographic Vault',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: QuantColors.textPrimary,
                    ),
                  ),
                ],
              ),
              IconButton(
                icon: const Icon(Icons.close_rounded, color: QuantColors.textMuted, size: 20),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
          const SizedBox(height: 6),
          const Text(
            'Authenticate to derive AES-256 master keys via Argon2id hardware enclave.',
            style: TextStyle(fontSize: 12, color: QuantColors.textSecondary),
          ),
          const SizedBox(height: 16),
          // Tab Switcher
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: QuantColors.voidObsidian,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: QuantColors.hairlineBorder),
            ),
            child: Row(
              children: [
                _buildTabButton(0, 'Biometrics', Icons.fingerprint_rounded),
                _buildTabButton(1, 'Password', Icons.key_rounded),
                _buildTabButton(2, 'Recovery', Icons.restore_rounded),
              ],
            ),
          ),
          const SizedBox(height: 18),
          if (_errorMessage != null) ...[
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: QuantColors.statusError.withOpacity(0.15),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: QuantColors.statusError.withOpacity(0.5)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.error_outline_rounded, size: 16, color: QuantColors.statusError),
                  const SizedBox(width: 8),
                  Text(_errorMessage!, style: const TextStyle(fontSize: 12, color: QuantColors.statusError)),
                ],
              ),
            ),
            const SizedBox(height: 14),
          ],
          if (_activeTab == 0) _buildBiometricTab(),
          if (_activeTab == 1) _buildPasswordTab(),
          if (_activeTab == 2) _buildRecoveryTab(),
          const SizedBox(height: 16),
          _buildAutoLockSelector(),
        ],
      ),
    );
  }

  Widget _buildTabButton(int index, String label, IconData icon) {
    final isSelected = _activeTab == index;
    return Expanded(
      child: InkWell(
        onTap: () {
          setState(() {
            _activeTab = index;
            _errorMessage = null;
          });
        },
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: isSelected ? QuantColors.darkSlateCard : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
            border: isSelected ? Border.all(color: QuantColors.moltenAmber.withOpacity(0.5)) : null,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: 16,
                color: isSelected ? QuantColors.moltenAmber : QuantColors.textMuted,
              ),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: isSelected ? QuantColors.textPrimary : QuantColors.textMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBiometricTab() {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: QuantColors.elevatedCard,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: QuantColors.hairlineBorder),
          ),
          child: const Row(
            children: [
              Icon(Icons.verified_user_rounded, color: QuantColors.statusSuccess, size: 24),
              SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Hardware StrongBox Enclave Ready',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: QuantColors.textPrimary),
                    ),
                    Text(
                      'Touch ID / Face ID / Android KeyMint Level 3',
                      style: TextStyle(fontSize: 11, color: QuantColors.textMuted),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        SquircleButton(
          isFullWidth: true,
          height: 46,
          label: 'Authenticate with Biometrics',
          icon: Icons.fingerprint_rounded,
          backgroundColor: QuantColors.moltenAmber,
          textColor: Colors.black,
          onPressed: _verifyBiometric,
        ),
      ],
    );
  }

  Widget _buildPasswordTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          controller: _passwordController,
          obscureText: _obscurePassword,
          style: const TextStyle(color: QuantColors.textPrimary, fontSize: 14),
          decoration: InputDecoration(
            labelText: 'Master Vault Password',
            labelStyle: const TextStyle(color: QuantColors.textSecondary, fontSize: 13),
            hintText: 'Enter sovereign passphrase (default: quant2026)',
            hintStyle: const TextStyle(color: QuantColors.textMuted, fontSize: 12),
            prefixIcon: const Icon(Icons.password_rounded, color: QuantColors.sovereignCyan, size: 20),
            suffixIcon: IconButton(
              icon: Icon(
                _obscurePassword ? Icons.visibility_off_rounded : Icons.visibility_rounded,
                color: QuantColors.textMuted,
                size: 20,
              ),
              onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
            ),
            filled: true,
            fillColor: QuantColors.voidObsidian,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
          ),
        ),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: QuantColors.voidObsidian,
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Row(
            children: [
              Icon(Icons.memory_rounded, size: 14, color: QuantColors.sovereignCyan),
              SizedBox(width: 6),
              Text(
                'KDF: Argon2id (m=64MB, t=3 iterations, p=4 lanes)',
                style: TextStyle(fontFamily: 'monospace', fontSize: 10, color: QuantColors.textSecondary),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        SquircleButton(
          isFullWidth: true,
          height: 46,
          label: 'Unlock with Password',
          icon: Icons.lock_open_rounded,
          backgroundColor: QuantColors.sovereignCyan,
          textColor: Colors.black,
          onPressed: _verifyPassword,
        ),
      ],
    );
  }

  Widget _buildRecoveryTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          controller: _recoveryKeyController,
          style: const TextStyle(color: QuantColors.textPrimary, fontSize: 13, fontFamily: 'monospace'),
          decoration: InputDecoration(
            labelText: '24-Word Seed or Recovery Hex Key',
            labelStyle: const TextStyle(color: QuantColors.textSecondary, fontSize: 13),
            hintText: '0x7F4A-E39B-88D1-C95B...',
            hintStyle: const TextStyle(color: QuantColors.textMuted, fontSize: 12),
            prefixIcon: const Icon(Icons.key_rounded, color: QuantColors.sunsetGold, size: 20),
            filled: true,
            fillColor: QuantColors.voidObsidian,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
          ),
        ),
        const SizedBox(height: 10),
        InkWell(
          onTap: () {
            Clipboard.setData(ClipboardData(text: _dataSource.zeroKnowledgeRecoveryKey));
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                backgroundColor: QuantColors.darkSlateCard,
                content: Text(
                  'Sealed Recovery Key copied to clipboard',
                  style: TextStyle(color: QuantColors.statusSuccess),
                ),
              ),
            );
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: QuantColors.voidObsidian,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                const Icon(Icons.copy_rounded, size: 14, color: QuantColors.sunsetGold),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'Sealed Key: ${_dataSource.zeroKnowledgeRecoveryKey}',
                    style: const TextStyle(fontFamily: 'monospace', fontSize: 10, color: QuantColors.textMuted),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        SquircleButton(
          isFullWidth: true,
          height: 46,
          label: 'Restore Access via Recovery Key',
          icon: Icons.restore_rounded,
          backgroundColor: QuantColors.sunsetGold,
          textColor: Colors.black,
          onPressed: _verifyRecoveryKey,
        ),
      ],
    );
  }

  Widget _buildAutoLockSelector() {
    final durations = [
      {'label': '30s', 'seconds': 30},
      {'label': '1m', 'seconds': 60},
      {'label': '5m', 'seconds': 300},
      {'label': '15m', 'seconds': 900},
    ];

    return Row(
      children: [
        const Icon(Icons.timer_outlined, size: 14, color: QuantColors.textMuted),
        const SizedBox(width: 6),
        const Text('Auto-Lock Duration:', style: TextStyle(fontSize: 11, color: QuantColors.textSecondary)),
        const Spacer(),
        ...durations.map((d) {
          final isSelected = _selectedAutoLockSeconds == d['seconds'];
          return Padding(
            padding: const EdgeInsets.only(left: 6),
            child: InkWell(
              onTap: () => setState(() => _selectedAutoLockSeconds = d['seconds'] as int),
              borderRadius: BorderRadius.circular(6),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: isSelected ? QuantColors.sovereignCyan.withOpacity(0.18) : QuantColors.voidObsidian,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(
                    color: isSelected ? QuantColors.sovereignCyan : QuantColors.hairlineBorder,
                  ),
                ),
                child: Text(
                  d['label'] as String,
                  style: TextStyle(
                    fontSize: 10,
                    fontFamily: 'monospace',
                    fontWeight: FontWeight.w700,
                    color: isSelected ? QuantColors.sovereignCyan : QuantColors.textMuted,
                  ),
                ),
              ),
            ),
          );
        }),
      ],
    );
  }
}
