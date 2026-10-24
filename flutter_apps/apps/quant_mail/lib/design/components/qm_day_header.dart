import 'package:flutter/material.dart';

import '../quant_mail_tokens.dart';

/// Day group header ("Today", "Yesterday", weekday, "Month year"). Make it
/// sticky with a pinned SliverPersistentHeader in the list.
class QmDayHeader extends StatelessWidget {
  const QmDayHeader({super.key, required this.label});

  static const double height = 32;

  final String label;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    return Semantics(
      header: true,
      label: label,
      child: ExcludeSemantics(
        child: Container(
          height: height,
          alignment: Alignment.centerLeft,
          padding: const EdgeInsets.symmetric(horizontal: QmSpace.gutter + 4),
          color: t.canvas,
          child: Text(label, style: t.caption.copyWith(color: t.textMuted, fontWeight: FontWeight.w600)),
        ),
      ),
    );
  }
}
