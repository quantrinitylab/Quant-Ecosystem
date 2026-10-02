// Sovereign Quant Ecosystem - QuantAds Settings & Network Configuration
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _enclavePrivacyEnabled = true;
  bool _skAdNetworkProxy = true;
  bool _hardwareAcceleration = true;
  bool _instantPayoutsAuto = false;
  bool _fraudDetectionMesh = true;

  static const Color adsAmber = Color(0xFFF59E0B);
  static const Color sovereignCyan = Color(0xFF38BDF8);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Account Identity Card
            _buildAccountHeader(),

            const SizedBox(height: 20),

            // Ad Exchange & RTB Network Settings
            _buildSectionHeader('Ad Exchange & RTB Engine'),
            const SizedBox(height: 8),
            _buildExchangeSettingsCard(),

            const SizedBox(height: 20),

            // Sovereign Privacy & Zero-Knowledge Attribution
            _buildSectionHeader('Zero-Knowledge Privacy & Enclaves'),
            const SizedBox(height: 8),
            _buildPrivacyCard(),

            const SizedBox(height: 20),

            // Creator Monetization & Automated Payouts
            _buildSectionHeader('Monetization & Payout Preferences'),
            const SizedBox(height: 8),
            _buildPayoutPreferencesCard(),

            const SizedBox(height: 20),

            // Developer API Keys & Webhooks
            _buildSectionHeader('Developer APIs & Webhooks'),
            const SizedBox(height: 8),
            _buildDeveloperCard(),

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Text(
      title,
      style: const TextStyle(
        color: QuantColors.textSecondary,
        fontSize: 12,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.5,
      ),
    );
  }

  Widget _buildAccountHeader() {
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
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [adsAmber, Color(0xFFD97706)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Center(
              child: Icon(Icons.campaign_rounded, color: Colors.black, size: 24),
            ),
          ),
          const SizedBox(width: 14),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Quant Sovereign Ad Exchange',
                  style: TextStyle(
                    color: QuantColors.textPrimary,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                SizedBox(height: 3),
                Text(
                  'Account ID: ACC-SOV-ADS-9921',
                  style: TextStyle(color: QuantColors.textMuted, fontSize: 11),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: QuantColors.statusSuccess.withOpacity(0.15),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: QuantColors.statusSuccess.withOpacity(0.4)),
            ),
            child: const Text(
              'Verified DSP',
              style: TextStyle(
                color: QuantColors.statusSuccess,
                fontSize: 10,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildExchangeSettingsCard() {
    return Container(
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        children: [
          _buildToggleTile(
            title: '120Hz Hardware Impeller Engine',
            subtitle: 'Sub-8ms programmatic ad auction rendering without layout jitter.',
            value: _hardwareAcceleration,
            onChanged: (v) => setState(() => _hardwareAcceleration = v),
          ),
          const Divider(color: QuantColors.subtleDivider, height: 1),
          _buildToggleTile(
            title: 'Multi-Model Ad Fraud Defense',
            subtitle: 'Zero-latency neural network filters invalid click bots and spoofing.',
            value: _fraudDetectionMesh,
            onChanged: (v) => setState(() => _fraudDetectionMesh = v),
          ),
        ],
      ),
    );
  }

  Widget _buildPrivacyCard() {
    return Container(
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        children: [
          _buildToggleTile(
            title: 'Zero-Knowledge Attribution Enclave',
            subtitle: 'Attribution verified via cryptographic proofs without tracking user PII.',
            value: _enclavePrivacyEnabled,
            onChanged: (v) => setState(() => _enclavePrivacyEnabled = v),
          ),
          const Divider(color: QuantColors.subtleDivider, height: 1),
          _buildToggleTile(
            title: 'Apple ATT & Privacy Sandbox Proxy',
            subtitle: 'SKAdNetwork 5.0 and Private Click Measurement sovereign bridge.',
            value: _skAdNetworkProxy,
            onChanged: (v) => setState(() => _skAdNetworkProxy = v),
          ),
        ],
      ),
    );
  }

  Widget _buildPayoutPreferencesCard() {
    return Container(
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        children: [
          _buildToggleTile(
            title: 'Auto-Cashout on Threshold (\$1,000)',
            subtitle: 'Automatically disburse creator earnings via UPI or Stripe every week.',
            value: _instantPayoutsAuto,
            onChanged: (v) => setState(() => _instantPayoutsAuto = v),
          ),
          const Divider(color: QuantColors.subtleDivider, height: 1),
          ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            title: const Text(
              'Default Payout Destination',
              style: TextStyle(color: QuantColors.textPrimary, fontSize: 13, fontWeight: FontWeight.w600),
            ),
            subtitle: const Text(
              'Razorpay UPI: sovereign.creator@okquant',
              style: TextStyle(color: QuantColors.textMuted, fontSize: 11),
            ),
            trailing: const Icon(Icons.arrow_forward_ios_rounded, color: QuantColors.textMuted, size: 14),
            onTap: () {},
          ),
        ],
      ),
    );
  }

  Widget _buildDeveloperCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Sovereign RTB API Key',
                style: TextStyle(color: QuantColors.textPrimary, fontSize: 13, fontWeight: FontWeight.w600),
              ),
              IconButton(
                constraints: const BoxConstraints(),
                padding: EdgeInsets.zero,
                icon: const Icon(Icons.copy_rounded, color: adsAmber, size: 16),
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      backgroundColor: QuantColors.elevatedCard,
                      content: Text('API Key copied to clipboard', style: TextStyle(color: QuantColors.textPrimary)),
                    ),
                  );
                },
              ),
            ],
          ),
          const SizedBox(height: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: QuantColors.elevatedCard,
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Text(
              'qads_live_sec_99a8b72e140d3f88c6b291048e',
              style: TextStyle(
                fontFamily: 'monospace',
                color: sovereignCyan,
                fontSize: 11,
              ),
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'Webhook Endpoint URL',
            style: TextStyle(color: QuantColors.textPrimary, fontSize: 13, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: QuantColors.elevatedCard,
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Text(
              'https://api.quantads.in/v1/rtb/webhook/bids',
              style: TextStyle(
                fontFamily: 'monospace',
                color: QuantColors.textSecondary,
                fontSize: 11,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildToggleTile({
    required String title,
    required String subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return SwitchListTile.adaptive(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      title: Text(
        title,
        style: const TextStyle(
          color: QuantColors.textPrimary,
          fontSize: 13,
          fontWeight: FontWeight.w600,
        ),
      ),
      subtitle: Text(
        subtitle,
        style: const TextStyle(color: QuantColors.textMuted, fontSize: 11),
      ),
      value: value,
      activeColor: adsAmber,
      onChanged: onChanged,
    );
  }
}
