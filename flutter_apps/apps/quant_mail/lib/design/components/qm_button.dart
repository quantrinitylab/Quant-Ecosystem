import 'package:flutter/material.dart';

import '../quant_mail_tokens.dart';

enum QmButtonVariant { primary, secondary, ghost, destructive }

/// 48 dp button. Loading keeps the width and swaps the label for a spinner.
class QmButton extends StatelessWidget {
  const QmButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = QmButtonVariant.primary,
    this.icon,
    this.loading = false,
    this.expand = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final QmButtonVariant variant;
  final IconData? icon;
  final bool loading;
  final bool expand;

  bool get _enabled => onPressed != null && !loading;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    final bool primary = variant == QmButtonVariant.primary;
    final Color foreground = switch (variant) {
      QmButtonVariant.primary => t.onAccent,
      QmButtonVariant.secondary => t.textPrimary,
      QmButtonVariant.ghost => t.accentText,
      QmButtonVariant.destructive => t.danger,
    };
    final Color? fill = switch (variant) {
      QmButtonVariant.primary => null,
      QmButtonVariant.secondary => t.panel,
      QmButtonVariant.ghost => null,
      QmButtonVariant.destructive => t.panel,
    };
    final BorderSide? border = switch (variant) {
      QmButtonVariant.secondary => BorderSide(color: t.hairline),
      QmButtonVariant.destructive => BorderSide(color: t.danger.withValues(alpha: 0.5)),
      _ => null,
    };
    final BorderRadius radius = BorderRadius.circular(QmRadius.button);
    final TextStyle textStyle = t.body.copyWith(
      color: foreground,
      fontWeight: FontWeight.w600,
    );

    final Widget content = Stack(
      alignment: Alignment.center,
      children: <Widget>[
        Opacity(
          opacity: loading ? 0 : 1,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              if (icon != null) ...<Widget>[
                Icon(icon, size: 20, color: foreground),
                const SizedBox(width: QmSpace.sm),
              ],
              Flexible(child: Text(label, style: textStyle, textAlign: TextAlign.center)),
            ],
          ),
        ),
        if (loading)
          SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2.4, color: foreground),
          ),
      ],
    );

    final Widget button = Opacity(
      opacity: onPressed == null ? 0.4 : 1,
      child: Material(
        color: Colors.transparent,
        child: Ink(
          decoration: BoxDecoration(
            gradient: primary ? t.accentGradient : null,
            color: fill,
            borderRadius: radius,
            border: border == null ? null : Border.fromBorderSide(border),
          ),
          child: InkWell(
            borderRadius: radius,
            onTap: _enabled ? onPressed : null,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: QmSpace.minTarget, minWidth: QmSpace.minTarget),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: QmSpace.xl, vertical: QmSpace.sm),
                child: Center(widthFactor: expand ? null : 1, child: content),
              ),
            ),
          ),
        ),
      ),
    );

    return Semantics(
      button: true,
      enabled: onPressed != null,
      label: label,
      child: ExcludeSemantics(child: expand ? SizedBox(width: double.infinity, child: button) : button),
    );
  }
}
