import 'package:flutter/material.dart';

import '../qm_format.dart';
import '../quant_mail_tokens.dart';

/// Floating action capsule of the thread view. An action whose callback is
/// null is not drawn (a control without a working backend is hidden, never
/// faked). Reply shows a caret when [onReplyMenu] is set.
class QmActionCapsule extends StatelessWidget {
  const QmActionCapsule({
    super.key,
    this.onReply,
    this.onReplyMenu,
    this.onArchive,
    this.onDelete,
    this.onSnooze,
    this.onMore,
  });

  final VoidCallback? onReply;
  final VoidCallback? onReplyMenu;
  final VoidCallback? onArchive;
  final VoidCallback? onDelete;
  final VoidCallback? onSnooze;
  final VoidCallback? onMore;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    final List<Widget> items = <Widget>[
      if (onReply != null)
        _CapsulePrimary(onReply: onReply!, onMenu: onReplyMenu),
      if (onArchive != null) _CapsuleIcon(icon: Icons.archive_outlined, label: 'Archive', onTap: onArchive!),
      if (onDelete != null) _CapsuleIcon(icon: Icons.delete_outline_rounded, label: 'Delete', onTap: onDelete!),
      if (onSnooze != null) _CapsuleIcon(icon: Icons.snooze_rounded, label: 'Snooze', onTap: onSnooze!),
      if (onMore != null) _CapsuleIcon(icon: Icons.more_horiz_rounded, label: 'More', onTap: onMore!),
    ];
    if (items.isEmpty) return const SizedBox.shrink();
    return Material(
      color: t.panelRaised,
      shape: StadiumBorder(side: BorderSide(color: t.hairline)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: QmSpace.xs, vertical: QmSpace.xs),
        child: Row(mainAxisSize: MainAxisSize.min, children: items),
      ),
    );
  }
}

class _CapsulePrimary extends StatelessWidget {
  const _CapsulePrimary({required this.onReply, this.onMenu});

  final VoidCallback onReply;
  final VoidCallback? onMenu;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(gradient: t.accentGradient, borderRadius: BorderRadius.circular(QmRadius.chip)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Semantics(
            button: true,
            label: 'Reply',
            child: InkWell(
              borderRadius: BorderRadius.circular(QmRadius.chip),
              onTap: onReply,
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: QmSpace.minTarget, minWidth: QmSpace.minTarget),
                child: Padding(
                  padding: EdgeInsets.only(left: QmSpace.lg, right: onMenu == null ? QmSpace.lg : QmSpace.sm),
                  child: ExcludeSemantics(
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        Icon(Icons.reply_rounded, size: 20, color: t.onAccent),
                        const SizedBox(width: 6),
                        Text('Reply', style: t.body.copyWith(color: t.onAccent, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          if (onMenu != null)
            Semantics(
              button: true,
              label: 'More reply options',
              child: InkWell(
                borderRadius: BorderRadius.circular(QmRadius.chip),
                onTap: onMenu,
                child: SizedBox(
                  width: QmSpace.minTarget,
                  height: QmSpace.minTarget,
                  child: ExcludeSemantics(child: Icon(Icons.arrow_drop_down_rounded, color: t.onAccent)),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _CapsuleIcon extends StatelessWidget {
  const _CapsuleIcon({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    return IconButton(
      tooltip: label,
      onPressed: onTap,
      icon: Icon(icon, color: t.textPrimary),
      constraints: const BoxConstraints(minWidth: QmSpace.minTarget, minHeight: QmSpace.minTarget),
    );
  }
}

enum QmAttachmentState { ready, unavailable, uploading, waiting, scanning, blocked, failed }

/// Attachment chip with an honest state. [QmAttachmentState.unavailable] is
/// used when the server has no bytes to download for the file.
class QmAttachmentChip extends StatelessWidget {
  const QmAttachmentChip({
    super.key,
    required this.name,
    required this.sizeBytes,
    this.state = QmAttachmentState.ready,
    this.progress,
    this.onTap,
    this.onRetry,
  });

  final String name;
  final int sizeBytes;
  final QmAttachmentState state;

  /// 0..1 for [QmAttachmentState.uploading].
  final double? progress;
  final VoidCallback? onTap;
  final VoidCallback? onRetry;

  String get stateText => switch (state) {
        QmAttachmentState.ready => qmFormatBytes(sizeBytes),
        QmAttachmentState.unavailable => 'Not downloadable here yet',
        QmAttachmentState.uploading =>
          'Uploading${progress == null ? '' : ' ${(progress! * 100).round()}%'}',
        QmAttachmentState.waiting => 'Waiting for network',
        QmAttachmentState.scanning => 'Scanning',
        QmAttachmentState.blocked => 'Blocked: file may be unsafe',
        QmAttachmentState.failed => 'Failed',
      };

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    final Color stateColor = switch (state) {
      QmAttachmentState.blocked || QmAttachmentState.failed => t.danger,
      QmAttachmentState.unavailable || QmAttachmentState.waiting => t.warning,
      _ => t.textSecondary,
    };
    final bool tappable = state == QmAttachmentState.ready && onTap != null;
    return Semantics(
      button: tappable,
      label: '$name, $stateText',
      child: ExcludeSemantics(
        child: Material(
          color: t.panel,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(QmRadius.field),
            side: BorderSide(color: t.hairline),
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(QmRadius.field),
            onTap: tappable ? onTap : null,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: QmSpace.minTarget, maxWidth: 280),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: QmSpace.md, vertical: QmSpace.sm),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Icon(
                      state == QmAttachmentState.blocked ? Icons.gpp_bad_outlined : Icons.attach_file_rounded,
                      size: 20,
                      color: stateColor,
                    ),
                    const SizedBox(width: QmSpace.sm),
                    Flexible(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: <Widget>[
                          Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.label.copyWith(color: t.textPrimary)),
                          Text(stateText, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.caption.copyWith(color: stateColor)),
                          if (state == QmAttachmentState.uploading)
                            Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: LinearProgressIndicator(
                                value: progress,
                                minHeight: 2,
                                color: t.accent,
                                backgroundColor: t.hairline,
                              ),
                            ),
                        ],
                      ),
                    ),
                    if (state == QmAttachmentState.failed && onRetry != null)
                      TextButton(
                        onPressed: onRetry,
                        style: TextButton.styleFrom(
                          minimumSize: const Size(QmSpace.minTarget, QmSpace.minTarget),
                          foregroundColor: t.accentText,
                        ),
                        child: const Text('Retry'),
                      ),
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
