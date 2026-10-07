// Sovereign Quant Ecosystem - QuantChat Sovereign Settings Screen
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _enableHardwareKeystore = true;
  bool _enable120HzImpeller = true;
  bool _enableBiometricUnlock = true;
  bool _enableCallRelay = false;
  String _disappearingMessagesTimer = 'Off';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
          children: [
            // User Identity & Security Card
            _buildIdentityCard(),
            const SizedBox(height: 18),

            // Section 1: End-to-End Cryptography & Privacy
            _buildSectionHeader('SOVEREIGN E2EE & SECURITY', Icons.security_rounded),
            _buildSettingCard([
              _buildSwitchTile(
                title: 'Hardware Keystore Storage',
                subtitle: 'Keys sealed in Android KeyStore / iOS Secure Enclave',
                icon: Icons.vpn_key_rounded,
                iconColor: QuantColors.moltenOrange,
                value: _enableHardwareKeystore,
                onChanged: (val) => setState(() => _enableHardwareKeystore = val),
              ),
              const Divider(color: QuantColors.hairlineBorder, height: 1),
              _buildSwitchTile(
                title: 'Biometric App Lock',
                subtitle: 'Require Fingerprint or Face ID on app launch',
                icon: Icons.fingerprint_rounded,
                iconColor: QuantColors.statusSuccess,
                value: _enableBiometricUnlock,
                onChanged: (val) => setState(() => _enableBiometricUnlock = val),
              ),
              const Divider(color: QuantColors.hairlineBorder, height: 1),
              _buildNavigationTile(
                title: 'Disappearing Messages Default',
                subtitle: _disappearingMessagesTimer,
                icon: Icons.timer_outlined,
                iconColor: QuantColors.sovereignCyan,
                onTap: _showDisappearingMessagesDialog,
              ),
            ]),
            const SizedBox(height: 18),

            // Section 2: WebRTC & Voice/Video Network Mesh
            _buildSectionHeader('WEBRTC AUDIO/VIDEO MESH', Icons.cell_tower_rounded),
            _buildSettingCard([
              _buildNavigationTile(
                title: 'STUN / TURN Sovereign Nodes',
                subtitle: 'Fastify Gateway: stun:mesh.quant.network:3478',
                icon: Icons.dns_rounded,
                iconColor: QuantColors.sunsetGold,
                onTap: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      backgroundColor: QuantColors.darkSlateCard,
                      content: Text('P2P Mesh STUN/TURN latency: 14ms ping'),
                    ),
                  );
                },
              ),
              const Divider(color: QuantColors.hairlineBorder, height: 1),
              _buildSwitchTile(
                title: 'Always Relay Calls',
                subtitle: 'Relay calls through sovereign node to hide peer IP',
                icon: Icons.shield_rounded,
                iconColor: QuantColors.emeraldMatrix,
                value: _enableCallRelay,
                onChanged: (val) => setState(() => _enableCallRelay = val),
              ),
            ]),
            const SizedBox(height: 18),

            // Section 3: Performance & Impeller 120Hz
            _buildSectionHeader('PERFORMANCE & ENGINE', Icons.speed_rounded),
            _buildSettingCard([
              _buildSwitchTile(
                title: '120Hz Impeller GPU Acceleration',
                subtitle: 'Hardware rasterization with zero Skia clipPath jank',
                icon: Icons.bolt_rounded,
                iconColor: QuantColors.moltenOrange,
                value: _enable120HzImpeller,
                onChanged: (val) => setState(() => _enable120HzImpeller = val),
              ),
              const Divider(color: QuantColors.hairlineBorder, height: 1),
              _buildNavigationTile(
                title: 'Instant Search FTS5 Index',
                subtitle: '3.4 MB indexed locally (<5ms query speed)',
                icon: Icons.storage_rounded,
                iconColor: QuantColors.obsidianPurple,
                onTap: () {},
              ),
            ]),
          ],
        ),
      ),
    );
  }

  Widget _buildIdentityCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: QuantColors.moltenOrange.withOpacity(0.35)),
        boxShadow: [
          BoxShadow(
            color: QuantColors.moltenOrange.withOpacity(0.06),
            blurRadius: 16,
            spreadRadius: 2,
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 54,
            height: 54,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [QuantColors.moltenOrange, Color(0xFFFF8C42)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Center(
              child: Text(
                'QC',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Text(
                      'Quant Sovereign Peer',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                    SizedBox(width: 6),
                    Icon(Icons.verified_rounded, size: 16, color: QuantColors.statusSuccess),
                  ],
                ),
                const SizedBox(height: 3),
                const Text(
                  'peer:0x8f4c...3e1a (Ed25519)',
                  style: TextStyle(
                    fontSize: 12,
                    fontFamily: 'monospace',
                    color: QuantColors.sovereignCyan,
                  ),
                ),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: QuantColors.statusSuccess.withOpacity(0.14),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Text(
                    'SIGNAL DOUBLE RATCHET ACTIVE',
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.4,
                      color: QuantColors.statusSuccess,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title, IconData icon) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 8),
      child: Row(
        children: [
          Icon(icon, size: 14, color: QuantColors.textMuted),
          const SizedBox(width: 6),
          Text(
            title,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
              color: QuantColors.textMuted,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSettingCard(List<Widget> children) {
    return Container(
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(children: children),
    );
  }

  Widget _buildSwitchTile({
    required String title,
    required String subtitle,
    required IconData icon,
    required Color iconColor,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: iconColor.withOpacity(0.14),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: iconColor, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: const TextStyle(
                    fontSize: 11,
                    color: QuantColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          Switch(
            value: value,
            activeColor: QuantColors.moltenOrange,
            onChanged: onChanged,
          ),
        ],
      ),
    );
  }

  Widget _buildNavigationTile({
    required String title,
    required String subtitle,
    required IconData icon,
    required Color iconColor,
    required VoidCallback onTap,
  }) {
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: iconColor.withOpacity(0.14),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: iconColor, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 11,
                      color: QuantColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.arrow_forward_ios_rounded, size: 14, color: QuantColors.textMuted),
          ],
        ),
      ),
    );
  }

  void _showDisappearingMessagesDialog() {
    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor: QuantColors.darkSlateCard,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
            side: const BorderSide(color: QuantColors.hairlineBorder),
          ),
          title: const Text('Disappearing Messages', style: TextStyle(color: Colors.white)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: ['Off', '24 Hours', '7 Days', '90 Days'].map((option) {
              return ListTile(
                title: Text(option, style: const TextStyle(color: QuantColors.textPrimary)),
                trailing: _disappearingMessagesTimer == option
                    ? const Icon(Icons.check_rounded, color: QuantColors.moltenOrange)
                    : null,
                onTap: () {
                  setState(() => _disappearingMessagesTimer = option);
                  Navigator.of(ctx).pop();
                },
              );
            }).toList(),
          ),
        );
      },
    );
  }
}
