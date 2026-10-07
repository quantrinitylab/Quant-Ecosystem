// Sovereign Quant Ecosystem - QuantAds Standalone Flutter Application
// Sovereign Meta Ads & Google Ads Killer Ad Exchange & Creator Monetization Flutter Application.
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import 'screens/campaigns_screen.dart';
import 'screens/rtb_auction_screen.dart';
import 'screens/analytics_screen.dart';
import 'screens/payouts_screen.dart';
import 'screens/settings_screen.dart';

void main() {
  runApp(const QuantAdsApp());
}

class QuantAdsApp extends StatelessWidget {
  const QuantAdsApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'QuantAds',
      debugShowCheckedModeBanner: false,
      theme: QuantTheme.obsidianDarkTheme,
      home: const QuantAdsHomeScreen(),
    );
  }
}

class QuantAdsHomeScreen extends StatefulWidget {
  const QuantAdsHomeScreen({super.key});

  @override
  State<QuantAdsHomeScreen> createState() => _QuantAdsHomeScreenState();
}

class _QuantAdsHomeScreenState extends State<QuantAdsHomeScreen> {
  int _activeTabIndex = 0;
  // Honest default: no fake starting balance. Recharge adds real (locally
  // tracked) credits until the wallet backend seam is wired.
  double _advertiserCredits = 0.0;

  static const Color adsAmber = Color(0xFFF59E0B);
  static const Color sovereignCyan = Color(0xFF38BDF8);

  final List<Widget> _screens = const [
    CampaignsScreen(),
    RtbAuctionScreen(),
    AnalyticsScreen(),
    PayoutsScreen(),
    SettingsScreen(),
  ];

  void _showTopUpSheet() {
    final amountController = TextEditingController(text: '1000.00');

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: QuantColors.voidObsidian,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 24,
                bottom: MediaQuery.of(context).viewInsets.bottom + 24,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Recharge Ad Credits',
                        style: TextStyle(
                          color: QuantColors.textPrimary,
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close_rounded, color: QuantColors.textMuted),
                        onPressed: () => Navigator.pop(ctx),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Deposit funds into your Sovereign RTB bidding escrow account with zero platform fees.',
                    style: TextStyle(color: QuantColors.textMuted, fontSize: 12),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: amountController,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    style: const TextStyle(
                      color: QuantColors.textPrimary,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                    decoration: InputDecoration(
                      labelText: 'Credit Amount (\$ USD)',
                      prefixText: '\$ ',
                      prefixStyle: const TextStyle(color: adsAmber, fontSize: 18, fontWeight: FontWeight.w700),
                      labelStyle: const TextStyle(color: QuantColors.textSecondary),
                      filled: true,
                      fillColor: QuantColors.darkSlateCard,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: QuantColors.hairlineBorder),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: QuantColors.hairlineBorder),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: adsAmber),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  // Quick preset chips
                  Row(
                    children: [500, 1000, 2500, 5000].map((preset) {
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ActionChip(
                          label: Text('+\$$preset'),
                          backgroundColor: QuantColors.darkSlateCard,
                          labelStyle: const TextStyle(color: adsAmber, fontSize: 11, fontWeight: FontWeight.w700),
                          side: const BorderSide(color: QuantColors.hairlineBorder),
                          onPressed: () {
                            setModalState(() {
                              amountController.text = preset.toDouble().toStringAsFixed(2);
                            });
                          },
                        ),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: adsAmber,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: () {
                        final val = double.tryParse(amountController.text) ?? 0.0;
                        if (val > 0) {
                          setState(() {
                            _advertiserCredits += val;
                          });
                          Navigator.pop(ctx);
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              backgroundColor: QuantColors.darkSlateCard,
                              content: Text(
                                'Recharge successful: +\$${val.toStringAsFixed(2)} added to bidding escrow.',
                                style: const TextStyle(color: QuantColors.statusSuccess),
                              ),
                            ),
                          );
                        }
                      },
                      child: const Text(
                        'Confirm Credit Deposit',
                        style: TextStyle(color: Colors.black, fontWeight: FontWeight.w700, fontSize: 15),
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SafeArea(
        child: Column(
          children: [
            // Top App Bar with Brand Identity and Balance Chip
            _buildTopCapsuleBar(),

            // Active Tab View
            Expanded(
              child: IndexedStack(
                index: _activeTabIndex,
                children: _screens,
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: _buildObsidianBottomNav(),
    );
  }

  Widget _buildTopCapsuleBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // QuantAds Brand Identity
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [adsAmber, Color(0xFFD97706)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(10),
                  boxShadow: [
                    BoxShadow(
                      color: adsAmber.withOpacity(0.35),
                      blurRadius: 8,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: const Center(
                  child: Icon(
                    Icons.campaign_rounded,
                    color: Colors.black,
                    size: 20,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              RichText(
                text: const TextSpan(
                  children: [
                    TextSpan(
                      text: 'Quant',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                        letterSpacing: -0.5,
                      ),
                    ),
                    TextSpan(
                      text: 'Ads',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: adsAmber,
                        letterSpacing: -0.5,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          // Top Balance Chip (e.g. $14,250.00 Credits)
          GestureDetector(
            onTap: _showTopUpSheet,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: adsAmber.withOpacity(0.5)),
                boxShadow: [
                  BoxShadow(
                    color: adsAmber.withOpacity(0.15),
                    blurRadius: 6,
                    offset: const Offset(0, 1),
                  ),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.account_balance_wallet_rounded,
                    color: adsAmber,
                    size: 15,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    '\$${_advertiserCredits.toStringAsFixed(2)} Credits',
                    style: const TextStyle(
                      color: QuantColors.textPrimary,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.2,
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Icon(
                    Icons.add_circle_rounded,
                    color: adsAmber,
                    size: 14,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildObsidianBottomNav() {
    return Container(
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        border: Border(
          top: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 64,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildNavItem(0, Icons.campaign_rounded, Icons.campaign_outlined, 'Campaigns'),
              _buildNavItem(1, Icons.gavel_rounded, Icons.gavel_outlined, 'Auction', isLivePulse: true),
              _buildNavItem(2, Icons.insights_rounded, Icons.insights_outlined, 'Analytics'),
              _buildNavItem(3, Icons.payments_rounded, Icons.payments_outlined, 'Payouts', badgeText: '70%'),
              _buildNavItem(4, Icons.settings_rounded, Icons.settings_outlined, 'Settings'),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildNavItem(
    int index,
    IconData activeIcon,
    IconData inactiveIcon,
    String label, {
    String? badgeText,
    bool isLivePulse = false,
  }) {
    final isSelected = _activeTabIndex == index;
    final color = isSelected ? adsAmber : QuantColors.textMuted;

    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () => setState(() => _activeTabIndex = index),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Icon(
                  isSelected ? activeIcon : inactiveIcon,
                  color: color,
                  size: 22,
                ),
                if (badgeText != null)
                  Positioned(
                    right: -10,
                    top: -4,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                      decoration: BoxDecoration(
                        color: QuantColors.statusSuccess,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        badgeText,
                        style: const TextStyle(
                          color: Colors.black,
                          fontSize: 8,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                if (isLivePulse)
                  Positioned(
                    right: -4,
                    top: -2,
                    child: Container(
                      width: 7,
                      height: 7,
                      decoration: BoxDecoration(
                        color: QuantColors.statusSuccess,
                        shape: BoxShape.circle,
                        border: Border.all(color: QuantColors.darkSlateCard, width: 1),
                        boxShadow: [
                          BoxShadow(
                            color: QuantColors.statusSuccess.withOpacity(0.8),
                            blurRadius: 4,
                            spreadRadius: 1,
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 3),
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
