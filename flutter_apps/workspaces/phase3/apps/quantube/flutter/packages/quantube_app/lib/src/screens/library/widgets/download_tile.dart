// ============================================================================
// quantube_app - download tile (library downloads tab)
// ============================================================================
//
// One row of the downloads list: thumbnail, title, status line, progress
// bar, and the state-appropriate actions (pause/resume/retry/cancel/delete).
// Every action calls the [DownloadManager] contract via `ref.read` — the
// tile never owns state, it only renders [DownloadTask] snapshots.
//
// Dark-first: all colors come from the ambient [ThemeData] (QuantTubeTheme
// dark default); the progress bar uses the brand-red primary.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quantube_core/quantube_core.dart';

/// Row rendering one [DownloadTask] with its manager actions.
class DownloadTile extends ConsumerWidget {
  const DownloadTile({super.key, required this.task});

  final DownloadTask task;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final DownloadManager manager = ref.read(downloadManagerProvider);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: <Widget>[
          _Thumbnail(url: task.thumbnailUrl),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text(
                  task.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                const SizedBox(height: 4),
                Text(
                  _statusLine(task),
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                ),
                const SizedBox(height: 6),
                _Progress(task: task),
              ],
            ),
          ),
          const SizedBox(width: 4),
          _Actions(
            task: task,
            onPause: () => unawaited(manager.pause(task.videoId)),
            onResume: () => unawaited(manager.resume(task.videoId)),
            onCancel: () => unawaited(manager.cancel(task.videoId)),
            onDelete: () => _confirmDelete(context, ref, task),
          ),
        ],
      ),
    );
  }

  /// Delete asks for confirmation — removing bytes is destructive.
  Future<void> _confirmDelete(
    BuildContext context,
    WidgetRef ref,
    DownloadTask task,
  ) async {
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        title: const Text('Delete download?'),
        content: Text(
          '"${task.title}" will be removed from this device.',
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Keep'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await ref.read(downloadManagerProvider).deleteDownloaded(task.videoId);
    }
  }
}

/// 16:9 thumbnail; dark placeholder until real thumbnails exist.
///
/// TODO(UNVERIFIED): [url] is always null until the spec's metadata endpoint
/// exists — the placeholder is the real UI for now. When URLs land, add
/// caching (cached_network_image) — raw Image.network on a list scroll is a
/// jank/perf risk (perf-budget law).
class _Thumbnail extends StatelessWidget {
  const _Thumbnail({required this.url});

  final String? url;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: SizedBox(
        width: 112,
        height: 63,
        child: url != null
            ? Image.network(
                url!,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) =>
                    _Placeholder(scheme: scheme),
              )
            : _Placeholder(scheme: scheme),
      ),
    );
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder({required this.scheme});

  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) => ColoredBox(
        color: scheme.surfaceContainerHighest,
        child: Center(
          child: Icon(
            Icons.play_arrow,
            color: scheme.onSurfaceVariant,
            size: 28,
          ),
        ),
      );
}

/// Progress bar: determinate when the total size is known, indeterminate
/// (streaming bar) otherwise.
class _Progress extends StatelessWidget {
  const _Progress({required this.task});

  final DownloadTask task;

  @override
  Widget build(BuildContext context) {
    if (task.state == DownloadState.complete) {
      return LinearProgressIndicator(
        value: 1,
        backgroundColor:
            Theme.of(context).colorScheme.surfaceContainerHighest,
      );
    }
    final double? progress = task.progress;
    return LinearProgressIndicator(
      value: progress,
      backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
    );
  }
}

/// State-appropriate action buttons for the tile.
class _Actions extends StatelessWidget {
  const _Actions({
    required this.task,
    required this.onPause,
    required this.onResume,
    required this.onCancel,
    required this.onDelete,
  });

  final DownloadTask task;
  final VoidCallback onPause;
  final VoidCallback onResume;
  final VoidCallback onCancel;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final List<Widget> buttons = switch (task.state) {
      DownloadState.downloading => <Widget>[
          _ActionButton(
            icon: Icons.pause,
            tooltip: 'Pause download',
            onPressed: onPause,
          ),
          _ActionButton(
            icon: Icons.close,
            tooltip: 'Cancel download',
            onPressed: onCancel,
          ),
        ],
      DownloadState.queued => <Widget>[
          _ActionButton(
            icon: Icons.close,
            tooltip: 'Cancel download',
            onPressed: onCancel,
          ),
        ],
      DownloadState.paused => <Widget>[
          _ActionButton(
            icon: Icons.play_arrow,
            tooltip: 'Resume download',
            onPressed: onResume,
          ),
          _ActionButton(
            icon: Icons.close,
            tooltip: 'Cancel download',
            onPressed: onCancel,
          ),
        ],
      DownloadState.failed => <Widget>[
          _ActionButton(
            icon: Icons.refresh,
            tooltip: 'Retry download',
            onPressed: onResume,
          ),
          _ActionButton(
            icon: Icons.close,
            tooltip: 'Cancel download',
            onPressed: onCancel,
          ),
        ],
      DownloadState.complete => <Widget>[
          _ActionButton(
            icon: Icons.delete_outline,
            tooltip: 'Delete download',
            onPressed: onDelete,
          ),
        ],
    };
    return Row(mainAxisSize: MainAxisSize.min, children: buttons);
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => IconButton(
        icon: Icon(icon),
        tooltip: tooltip,
        // 48dp minimum touch target (a11y): VisualDensity.compact shrinks the
        // hit area below 48dp, so it is removed here. The explicit
        // constraints keep every tile action at the 48x48 Material minimum
        // (VQA-P3-11). This helper serves ALL tile actions, so this one fix
        // covers pause/resume/retry/cancel/delete.
        constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
        onPressed: onPressed,
      );
}

/// Human status line under the title.
String _statusLine(DownloadTask task) {
  final String size = task.totalBytes != null
      ? ' · ${_formatBytes(task.downloadedBytes)} of '
          '${_formatBytes(task.totalBytes!)}'
      : '';
  return switch (task.state) {
    DownloadState.downloading =>
      'Downloading\u2026${_percent(task)}$size',
    DownloadState.queued => 'Waiting to download',
    DownloadState.paused => 'Paused${_percent(task)}$size',
    DownloadState.complete =>
      'Downloaded · ${_formatBytes(task.totalBytes ?? task.downloadedBytes)}',
    DownloadState.failed =>
      'Failed${task.failureReason != null ? ' · ${task.failureReason}' : ''}',
  };
}

String _percent(DownloadTask task) {
  final double? progress = task.progress;
  if (progress == null) return '';
  return ' ${(progress * 100).round()}%';
}

/// Compact byte formatting: 512 KB, 48.0 MB, 1.2 GB.
String _formatBytes(int bytes) {
  const List<String> units = <String>['B', 'KB', 'MB', 'GB'];
  double value = bytes.toDouble();
  int unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  final int fractionDigits = value >= 100 || unit == 0 ? 0 : 1;
  return '${value.toStringAsFixed(fractionDigits)} ${units[unit]}';
}
