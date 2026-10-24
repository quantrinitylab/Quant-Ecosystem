import 'package:flutter/material.dart';

import '../quant_mail_tokens.dart';
import 'qm_button.dart';

/// Shows a toast above the bar with one optional action. Toasts with an
/// action stay 6 s, plain ones 4 s. The text is a live region.
ScaffoldFeatureController<SnackBar, SnackBarClosedReason> showQmToast(
  BuildContext context,
  String message, {
  String? actionLabel,
  VoidCallback? onAction,
  Duration? duration,
  double bottomInset = 0,
}) {
  final QuantMailTokens t = QuantMailTokens.of(context);
  final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
  messenger.clearSnackBars();
  final bool hasAction = actionLabel != null && onAction != null;
  return messenger.showSnackBar(
    SnackBar(
      behavior: SnackBarBehavior.floating,
      backgroundColor: t.panelRaised,
      elevation: 0,
      margin: EdgeInsets.fromLTRB(QmSpace.lg, 0, QmSpace.lg, QmSpace.lg + bottomInset),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(QmRadius.field),
        side: BorderSide(color: t.hairline),
      ),
      duration: duration ?? Duration(seconds: hasAction ? 6 : 4),
      content: Semantics(
        liveRegion: true,
        child: Text(message, style: t.body),
      ),
      action: hasAction
          ? SnackBarAction(label: actionLabel, textColor: t.accentText, onPressed: onAction)
          : null,
    ),
  );
}

enum QmBannerKind { info, offline, error, debug }

/// Strip at the top of a list: offline, couldn't refresh, debug notice.
/// Colour is always paired with an icon and words.
class QmBanner extends StatelessWidget {
  const QmBanner({
    super.key,
    required this.kind,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final QmBannerKind kind;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    final (Color color, IconData icon) = switch (kind) {
      QmBannerKind.info => (t.info, Icons.info_outline_rounded),
      QmBannerKind.offline => (t.warning, Icons.cloud_off_rounded),
      QmBannerKind.error => (t.danger, Icons.error_outline_rounded),
      QmBannerKind.debug => (t.warning, Icons.bug_report_outlined),
    };
    return Semantics(
      container: true,
      liveRegion: true,
      label: message,
      child: ExcludeSemantics(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: QmSpace.lg, vertical: QmSpace.sm),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            border: Border(bottom: BorderSide(color: color.withValues(alpha: 0.4))),
          ),
          child: Row(
            children: <Widget>[
              Icon(icon, size: 18, color: color),
              const SizedBox(width: QmSpace.sm),
              Expanded(child: Text(message, style: t.caption.copyWith(color: t.textPrimary))),
              if (actionLabel != null && onAction != null)
                Semantics(
                  button: true,
                  label: actionLabel,
                  child: TextButton(
                    onPressed: onAction,
                    style: TextButton.styleFrom(
                      minimumSize: const Size(QmSpace.minTarget, QmSpace.minTarget),
                      foregroundColor: t.accentText,
                    ),
                    child: Text(actionLabel!, style: t.label.copyWith(color: t.accentText)),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Always-visible notice that the list shows debug sample data.
class QmSampleDataBanner extends StatelessWidget {
  const QmSampleDataBanner({super.key});

  static const String text = 'Sample data (debug)';

  @override
  Widget build(BuildContext context) => const QmBanner(kind: QmBannerKind.debug, message: text);
}

/// Modal bottom sheet with a drag handle, 24 dp top corners, max height 90 percent.
Future<T?> showQmSheet<T>(
  BuildContext context, {
  required WidgetBuilder builder,
  String? title,
}) {
  final QuantMailTokens t = QuantMailTokens.of(context);
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: t.panel,
    barrierColor: t.scrim,
    showDragHandle: false,
    constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.9),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(QmRadius.sheetTop)),
    ),
    builder: (BuildContext ctx) {
      return SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            const SizedBox(height: QmSpace.sm),
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(color: t.hairline.withValues(alpha: 0.25), borderRadius: BorderRadius.circular(2)),
              ),
            ),
            if (title != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(QmSpace.xl, QmSpace.lg, QmSpace.xl, QmSpace.sm),
                child: Semantics(header: true, child: Text(title, style: t.title)),
              ),
            Flexible(child: builder(ctx)),
          ],
        ),
      );
    },
  );
}

/// Confirmation that names its consequence. Returns true when confirmed.
Future<bool> showQmConfirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
  String cancelLabel = 'Cancel',
  bool destructive = false,
}) async {
  final QuantMailTokens t = QuantMailTokens.of(context);
  final bool? result = await showDialog<bool>(
    context: context,
    barrierColor: t.scrim,
    builder: (BuildContext ctx) {
      return Dialog(
        backgroundColor: t.panel,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(QmRadius.card),
          side: BorderSide(color: t.hairline),
        ),
        child: Padding(
          padding: const EdgeInsets.all(QmSpace.xl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Semantics(header: true, child: Text(title, style: t.title)),
              const SizedBox(height: QmSpace.sm),
              Text(message, style: t.body.copyWith(color: t.textSecondary)),
              const SizedBox(height: QmSpace.xl),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: <Widget>[
                  QmButton(
                    label: cancelLabel,
                    variant: QmButtonVariant.ghost,
                    onPressed: () => Navigator.of(ctx).pop(false),
                  ),
                  const SizedBox(width: QmSpace.sm),
                  QmButton(
                    label: confirmLabel,
                    variant: destructive ? QmButtonVariant.destructive : QmButtonVariant.primary,
                    onPressed: () => Navigator.of(ctx).pop(true),
                  ),
                ],
              ),
            ],
          ),
        ),
      );
    },
  );
  return result ?? false;
}
