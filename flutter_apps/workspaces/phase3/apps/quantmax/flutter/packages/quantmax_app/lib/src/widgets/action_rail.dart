// ============================================================================
// quantmax_app - ActionRail: right-side engagement rail over video (Shift 2)
// ============================================================================
//
// Video ke right edge par vertical rail: like / comment / share / credits-tip
// (Bolt — Bet 2 hook). Sab buttons white icons + dark scrim circle par hain;
// counts [QuantMaxTextStyles.videoCount] me render hote hain.
//
// Count formatting yahin hota hai ([formatCount] — 1.2K style, `intl`
// package nahi laaya gaya). Engagement mutations widget-local hain; real
// endpoints `app-foundations/quantmax` spec ke baad wire honge
// (TODO(UNVERIFIED) marks VideoCard me, callbacks ke owners par).

import 'package:flutter/material.dart';
import 'package:quantmax_core/quantmax_core.dart';

/// Right-side vertical engagement rail over the video.
class ActionRail extends StatelessWidget {
  const ActionRail({
    super.key,
    required this.likeCount,
    required this.commentCount,
    required this.shareCount,
    required this.isLiked,
    required this.onLikeTap,
    required this.onCommentTap,
    required this.onShareTap,
    required this.onCreditsTap,
  });

  final int likeCount;
  final int commentCount;
  final int shareCount;
  final bool isLiked;
  final VoidCallback onLikeTap;
  final VoidCallback onCommentTap;
  final VoidCallback onShareTap;
  final VoidCallback onCreditsTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        _RailButton(
          icon: isLiked ? Icons.favorite : Icons.favorite_border,
          iconColor: isLiked
              ? QuantMaxColors.likeHeart
              : QuantMaxColors.onVideoIcon,
          label: formatCount(likeCount),
          semanticLabel: isLiked ? 'Unlike video' : 'Like video',
          onTap: onLikeTap,
        ),
        const SizedBox(height: 16),
        _RailButton(
          icon: Icons.mode_comment_outlined,
          iconColor: QuantMaxColors.onVideoIcon,
          label: formatCount(commentCount),
          semanticLabel: 'Comments',
          onTap: onCommentTap,
        ),
        const SizedBox(height: 16),
        _RailButton(
          icon: Icons.send_outlined,
          iconColor: QuantMaxColors.onVideoIcon,
          label: formatCount(shareCount),
          semanticLabel: 'Share video',
          onTap: onShareTap,
        ),
        const SizedBox(height: 16),
        // Credits tipping — Bet 2 (programmable attention economy) hook.
        // onTap → TODO(UNVERIFIED) credits tipping spec ke baad.
        _RailButton(
          icon: Icons.bolt,
          iconColor: QuantMaxColors.onVideoIcon,
          label: 'Tip',
          semanticLabel: 'Tip credits',
          onTap: onCreditsTap,
        ),
      ],
    );
  }
}

/// Ek rail button: scrim circle par icon + neeche count label.
class _RailButton extends StatelessWidget {
  const _RailButton({
    required this.icon,
    required this.iconColor,
    required this.label,
    required this.semanticLabel,
    required this.onTap,
  });

  final IconData icon;
  final Color iconColor;
  final String label;
  final String semanticLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        GestureDetector(
          onTap: onTap,
          behavior: HitTestBehavior.opaque,
          child: Semantics(
            button: true,
            label: semanticLabel,
            child: Container(
              width: 44,
              height: 44,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                // Neutral scrim (framework black at 54%) — brand color nahi.
                color: Colors.black54,
              ),
              child: Icon(icon, color: iconColor, size: 26),
            ),
          ),
        ),
        const SizedBox(height: 4),
        Text(label, style: QuantMaxTextStyles.videoCount),
      ],
    );
  }
}

/// Formats counts TikTok-style: 950 → "950", 1200 → "1.2K", 2_500_000 → "2.5M".
///
/// `intl` package nahi laaya gaya — ye chhota formatter hi kaafi hai.
String formatCount(int count) {
  if (count < 1000) return count.toString();
  if (count < 1000000) return '${_trimOneDecimal(count / 1000)}K';
  return '${_trimOneDecimal(count / 1000000)}M';
}

String _trimOneDecimal(double value) {
  final String fixed = value.toStringAsFixed(1);
  return fixed.endsWith('.0')
      ? fixed.substring(0, fixed.length - 2)
      : fixed;
}
