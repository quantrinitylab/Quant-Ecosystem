import 'package:flutter/material.dart';

import '../quant_mail_tokens.dart';
import 'qm_button.dart';

enum QmIllustrationKind { empty, error }

/// Original single-stroke line art (hairline-toned outline plus one accent
/// detail). Two sizes in use: 160 and 96 dp.
class QmIllustration extends StatelessWidget {
  const QmIllustration({super.key, required this.kind, this.size = 160});

  final QmIllustrationKind kind;
  final double size;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    return ExcludeSemantics(
      child: SizedBox(
        width: size,
        height: size,
        child: CustomPaint(painter: _IllustrationPainter(kind, t.textMuted, t.accent)),
      ),
    );
  }
}

class _IllustrationPainter extends CustomPainter {
  _IllustrationPainter(this.kind, this.line, this.accent);

  final QmIllustrationKind kind;
  final Color line;
  final Color accent;

  @override
  void paint(Canvas canvas, Size size) {
    final double s = size.width;
    final Paint stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = s / 56
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..color = line;
    final Paint accentStroke = Paint.from(stroke)..color = accent;

    // An envelope: body and flap.
    final RRect body = RRect.fromRectAndRadius(
      Rect.fromLTWH(s * 0.16, s * 0.28, s * 0.68, s * 0.46),
      Radius.circular(s * 0.07),
    );
    canvas.drawRRect(body, stroke);
    final Path flap = Path()
      ..moveTo(s * 0.18, s * 0.32)
      ..lineTo(s * 0.5, s * 0.55)
      ..lineTo(s * 0.82, s * 0.32);
    canvas.drawPath(flap, stroke);

    switch (kind) {
      case QmIllustrationKind.empty:
        // A small check above the envelope.
        final Path check = Path()
          ..moveTo(s * 0.42, s * 0.16)
          ..lineTo(s * 0.48, s * 0.21)
          ..lineTo(s * 0.59, s * 0.1);
        canvas.drawPath(check, accentStroke);
      case QmIllustrationKind.error:
        // A broken edge and an exclamation mark.
        canvas.drawLine(Offset(s * 0.6, s * 0.74), Offset(s * 0.66, s * 0.84), accentStroke);
        canvas.drawLine(Offset(s * 0.5, s * 0.1), Offset(s * 0.5, s * 0.19), accentStroke);
        canvas.drawCircle(Offset(s * 0.5, s * 0.235), s / 90, Paint()..color = accent);
    }
  }

  @override
  bool shouldRepaint(_IllustrationPainter old) =>
      old.kind != kind || old.line != line || old.accent != accent;
}

class _StateBody extends StatelessWidget {
  const _StateBody({
    required this.kind,
    required this.title,
    this.message,
    this.actionLabel,
    this.onAction,
    this.compact = false,
  });

  final QmIllustrationKind kind;
  final String title;
  final String? message;
  final String? actionLabel;
  final VoidCallback? onAction;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(QmSpace.xxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            QmIllustration(kind: kind, size: compact ? 96 : 160),
            const SizedBox(height: QmSpace.lg),
            Semantics(
              header: true,
              liveRegion: true,
              child: Text(title, textAlign: TextAlign.center, style: t.title),
            ),
            if (message != null && message!.isNotEmpty) ...<Widget>[
              const SizedBox(height: QmSpace.sm),
              Text(message!, textAlign: TextAlign.center, style: t.body.copyWith(color: t.textSecondary)),
            ],
            if (actionLabel != null && onAction != null) ...<Widget>[
              const SizedBox(height: QmSpace.xl),
              QmButton(label: actionLabel!, onPressed: onAction, variant: QmButtonVariant.secondary),
            ],
          ],
        ),
      ),
    );
  }
}

/// "Nothing here" state. Show it only after a successful fetch returned zero
/// items; never while loading, on error or before the first fetch finished.
class QmEmptyState extends StatelessWidget {
  const QmEmptyState({
    super.key,
    required this.title,
    this.message,
    this.actionLabel,
    this.onAction,
    this.compact = false,
  });

  final String title;
  final String? message;
  final String? actionLabel;
  final VoidCallback? onAction;
  final bool compact;

  @override
  Widget build(BuildContext context) => _StateBody(
        kind: QmIllustrationKind.empty,
        title: title,
        message: message,
        actionLabel: actionLabel,
        onAction: onAction,
        compact: compact,
      );
}

/// Failure state with a Retry action.
class QmErrorState extends StatelessWidget {
  const QmErrorState({
    super.key,
    required this.title,
    this.message,
    this.onRetry,
    this.retryLabel = 'Retry',
    this.compact = false,
  });

  final String title;
  final String? message;
  final VoidCallback? onRetry;
  final String retryLabel;
  final bool compact;

  @override
  Widget build(BuildContext context) => _StateBody(
        kind: QmIllustrationKind.error,
        title: title,
        message: message,
        actionLabel: onRetry == null ? null : retryLabel,
        onAction: onRetry,
        compact: compact,
      );
}
