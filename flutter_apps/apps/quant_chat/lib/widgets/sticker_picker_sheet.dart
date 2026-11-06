// Sovereign Quant Ecosystem - QuantChat Sticker Picker (Phase 2B)
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';

/// A single built-in Quant sticker: original Quant artwork identity, no
/// third-party assets. The glyph is a Material vector icon (no image
/// assets ship in this build); the row contract from the thread spec is
/// thumbnail + sticker name + size, which is what the thread renders.
class QuantSticker {
  final String name;
  final String sizeLabel;
  final IconData icon;
  final Color tint;

  const QuantSticker({
    required this.name,
    required this.sizeLabel,
    required this.icon,
    required this.tint,
  });
}

/// Built-in Quant sticker catalog (Phase 2B). Original designs only.
const List<QuantSticker> kQuantStickerCatalog = [
  QuantSticker(
    name: 'Quant Bolt',
    sizeLabel: '24 KB',
    icon: Icons.bolt_rounded,
    tint: Color(0xFFFF8C42),
  ),
  QuantSticker(
    name: 'Orbit Smile',
    sizeLabel: '31 KB',
    icon: Icons.emoji_emotions_rounded,
    tint: Color(0xFF00E5FF),
  ),
  QuantSticker(
    name: 'Signal Wave',
    sizeLabel: '28 KB',
    icon: Icons.graphic_eq_rounded,
    tint: Color(0xFF10B981),
  ),
  QuantSticker(
    name: 'Comet Trail',
    sizeLabel: '35 KB',
    icon: Icons.rocket_launch_rounded,
    tint: Color(0xFF8B5CF6),
  ),
  QuantSticker(
    name: 'Pixel Heart',
    sizeLabel: '22 KB',
    icon: Icons.favorite_rounded,
    tint: Color(0xFFF43F5E),
  ),
  QuantSticker(
    name: 'Nova Star',
    sizeLabel: '26 KB',
    icon: Icons.auto_awesome_rounded,
    tint: Color(0xFFFBBF24),
  ),
  QuantSticker(
    name: 'Echo Ring',
    sizeLabel: '29 KB',
    icon: Icons.radar_rounded,
    tint: Color(0xFF38BDF8),
  ),
  QuantSticker(
    name: 'Drift Cloud',
    sizeLabel: '33 KB',
    icon: Icons.cloud_rounded,
    tint: Color(0xFF94A3B8),
  ),
];

/// Bottom-sheet sticker picker opened from the composer sticker action.
/// Every tool carries a text label (never icon-only). Selecting a sticker
/// calls [onStickerSelected] with the catalog entry; the thread inserts a
/// sticker message (thumbnail row with name + size).
class StickerPickerSheet extends StatelessWidget {
  final void Function(QuantSticker sticker) onStickerSelected;

  const StickerPickerSheet({super.key, required this.onStickerSelected});

  static Future<void> show(
    BuildContext context, {
    required void Function(QuantSticker sticker) onStickerSelected,
  }) {
    return showModalBottomSheet(
      context: context,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => StickerPickerSheet(onStickerSelected: onStickerSelected),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 8),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: QuantColors.hairlineBorder,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Row(
              children: [
                Icon(Icons.emoji_emotions_outlined,
                    color: QuantColors.textSecondary, size: 20),
                SizedBox(width: 8),
                Text(
                  'Stickers',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Spacer(),
                Text(
                  'Built-in set',
                  style: TextStyle(
                    color: QuantColors.textMuted,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          Flexible(
            child: GridView.builder(
              shrinkWrap: true,
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 4,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 0.78,
              ),
              itemCount: kQuantStickerCatalog.length,
              itemBuilder: (ctx, i) {
                final s = kQuantStickerCatalog[i];
                return InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () {
                    Navigator.of(ctx).pop();
                    onStickerSelected(s);
                  },
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          color: s.tint.withOpacity(0.14),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: s.tint.withOpacity(0.45),
                            width: 1,
                          ),
                        ),
                        child: Icon(s.icon, color: s.tint, size: 28),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        s.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: QuantColors.textPrimary,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        s.sizeLabel,
                        style: const TextStyle(
                          color: QuantColors.textMuted,
                          fontSize: 10,
                        ),
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
}
