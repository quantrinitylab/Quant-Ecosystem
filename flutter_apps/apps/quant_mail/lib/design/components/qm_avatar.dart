import 'package:flutter/material.dart';

import '../qm_format.dart';
import '../quant_mail_tokens.dart';

/// Initials avatar on a deterministic tint (never a brand logo or photo).
class QmAvatar extends StatelessWidget {
  const QmAvatar({
    super.key,
    required this.name,
    this.email = '',
    this.size = 40,
    this.selected = false,
    this.onTap,
  });

  /// Sizes from the spec: 24, 32, 40, 56.
  final String name;
  final String email;
  final double size;
  final bool selected;
  final VoidCallback? onTap;

  /// Stable palette index for [seed] (the same sender always gets one colour).
  static int tintIndex(String seed, int paletteLength) {
    int h = 17;
    for (final int c in seed.toLowerCase().codeUnits) {
      h = (h * 31 + c) & 0x7fffffff;
    }
    return h % paletteLength;
  }

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    final String seed = email.isNotEmpty ? email : name;
    final QmAvatarTint tint = t.avatarTints[tintIndex(seed, t.avatarTints.length)];
    final Widget face = AnimatedSwitcher(
      duration: const Duration(milliseconds: 120),
      child: selected
          ? Container(
              key: const ValueKey<String>('selected'),
              width: size,
              height: size,
              decoration: BoxDecoration(color: t.accent, shape: BoxShape.circle),
              child: Icon(Icons.check_rounded, size: size * 0.55, color: t.onAccent),
            )
          : Container(
              key: const ValueKey<String>('initials'),
              width: size,
              height: size,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: tint.background, shape: BoxShape.circle),
              child: Text(
                qmInitials(name, email),
                style: TextStyle(
                  fontFamily: QuantMailTokens.fontFamily,
                  fontSize: size * 0.38,
                  fontWeight: FontWeight.w600,
                  color: tint.foreground,
                ),
              ),
            ),
    );
    if (onTap == null) return ExcludeSemantics(child: face);
    return Semantics(
      button: true,
      label: selected ? 'Selected, $name' : 'Select $name',
      child: InkResponse(
        onTap: onTap,
        radius: QmSpace.minTarget / 2,
        child: SizedBox(
          width: size < QmSpace.minTarget ? QmSpace.minTarget : size,
          height: size < QmSpace.minTarget ? QmSpace.minTarget : size,
          child: Center(child: ExcludeSemantics(child: face)),
        ),
      ),
    );
  }
}
