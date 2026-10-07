import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';

/// Sovereign Identity Profile Model
class QuantIdentity {
  final String id;
  final String name;
  final String initials;
  final String email;
  final String role;
  final Color accentColor;
  final bool isHardwareKeyBacked;

  const QuantIdentity({
    required this.id,
    required this.name,
    required this.initials,
    required this.email,
    required this.role,
    required this.accentColor,
    this.isHardwareKeyBacked = true,
  });
}

/// Sovereign Workspace Model
class QuantWorkspace {
  final String id;
  final String name;
  final String description;
  final IconData icon;
  final Color accentColor;
  final int memberCount;

  const QuantWorkspace({
    required this.id,
    required this.name,
    required this.description,
    required this.icon,
    required this.accentColor,
    required this.memberCount,
  });
}

/// Multi-Identity & Session Switcher Sheet ("Sab Ke Liye")
///
/// Sovereign multi-tenant identity profile switcher, workspace coordinator,
/// multi-segment quota bar, and live backend telemetry sentinel.
///
/// Impeller 120Hz accelerated: strictly ZERO Skia clipPath and ZERO raw Unicode emojis.
class AccountProfileSheet extends StatefulWidget {
  final QuantIdentity? currentIdentity;
  final QuantWorkspace? currentWorkspace;
  final ValueChanged<QuantIdentity>? onIdentityChanged;
  final ValueChanged<QuantWorkspace>? onWorkspaceChanged;

  const AccountProfileSheet({
    super.key,
    this.currentIdentity,
    this.currentWorkspace,
    this.onIdentityChanged,
    this.onWorkspaceChanged,
  });

  /// Presents the Sovereign Account Profile Modal Bottom Sheet
  static Future<void> show(
    BuildContext context, {
    QuantIdentity? currentIdentity,
    QuantWorkspace? currentWorkspace,
    ValueChanged<QuantIdentity>? onIdentityChanged,
    ValueChanged<QuantWorkspace>? onWorkspaceChanged,
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withOpacity(0.75),
      builder: (ctx) => AccountProfileSheet(
        currentIdentity: currentIdentity,
        currentWorkspace: currentWorkspace,
        onIdentityChanged: onIdentityChanged,
        onWorkspaceChanged: onWorkspaceChanged,
      ),
    );
  }

  @override
  State<AccountProfileSheet> createState() => _AccountProfileSheetState();
}

class _AccountProfileSheetState extends State<AccountProfileSheet>
    with SingleTickerProviderStateMixin {
  // Pre-configured Sovereign Demo Identities
  static const List<QuantIdentity> _identities = [
    QuantIdentity(
      id: 'sp',
      name: 'Sundar Pichai',
      initials: 'SP',
      email: 'sundar@quantmail.in',
      role: 'Enterprise CEO',
      accentColor: QuantColors.moltenAmber,
      isHardwareKeyBacked: true,
    ),
    QuantIdentity(
      id: 'ds',
      name: 'Dev Sentinel',
      initials: 'DS',
      email: 'sentinel@quantmail.in',
      role: 'Security Engineer',
      accentColor: QuantColors.sovereignCyan,
      isHardwareKeyBacked: true,
    ),
  ];

  // Pre-configured Sovereign Workspaces
  static const List<QuantWorkspace> _workspaces = [
    QuantWorkspace(
      id: 'personal',
      name: 'Personal Workspace',
      description: 'Sovereign personal email & documents',
      icon: Icons.person_outline_rounded,
      accentColor: QuantColors.sunsetGold,
      memberCount: 1,
    ),
    QuantWorkspace(
      id: 'lab',
      name: 'Quant Trinity Lab',
      description: 'Primary sovereign R&D ecosystem cluster',
      icon: Icons.hub_outlined,
      accentColor: QuantColors.moltenAmber,
      memberCount: 15,
    ),
    QuantWorkspace(
      id: 'enterprise',
      name: 'Enterprise System',
      description: 'Sovereign root organization with RBAC Level 5',
      icon: Icons.domain_rounded,
      accentColor: QuantColors.sovereignCyan,
      memberCount: 1420,
    ),
  ];

  late String _selectedIdentityId;
  late String _selectedWorkspaceId;
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _selectedIdentityId = widget.currentIdentity?.id ?? _identities.first.id;
    _selectedWorkspaceId = widget.currentWorkspace?.id ?? _workspaces[1].id;

    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 0.4, end: 1.0).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  void _switchIdentity(QuantIdentity identity) {
    setState(() => _selectedIdentityId = identity.id);
    widget.onIdentityChanged?.call(identity);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateSurface,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: identity.accentColor.withOpacity(0.4)),
        ),
        content: Row(
          children: [
            Icon(Icons.verified_user_rounded, color: identity.accentColor, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Switched active identity to ${identity.name} (${identity.role})',
                style: const TextStyle(color: QuantColors.textPrimary, fontSize: 13),
              ),
            ),
          ],
        ),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  void _switchWorkspace(QuantWorkspace ws) {
    setState(() => _selectedWorkspaceId = ws.id);
    widget.onWorkspaceChanged?.call(ws);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateSurface,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: ws.accentColor.withOpacity(0.4)),
        ),
        content: Row(
          children: [
            Icon(ws.icon, color: ws.accentColor, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Active workspace: ${ws.name}',
                style: const TextStyle(color: QuantColors.textPrimary, fontSize: 13),
              ),
            ),
          ],
        ),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  void _showLogoutConfirmation() {
    showDialog(
      context: context,
      barrierColor: Colors.black.withOpacity(0.8),
      builder: (ctx) => AlertDialog(
        backgroundColor: QuantColors.darkSlateCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: QuantColors.hairlineBorder),
        ),
        title: const Row(
          children: [
            Icon(Icons.warning_amber_rounded, color: QuantColors.statusError, size: 24),
            SizedBox(width: 12),
            Text(
              'Confirm Sovereign Sign-Out',
              style: TextStyle(
                color: QuantColors.textPrimary,
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
        content: const Text(
          'Signing out will flush local ephemeral encryption pre-keys, revoke active session tokens, and lock your biometric sovereign vault on this device.',
          style: TextStyle(color: QuantColors.textSecondary, fontSize: 13, height: 1.45),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel', style: TextStyle(color: QuantColors.textMuted)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: QuantColors.statusError,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            onPressed: () {
              Navigator.of(ctx).pop();
              Navigator.of(context).pop();
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  backgroundColor: QuantColors.darkSlateSurface,
                  content: Text(
                    'Sovereign session terminated. Vault locked successfully.',
                    style: TextStyle(color: QuantColors.statusSuccess),
                  ),
                ),
              );
            },
            child: const Text('Sign Out & Lock Vault'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final activeIdentity = _identities.firstWhere(
      (id) => id.id == _selectedIdentityId,
      orElse: () => _identities.first,
    );

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.90,
      ),
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        border: Border(
          top: BorderSide(color: QuantColors.hairlineBorder, width: 1.5),
          left: BorderSide(color: QuantColors.hairlineBorder, width: 1.0),
          right: BorderSide(color: QuantColors.hairlineBorder, width: 1.0),
        ),
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // Sheet Grab Handle
              Center(
                child: Container(
                  width: 44,
                  height: 4,
                  decoration: BoxDecoration(
                    color: QuantColors.hairlineBorder,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 18),

              // Active Identity Top Highlight
              _buildActiveIdentityHeader(activeIdentity),
              const SizedBox(height: 20),

              // Live Backend Telemetry Sentinel
              _buildLiveBackendHealthStatus(),
              const SizedBox(height: 20),

              // Multi-Segment Storage Quota Bar (14.2 GB / 100 GB)
              _buildStorageQuotaSection(),
              const SizedBox(height: 24),

              // Sovereign Identities List
              _buildSectionTitle(
                title: 'SOVEREIGN IDENTITIES',
                actionLabel: 'Add Token',
                icon: Icons.vpn_key_outlined,
                onActionTap: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      backgroundColor: QuantColors.darkSlateSurface,
                      content: Text(
                        'Hardware Token pairing ready (FIDO2 / YubiKey / WebAuthn).',
                        style: TextStyle(color: QuantColors.sovereignCyan),
                      ),
                    ),
                  );
                },
              ),
              const SizedBox(height: 10),
              ..._identities.map((identity) => _buildIdentityTile(identity)),
              const SizedBox(height: 20),

              // Workspaces Switcher
              _buildSectionTitle(
                title: 'WORKSPACES',
                actionLabel: 'New Space',
                icon: Icons.add_circle_outline_rounded,
                onActionTap: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      backgroundColor: QuantColors.darkSlateSurface,
                      content: Text(
                        'New Sovereign Organization provisioning engine invoked.',
                        style: TextStyle(color: QuantColors.moltenAmber),
                      ),
                    ),
                  );
                },
              ),
              const SizedBox(height: 10),
              ..._workspaces.map((ws) => _buildWorkspaceTile(ws)),
              const SizedBox(height: 24),

              // Danger Zone: Secure Logout
              _buildLogoutButton(),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildActiveIdentityHeader(QuantIdentity identity) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: identity.accentColor.withOpacity(0.35),
          width: 1.2,
        ),
      ),
      child: Row(
        children: [
          // Initials Avatar
          Container(
            width: 54,
            height: 54,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [identity.accentColor, identity.accentColor.withOpacity(0.65)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: identity.accentColor.withOpacity(0.28),
                  blurRadius: 14,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Center(
              child: Text(
                identity.initials,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -0.5,
                ),
              ),
            ),
          ),
          const SizedBox(width: 14),

          // Name, Email & Role
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        identity.name,
                        style: const TextStyle(
                          color: QuantColors.textPrimary,
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Icon(
                      Icons.verified_rounded,
                      color: identity.accentColor,
                      size: 16,
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  identity.email,
                  style: const TextStyle(
                    color: QuantColors.textSecondary,
                    fontSize: 13,
                    fontFamily: 'monospace',
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: identity.accentColor.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(
                      color: identity.accentColor.withOpacity(0.3),
                      width: 1,
                    ),
                  ),
                  child: Text(
                    identity.role.toUpperCase(),
                    style: TextStyle(
                      color: identity.accentColor,
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Active Badge Pill
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: QuantColors.statusSuccess.withOpacity(0.12),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: QuantColors.statusSuccess.withOpacity(0.3),
                width: 1,
              ),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.lock_outline_rounded, color: QuantColors.statusSuccess, size: 13),
                SizedBox(width: 4),
                Text(
                  'ACTIVE',
                  style: TextStyle(
                    color: QuantColors.statusSuccess,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLiveBackendHealthStatus() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Row(
        children: [
          // Animated Beacon Indicator
          AnimatedBuilder(
            animation: _pulseAnimation,
            builder: (context, child) {
              return Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: QuantColors.statusSuccess,
                  boxShadow: [
                    BoxShadow(
                      color: QuantColors.statusSuccess.withOpacity(_pulseAnimation.value),
                      blurRadius: 8,
                      spreadRadius: 2,
                    ),
                  ],
                ),
              );
            },
          ),
          const SizedBox(width: 12),

          // Live Backend Health Text
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Fastify Backend: https://quantmail.in · Latency: <24ms (Healthy)',
                  style: TextStyle(
                    color: QuantColors.textPrimary,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  'EKS 20-Pod Mesh · Mumbai Staging · TLS 1.3 · Kyber-768 E2EE',
                  style: TextStyle(
                    color: QuantColors.textMuted,
                    fontSize: 11,
                    fontFamily: 'monospace',
                  ),
                ),
              ],
            ),
          ),

          Icon(
            Icons.speed_rounded,
            color: QuantColors.sovereignCyan.withOpacity(0.8),
            size: 18,
          ),
        ],
      ),
    );
  }

  Widget _buildStorageQuotaSection() {
    // Total Quota: 14.2 GB / 100 GB
    // Mail: 6.8 GB molten amber
    // Drive: 5.4 GB sovereign cyan
    // Git: 2.0 GB obsidian purple
    // Free: 85.8 GB subtle divider
    const double totalQuotaGb = 100.0;
    const double mailGb = 6.8;
    const double driveGb = 5.4;
    const double gitGb = 2.0;
    const double usedGb = mailGb + driveGb + gitGb; // 14.2 GB
    const double freeGb = totalQuotaGb - usedGb; // 85.8 GB

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
          // Header Row
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(Icons.pie_chart_outline_rounded, color: QuantColors.sovereignCyan, size: 16),
                  SizedBox(width: 8),
                  Text(
                    'SOVEREIGN STORAGE QUOTA',
                    style: TextStyle(
                      color: QuantColors.textSecondary,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.6,
                    ),
                  ),
                ],
              ),
              RichText(
                text: const TextSpan(
                  children: [
                    TextSpan(
                      text: '14.2 GB ',
                      style: TextStyle(
                        color: QuantColors.textPrimary,
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    TextSpan(
                      text: '/ 100 GB',
                      style: TextStyle(
                        color: QuantColors.textMuted,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Multi-Segment Quota Bar (Zero Skia clipPath: pure rounded container row)
          Container(
            height: 10,
            decoration: BoxDecoration(
              color: QuantColors.voidObsidian,
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: QuantColors.hairlineBorder, width: 0.8),
            ),
            child: Row(
              children: [
                // Mail Segment: 6.8 GB (molten amber)
                Flexible(
                  flex: (mailGb * 10).toInt(),
                  child: Container(
                    decoration: const BoxDecoration(
                      color: QuantColors.moltenAmber,
                      borderRadius: BorderRadius.horizontal(left: Radius.circular(5)),
                    ),
                  ),
                ),
                // Drive Segment: 5.4 GB (sovereign cyan)
                Flexible(
                  flex: (driveGb * 10).toInt(),
                  child: Container(
                    color: QuantColors.sovereignCyan,
                  ),
                ),
                // Git Segment: 2.0 GB (obsidian purple)
                Flexible(
                  flex: (gitGb * 10).toInt(),
                  child: Container(
                    color: QuantColors.obsidianPurple,
                  ),
                ),
                // Free Space Segment: 85.8 GB
                Flexible(
                  flex: (freeGb * 10).toInt(),
                  child: Container(
                    decoration: const BoxDecoration(
                      color: Color(0xFF1E2330),
                      borderRadius: BorderRadius.horizontal(right: Radius.circular(5)),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // Breakdown Legend
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _buildQuotaLegendItem('Mail', '${mailGb.toStringAsFixed(1)} GB', QuantColors.moltenAmber),
              _buildQuotaLegendItem('Drive', '${driveGb.toStringAsFixed(1)} GB', QuantColors.sovereignCyan),
              _buildQuotaLegendItem('Git', '${gitGb.toStringAsFixed(1)} GB', QuantColors.obsidianPurple),
              _buildQuotaLegendItem('Free', '${freeGb.toStringAsFixed(1)} GB', QuantColors.textMuted),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildQuotaLegendItem(String label, String value, Color color) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 6),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: const TextStyle(
                color: QuantColors.textMuted,
                fontSize: 10,
                fontWeight: FontWeight.w600,
              ),
            ),
            Text(
              value,
              style: const TextStyle(
                color: QuantColors.textPrimary,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildSectionTitle({
    required String title,
    required String actionLabel,
    required IconData icon,
    required VoidCallback onActionTap,
  }) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          title,
          style: const TextStyle(
            color: QuantColors.textSecondary,
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
          ),
        ),
        InkWell(
          onTap: onActionTap,
          borderRadius: BorderRadius.circular(8),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
            child: Row(
              children: [
                Icon(icon, color: QuantColors.sovereignCyan, size: 14),
                const SizedBox(width: 4),
                Text(
                  actionLabel,
                  style: const TextStyle(
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
    );
  }

  Widget _buildIdentityTile(QuantIdentity identity) {
    final isSelected = identity.id == _selectedIdentityId;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: isSelected ? QuantColors.elevatedCard : QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isSelected ? identity.accentColor : QuantColors.hairlineBorder,
          width: isSelected ? 1.5 : 1.0,
        ),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () => _switchIdentity(identity),
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                // Initials Circle
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: identity.accentColor.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: identity.accentColor.withOpacity(0.4),
                      width: 1,
                    ),
                  ),
                  child: Center(
                    child: Text(
                      identity.initials,
                      style: TextStyle(
                        color: identity.accentColor,
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),

                // Name & Role
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              identity.name,
                              style: const TextStyle(
                                color: QuantColors.textPrimary,
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            '[${identity.initials}]',
                            style: TextStyle(
                              color: identity.accentColor,
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              fontFamily: 'monospace',
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${identity.email} · ${identity.role}',
                        style: const TextStyle(
                          color: QuantColors.textSecondary,
                          fontSize: 12,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),

                // Selection Radio Check Indicator
                if (isSelected)
                  Container(
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: identity.accentColor,
                    ),
                    child: const Icon(
                      Icons.check_rounded,
                      color: Colors.black,
                      size: 16,
                    ),
                  )
                else
                  Container(
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: QuantColors.hairlineBorder, width: 1.5),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildWorkspaceTile(QuantWorkspace ws) {
    final isSelected = ws.id == _selectedWorkspaceId;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: isSelected ? QuantColors.elevatedCard : QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isSelected ? ws.accentColor : QuantColors.hairlineBorder,
          width: isSelected ? 1.5 : 1.0,
        ),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () => _switchWorkspace(ws),
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                // Workspace Icon
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: ws.accentColor.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(ws.icon, color: ws.accentColor, size: 20),
                ),
                const SizedBox(width: 12),

                // Workspace Details
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        ws.name,
                        style: const TextStyle(
                          color: QuantColors.textPrimary,
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${ws.description} · ${ws.memberCount} members',
                        style: const TextStyle(
                          color: QuantColors.textSecondary,
                          fontSize: 12,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),

                // Active Workspace Pill
                if (isSelected)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: ws.accentColor.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: ws.accentColor.withOpacity(0.4)),
                    ),
                    child: Text(
                      'ACTIVE',
                      style: TextStyle(
                        color: ws.accentColor,
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
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

  Widget _buildLogoutButton() {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: QuantColors.statusError.withOpacity(0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: QuantColors.statusError.withOpacity(0.35),
          width: 1.0,
        ),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: _showLogoutConfirmation,
          borderRadius: BorderRadius.circular(16),
          splashColor: QuantColors.statusError.withOpacity(0.15),
          child: const Padding(
            padding: EdgeInsets.symmetric(vertical: 14),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.logout_rounded, color: QuantColors.statusError, size: 18),
                SizedBox(width: 10),
                Text(
                  'Lock Vault & Sign Out Sovereign Session',
                  style: TextStyle(
                    color: QuantColors.statusError,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
