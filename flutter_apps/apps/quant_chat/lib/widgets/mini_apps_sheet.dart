// Sovereign Quant Ecosystem - QuantChat Mini Apps Sheet (Phase 2B)
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';

/// Mini-app entry opened from the composer games action (Flow-4).
/// Phase 2B ships two working mini-apps backed by the real backend — no
/// dead buttons, every row carries a text label:
///
/// - Quick Poll → POST /polls; the poll renders as an inline card in the
///   thread with live voting.
/// - Dice Roll → sends the roll through the normal message send path
///   (honest `notSent` when no transport is configured, like any message).
///
/// Full game play (voice/video call screens are Phase 3+; game engines
/// later) stays out of scope — these are entry points with real behavior.
class MiniAppsSheet extends StatelessWidget {
  final VoidCallback onQuickPoll;
  final VoidCallback onDiceRoll;

  const MiniAppsSheet({
    super.key,
    required this.onQuickPoll,
    required this.onDiceRoll,
  });

  static Future<void> show(
    BuildContext context, {
    required VoidCallback onQuickPoll,
    required VoidCallback onDiceRoll,
  }) {
    return showModalBottomSheet(
      context: context,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => MiniAppsSheet(
        onQuickPoll: onQuickPoll,
        onDiceRoll: onDiceRoll,
      ),
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
                Icon(Icons.videogame_asset_outlined,
                    color: QuantColors.textSecondary, size: 20),
                SizedBox(width: 8),
                Text(
                  'Mini apps',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          _MiniAppRow(
            icon: Icons.poll_rounded,
            tint: QuantColors.sovereignCyan,
            title: 'Quick Poll',
            subtitle: 'Ask the thread a question — votes are counted live',
            onTap: () {
              Navigator.of(context).pop();
              onQuickPoll();
            },
          ),
          _MiniAppRow(
            icon: Icons.casino_rounded,
            tint: QuantColors.moltenOrange,
            title: 'Dice Roll',
            subtitle: 'Roll a six-sided die straight into the chat',
            onTap: () {
              Navigator.of(context).pop();
              onDiceRoll();
            },
          ),
          const SizedBox(height: 12),
        ],
      ),
    );
  }
}

class _MiniAppRow extends StatelessWidget {
  final IconData icon;
  final Color tint;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _MiniAppRow({
    required this.icon,
    required this.tint,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: tint.withOpacity(0.14),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: tint.withOpacity(0.45), width: 1),
              ),
              child: Icon(icon, color: tint, size: 22),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      color: QuantColors.textMuted,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(
              Icons.arrow_forward_ios_rounded,
              size: 14,
              color: QuantColors.textMuted,
            ),
          ],
        ),
      ),
    );
  }
}
