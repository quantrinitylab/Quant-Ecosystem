import 'package:flutter/material.dart';

import '../quant_mail_tokens.dart';

/// Full-height swipe background: solid colour, icon and a word, so the action
/// is never conveyed by colour alone. Use it as a Dismissible background.
class QmSwipePanel extends StatelessWidget {
  const QmSwipePanel({
    super.key,
    required this.label,
    required this.icon,
    required this.color,
    this.alignment = Alignment.centerLeft,
    this.foreground,
  });

  final String label;
  final IconData icon;
  final Color color;
  final AlignmentGeometry alignment;
  final Color? foreground;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    final Color fg = foreground ?? t.onAccent;
    return ExcludeSemantics(
      child: Container(
        color: color,
        alignment: alignment,
        padding: const EdgeInsets.symmetric(horizontal: QmSpace.xxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(icon, color: fg, size: 24),
            const SizedBox(height: 2),
            Text(label, style: t.caption.copyWith(color: fg, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
