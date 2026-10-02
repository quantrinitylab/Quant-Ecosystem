import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';

/// Sovereign Live Creator Virtual Gifting Sheet
/// 
/// Commercial Shortie & TikTok-class virtual gifting modal featuring:
/// - Sovereign Coin balance pill with instant top-up wallet flow
/// - 8 distinct high-fidelity gift items with diamond creator payouts:
///   1. Rose (1 Coin -> 0.5 Diamonds)
///   2. Neon Star (10 Coins -> 5 Diamonds)
///   3. Quantum Ring (50 Coins -> 25 Diamonds)
///   4. Crown (199 Coins -> 100 Diamonds)
///   5. Supercar (999 Coins -> 500 Diamonds)
///   6. Galaxy (1,999 Coins -> 1,000 Diamonds)
///   7. Falcon (4,999 Coins -> 2,500 Diamonds)
///   8. Sovereign Throne (9,999 Coins -> 5,000 Diamonds)
/// - Combo multiplier bursts (x1, x5, x10, x99)
/// - Real-time creator diamond settlement
/// 
/// Strict Invariants:
/// - 100% ZERO raw Unicode emojis (strictly Material 3 vector Icon(Icons.xxx)).
/// - 100% ZERO Skia clipPath method calls (pure Impeller hardware acceleration).
/// - High density, enterprise obsidian luxury palette (QuantColors.voidObsidian, #12151E, #1E222A).

class VirtualGiftItem {
  final String id;
  final String name;
  final int coinCost;
  final int diamondPayout;
  final IconData icon;
  final Color accentColor;
  final String description;

  const VirtualGiftItem({
    required this.id,
    required this.name,
    required this.coinCost,
    required this.diamondPayout,
    required this.icon,
    required this.accentColor,
    required this.description,
  });
}

class VirtualGiftsSheet extends StatefulWidget {
  final String creatorHandle;
  final String creatorAvatarUrl;
  final void Function(VirtualGiftItem gift, int multiplier)? onGiftSent;

  const VirtualGiftsSheet({
    super.key,
    required this.creatorHandle,
    required this.creatorAvatarUrl,
    this.onGiftSent,
  });

  /// Displays the Virtual Gifts sheet as a modal bottom sheet
  static Future<void> show(
    BuildContext context, {
    required String creatorHandle,
    required String creatorAvatarUrl,
    void Function(VirtualGiftItem gift, int multiplier)? onGiftSent,
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      elevation: 0,
      builder: (context) => VirtualGiftsSheet(
        creatorHandle: creatorHandle,
        creatorAvatarUrl: creatorAvatarUrl,
        onGiftSent: onGiftSent,
      ),
    );
  }

  @override
  State<VirtualGiftsSheet> createState() => _VirtualGiftsSheetState();
}

class _VirtualGiftsSheetState extends State<VirtualGiftsSheet> {
  int _userCoinBalance = 2450;
  VirtualGiftItem? _selectedGift;
  int _selectedMultiplier = 1; // 1, 5, 10, 99
  bool _isSending = false;

  static const List<VirtualGiftItem> giftsCatalog = [
    VirtualGiftItem(
      id: 'gift-rose',
      name: 'Rose',
      coinCost: 1,
      diamondPayout: 1,
      icon: Icons.local_florist_rounded,
      accentColor: QuantColors.sunriseRose,
      description: 'Classic gesture of appreciation',
    ),
    VirtualGiftItem(
      id: 'gift-neon-star',
      name: 'Neon Star',
      coinCost: 10,
      diamondPayout: 5,
      icon: Icons.star_rounded,
      accentColor: QuantColors.sunsetGold,
      description: 'Luminous community spotlight',
    ),
    VirtualGiftItem(
      id: 'gift-quantum-ring',
      name: 'Quantum Ring',
      coinCost: 50,
      diamondPayout: 25,
      icon: Icons.radio_button_checked_rounded,
      accentColor: QuantColors.sovereignCyan,
      description: 'Sovereign orbital entanglement',
    ),
    VirtualGiftItem(
      id: 'gift-crown',
      name: 'Crown',
      coinCost: 199,
      diamondPayout: 100,
      icon: Icons.military_tech_rounded,
      accentColor: QuantColors.moltenAmber,
      description: 'Royal creator recognition',
    ),
    VirtualGiftItem(
      id: 'gift-supercar',
      name: 'Supercar',
      coinCost: 999,
      diamondPayout: 500,
      icon: Icons.directions_car_filled_rounded,
      accentColor: Color(0xFF8B5CF6),
      description: 'High-octane luxury convoy',
    ),
    VirtualGiftItem(
      id: 'gift-galaxy',
      name: 'Galaxy',
      coinCost: 1999,
      diamondPayout: 1000,
      icon: Icons.public_rounded,
      accentColor: Color(0xFF3B82F6),
      description: 'Cosmic particle burst animation',
    ),
    VirtualGiftItem(
      id: 'gift-falcon',
      name: 'Falcon',
      coinCost: 4999,
      diamondPayout: 2500,
      icon: Icons.air_rounded,
      accentColor: Color(0xFF06B6D4),
      description: 'Majestic high-altitude salute',
    ),
    VirtualGiftItem(
      id: 'gift-sovereign-throne',
      name: 'Sovereign Throne',
      coinCost: 9999,
      diamondPayout: 5000,
      icon: Icons.workspace_premium_rounded,
      accentColor: QuantColors.moltenOrange,
      description: 'Ultimate sovereign emperor accolade',
    ),
  ];

  @override
  void initState() {
    super.initState();
    _selectedGift = giftsCatalog[0];
  }

  void _handleSendGift() {
    if (_selectedGift == null) return;

    final totalCost = _selectedGift!.coinCost * _selectedMultiplier;
    if (_userCoinBalance < totalCost) {
      _showRechargeModal(context);
      return;
    }

    setState(() {
      _userCoinBalance -= totalCost;
      _isSending = true;
    });

    if (widget.onGiftSent != null) {
      widget.onGiftSent!(_selectedGift!, _selectedMultiplier);
    }

    Future.delayed(const Duration(milliseconds: 600), () {
      if (mounted) {
        setState(() => _isSending = false);
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: QuantColors.elevatedCard,
            content: Row(
              children: [
                Icon(_selectedGift!.icon, color: _selectedGift!.accentColor, size: 22),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Sent ${_selectedGift!.name} (${_selectedMultiplier}x) to @${widget.creatorHandle}!',
                    style: QuantTypography.bodyMedium.copyWith(color: QuantColors.textPrimary),
                  ),
                ),
              ],
            ),
          ),
        );
      }
    });
  }

  void _showRechargeModal(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return Container(
          padding: const EdgeInsets.all(20),
          decoration: const BoxDecoration(
            color: QuantColors.darkSlateCard,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            border: Border(top: BorderSide(color: QuantColors.hairlineBorder, width: 1.2)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Recharge Sovereign Coins',
                    style: QuantTypography.titleMedium.copyWith(
                      color: QuantColors.textPrimary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close_rounded, color: QuantColors.textSecondary),
                    onPressed: () => Navigator.of(ctx).pop(),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                'Top up your sovereign wallet to support creators with virtual gifts and diamond payouts.',
                style: QuantTypography.bodySmall.copyWith(color: QuantColors.textMuted),
              ),
              const SizedBox(height: 16),
              _buildCoinPackRow(ctx, coins: 500, price: '\$4.99'),
              const SizedBox(height: 8),
              _buildCoinPackRow(ctx, coins: 1500, price: '\$14.99', isPopular: true),
              const SizedBox(height: 8),
              _buildCoinPackRow(ctx, coins: 5000, price: '\$49.99'),
            ],
          ),
        );
      },
    );
  }

  Widget _buildCoinPackRow(BuildContext ctx, {required int coins, required String price, bool isPopular = false}) {
    return GestureDetector(
      onTap: () {
        setState(() {
          _userCoinBalance += coins;
        });
        Navigator.of(ctx).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: QuantColors.elevatedCard,
            content: Row(
              children: [
                const Icon(Icons.monetization_on_rounded, color: QuantColors.sunsetGold, size: 20),
                const SizedBox(width: 8),
                Text('Added $coins Sovereign Coins to balance', style: QuantTypography.bodyMedium),
              ],
            ),
          ),
        );
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: isPopular ? QuantColors.activeBorder.withOpacity(0.5) : QuantColors.elevatedCard,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isPopular ? QuantColors.sunsetGold : QuantColors.hairlineBorder,
            width: isPopular ? 1.5 : 1.0,
          ),
        ),
        child: Row(
          children: [
            const Icon(Icons.monetization_on_rounded, color: QuantColors.sunsetGold, size: 24),
            const SizedBox(width: 12),
            Text(
              '$coins Coins',
              style: QuantTypography.titleMedium.copyWith(
                color: QuantColors.textPrimary,
                fontSize: 15,
                fontWeight: FontWeight.w700,
              ),
            ),
            if (isPopular) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: QuantColors.sunsetGold.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  'BEST VALUE',
                  style: QuantTypography.bodySmall.copyWith(
                    color: QuantColors.sunsetGold,
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
            const Spacer(),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                color: QuantColors.sunriseRose,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                price,
                style: QuantTypography.bodyMedium.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final selectedGift = _selectedGift;
    final totalCost = selectedGift != null ? selectedGift.coinCost * _selectedMultiplier : 0;
    final totalPayout = selectedGift != null ? selectedGift.diamondPayout * _selectedMultiplier : 0;
    final hasEnoughCoins = _userCoinBalance >= totalCost;

    return Container(
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        border: Border(
          top: BorderSide(color: QuantColors.hairlineBorder, width: 1.2),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Top Drag Handle
            Center(
              child: Container(
                margin: const EdgeInsets.only(top: 10, bottom: 8),
                width: 38,
                height: 4,
                decoration: BoxDecoration(
                  color: QuantColors.hairlineBorder,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),

            // Header: Recipient & Coin Balance Pill
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              child: Row(
                children: [
                  // Creator Avatar & Handle
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: QuantColors.sunriseRose, width: 1.5),
                      image: DecorationImage(
                        image: NetworkImage(widget.creatorAvatarUrl),
                        fit: BoxFit.cover,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            'Send to @${widget.creatorHandle}',
                            style: QuantTypography.titleMedium.copyWith(
                              color: QuantColors.textPrimary,
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(width: 4),
                          const Icon(Icons.verified_rounded, color: QuantColors.sovereignCyan, size: 12),
                        ],
                      ),
                      Text(
                        'Diamond Settlement Active',
                        style: QuantTypography.bodySmall.copyWith(
                          color: QuantColors.textMuted,
                          fontSize: 10,
                        ),
                      ),
                    ],
                  ),

                  const Spacer(),

                  // Coin Balance Pill & Recharge Button
                  GestureDetector(
                    onTap: () => _showRechargeModal(context),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: QuantColors.voidObsidian,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: QuantColors.hairlineBorder),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.monetization_on_rounded,
                            color: QuantColors.sunsetGold,
                            size: 16,
                          ),
                          const SizedBox(width: 5),
                          Text(
                            '$_userCoinBalance',
                            style: QuantTypography.bodySmall.copyWith(
                              color: QuantColors.textPrimary,
                              fontWeight: FontWeight.w700,
                              fontSize: 12,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.all(2),
                            decoration: const BoxDecoration(
                              shape: BoxShape.circle,
                              color: QuantColors.sunriseRose,
                            ),
                            child: const Icon(Icons.add_rounded, color: Colors.white, size: 10),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),

            const Divider(color: QuantColors.hairlineBorder, height: 1),

            // 8 Virtual Gifts 4x2 Grid
            Padding(
              padding: const EdgeInsets.all(14),
              child: GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: giftsCatalog.length,
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 4,
                  mainAxisSpacing: 10,
                  crossAxisSpacing: 10,
                  childAspectRatio: 0.82,
                ),
                itemBuilder: (context, index) {
                  final gift = giftsCatalog[index];
                  final isSelected = _selectedGift?.id == gift.id;

                  return GestureDetector(
                    onTap: () {
                      setState(() {
                        _selectedGift = gift;
                      });
                    },
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 160),
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: isSelected
                            ? QuantColors.elevatedCard
                            : QuantColors.voidObsidian,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: isSelected
                              ? gift.accentColor
                              : QuantColors.hairlineBorder,
                          width: isSelected ? 2.0 : 1.0,
                        ),
                        boxShadow: isSelected
                            ? [
                                BoxShadow(
                                  color: gift.accentColor.withOpacity(0.3),
                                  blurRadius: 10,
                                  offset: const Offset(0, 2),
                                ),
                              ]
                            : null,
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            gift.icon,
                            color: gift.accentColor,
                            size: 28,
                          ),
                          const SizedBox(height: 6),
                          Text(
                            gift.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: QuantTypography.bodySmall.copyWith(
                              color: isSelected
                                  ? QuantColors.textPrimary
                                  : QuantColors.textSecondary,
                              fontWeight: isSelected
                                  ? FontWeight.w700
                                  : FontWeight.w500,
                              fontSize: 11,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(
                                Icons.monetization_on_rounded,
                                color: QuantColors.sunsetGold,
                                size: 11,
                              ),
                              const SizedBox(width: 2),
                              Text(
                                '${gift.coinCost}',
                                style: QuantTypography.bodySmall.copyWith(
                                  color: QuantColors.sunsetGold,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),

            // Payout Summary & Combo Multipliers
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Row(
                children: [
                  // Diamond Payout Pill
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: QuantColors.voidObsidian,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: QuantColors.hairlineBorder),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.diamond_outlined,
                          color: QuantColors.sovereignCyan,
                          size: 14,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          'Creator receives: $totalPayout Diamonds',
                          style: QuantTypography.bodySmall.copyWith(
                            color: QuantColors.sovereignCyan,
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),

                  const Spacer(),

                  // Multiplier Selection (1x, 5x, 10x, 99x)
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [1, 5, 10, 99].map((multiplier) {
                      final isSelected = _selectedMultiplier == multiplier;
                      return GestureDetector(
                        onTap: () => setState(() => _selectedMultiplier = multiplier),
                        child: Container(
                          margin: const EdgeInsets.only(left: 4),
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: isSelected
                                ? QuantColors.sunriseRose
                                : QuantColors.voidObsidian,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: isSelected
                                  ? QuantColors.sunriseRose
                                  : QuantColors.hairlineBorder,
                            ),
                          ),
                          child: Text(
                            '${multiplier}x',
                            style: QuantTypography.bodySmall.copyWith(
                              color: isSelected ? Colors.white : QuantColors.textMuted,
                              fontWeight: FontWeight.w700,
                              fontSize: 11,
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 12),

            // Action Send Gift Button
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: GestureDetector(
                onTap: _isSending ? null : _handleSendGift,
                child: Container(
                  height: 48,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    gradient: LinearGradient(
                      colors: hasEnoughCoins
                          ? [QuantColors.sunriseRose, QuantColors.moltenAmber]
                          : [QuantColors.darkSlateCard, QuantColors.elevatedCard],
                    ),
                    boxShadow: hasEnoughCoins
                        ? [
                            BoxShadow(
                              color: QuantColors.sunriseRose.withOpacity(0.35),
                              blurRadius: 12,
                              offset: const Offset(0, 3),
                            ),
                          ]
                        : null,
                  ),
                  alignment: Alignment.center,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        hasEnoughCoins ? Icons.card_giftcard_rounded : Icons.add_card_rounded,
                        color: Colors.white,
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        hasEnoughCoins
                            ? 'Send ${selectedGift?.name ?? "Gift"} ($totalCost Coins)'
                            : 'Insufficient Coins · Recharge Now',
                        style: QuantTypography.titleMedium.copyWith(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}
