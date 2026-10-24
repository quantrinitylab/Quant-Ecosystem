import 'package:flutter/material.dart';

import '../quant_mail_tokens.dart';

/// Static pill chip, for example a mail label. [dotColor] draws a colour dot
/// before the text; the text always carries the meaning.
class QmChip extends StatelessWidget {
  const QmChip({super.key, required this.label, this.dotColor, this.onTap, this.dense = false});

  final String label;
  final Color? dotColor;
  final VoidCallback? onTap;

  /// Dense chips (in mail rows) are not tappable targets on their own.
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    final Widget body = Container(
      padding: EdgeInsets.symmetric(horizontal: dense ? 8 : 12, vertical: dense ? 1 : 6),
      decoration: BoxDecoration(
        color: t.panelRaised,
        borderRadius: BorderRadius.circular(QmRadius.chip),
        border: Border.all(color: t.hairline),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          if (dotColor != null) ...<Widget>[
            Container(width: 8, height: 8, decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle)),
            const SizedBox(width: 6),
          ],
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: (dense ? t.caption : t.label).copyWith(color: t.textSecondary),
            ),
          ),
        ],
      ),
    );
    if (onTap == null) return body;
    return Semantics(
      button: true,
      label: label,
      child: InkWell(
        borderRadius: BorderRadius.circular(QmRadius.chip),
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: QmSpace.minTarget),
          child: Center(widthFactor: 1, child: ExcludeSemantics(child: body)),
        ),
      ),
    );
  }
}

/// Single-select filter chip. Selected = accent outline + check mark, so
/// colour is never the only cue.
class QmFilterChip extends StatelessWidget {
  const QmFilterChip({super.key, required this.label, required this.selected, required this.onSelected});

  final String label;
  final bool selected;
  final ValueChanged<bool> onSelected;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: InkWell(
        borderRadius: BorderRadius.circular(QmRadius.chip),
        onTap: () => onSelected(!selected),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: QmSpace.minTarget),
          child: Center(
            widthFactor: 1,
            child: ExcludeSemantics(
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: selected ? t.accent.withValues(alpha: 0.12) : t.panel,
                  borderRadius: BorderRadius.circular(QmRadius.chip),
                  border: Border.all(color: selected ? t.accent : t.hairline, width: selected ? 1.5 : 1),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    if (selected) ...<Widget>[
                      Icon(Icons.check_rounded, size: 16, color: t.accentText),
                      const SizedBox(width: 6),
                    ],
                    Text(label, style: t.label.copyWith(color: selected ? t.accentText : t.textSecondary)),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
