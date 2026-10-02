// ============================================================================
// quantube_app - home feed video card (QuanTube)
// ============================================================================
//
// One row of the home feed: 16:9 thumbnail (cached, with placeholder and
// error fallback), duration badge, channel avatar, 2-line title, metadata
// row (channel · views · age).
//
// Performance notes:
// - [CachedNetworkImage] with memCacheWidth caps thumbnail memory; thumbnails
//   are decorational here (fit: BoxFit.cover) so low-res cache is fine.
// - Stateless + const-friendly: the parent ListView.builder does the heavy
//   lifting (itemExtent is NOT fixed — cards vary with title length — so we
//   keep build cheap instead).

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:quantube_core/quantube_core.dart';

/// Tap-to-play card for one [Video] on the home feed.
///
/// [onTap] is wired by the screen (goes to `/watch/<videoId>`).
class VideoCard extends StatelessWidget {
  const VideoCard({
    super.key,
    required this.video,
    this.onTap,
  });

  final Video video;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;

    return InkWell(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          AspectRatio(
            aspectRatio: 16 / 9,
            child: Stack(
              fit: StackFit.expand,
              children: <Widget>[
                _Thumbnail(url: video.thumbnailUrl, title: video.title),
                Positioned(
                  right: 8,
                  bottom: 8,
                  child: _DurationBadge(
                    duration: video.duration,
                    scheme: scheme,
                    textTheme: textTheme,
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                _ChannelAvatar(
                  channelName: video.channelName,
                  scheme: scheme,
                  textTheme: textTheme,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        video.title,
                        style: textTheme.titleMedium,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${video.channelName} · '
                        '${_compactViews(video.viewCount)} views · '
                        '${_timeAgo(video.publishedAt)}',
                        style: textTheme.bodySmall?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// 16:9 thumbnail with cached network image, themed placeholder while
/// loading, and a graceful error tile (icon + title initial) if the fetch
/// fails or there is no URL at all.
class _Thumbnail extends StatelessWidget {
  const _Thumbnail({required this.url, required this.title});

  final String? url;
  final String title;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;

    // No URL (spec marks thumbnailUrl nullable): themed placeholder.
    if (url == null || url!.isEmpty) {
      return _ThumbnailFallback(scheme: scheme, title: title);
    }

    return CachedNetworkImage(
      imageUrl: url!,
      fit: BoxFit.cover,
      // Thumbnails render at card width; cap the decode size to keep memory
      // flat in long feeds (playback owns the GPU budget, not the feed).
      memCacheWidth: 640,
      placeholder: (BuildContext context, String url) => ColoredBox(
        color: scheme.surfaceContainerHighest,
        child: Center(
          child: Icon(
            Icons.play_circle_outline,
            size: 40,
            color: scheme.onSurfaceVariant,
          ),
        ),
      ),
      errorWidget: (BuildContext context, String url, Object error) =>
          _ThumbnailFallback(scheme: scheme, title: title),
    );
  }
}

/// Themed fallback tile for missing/failed thumbnails: surface background
/// + a large title initial. Never blank, never a broken-image icon.
class _ThumbnailFallback extends StatelessWidget {
  const _ThumbnailFallback({required this.scheme, required this.title});

  final ColorScheme scheme;
  final String title;

  @override
  Widget build(BuildContext context) {
    final String initial =
        title.trim().isEmpty ? 'Q' : title.trim()[0].toUpperCase();
    return ColoredBox(
      color: scheme.surfaceContainerHighest,
      child: Center(
        child: Text(
          initial,
          style: TextStyle(
            fontSize: 56,
            fontWeight: FontWeight.bold,
            color: scheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}

/// Duration badge (H:MM:SS / M:SS) overlaid on the thumbnail, bottom-right.
class _DurationBadge extends StatelessWidget {
  const _DurationBadge({
    required this.duration,
    required this.scheme,
    required this.textTheme,
  });

  final Duration duration;
  final ColorScheme scheme;
  final TextTheme textTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.8),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        _formatDuration(duration),
        style: textTheme.labelSmall?.copyWith(
          color: Colors.white,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

/// Channel avatar: initial letter in a brand-tinted circle.
///
/// TODO(UNVERIFIED): the spec may add a channel avatar URL to [Video]; if so,
/// render it here (CachedNetworkImage) with this initial as the fallback.
class _ChannelAvatar extends StatelessWidget {
  const _ChannelAvatar({
    required this.channelName,
    required this.scheme,
    required this.textTheme,
  });

  final String channelName;
  final ColorScheme scheme;
  final TextTheme textTheme;

  @override
  Widget build(BuildContext context) {
    final String initial = channelName.trim().isEmpty
        ? '?'
        : channelName.trim()[0].toUpperCase();
    return CircleAvatar(
      radius: 18,
      backgroundColor: scheme.primaryContainer,
      child: Text(
        initial,
        style: textTheme.titleSmall?.copyWith(
          color: scheme.onPrimaryContainer,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }
}

/// Formats [duration] as H:MM:SS (or M:SS when under an hour).
String _formatDuration(Duration duration) {
  final int totalSeconds = duration.inSeconds.clamp(0, 1 << 31);
  final int hours = totalSeconds ~/ 3600;
  final int minutes = (totalSeconds % 3600) ~/ 60;
  final int seconds = totalSeconds % 60;
  final String mm = minutes.toString().padLeft(hours > 0 ? 2 : 1, '0');
  final String ss = seconds.toString().padLeft(2, '0');
  return hours > 0 ? '$hours:$mm:$ss' : '$mm:$ss';
}

/// Compacts view counts: 1_234_567 -> "1.2M".
String _compactViews(int views) {
  if (views >= 1000000) {
    return '${(views / 1000000).toStringAsFixed(1)}M';
  }
  if (views >= 1000) {
    return '${(views / 1000).toStringAsFixed(1)}K';
  }
  return views.toString();
}

/// Relative age: "3 hours ago". Crude but honest — no intl dep needed yet.
///
/// TODO(UNVERIFIED): spec may want exact publish dates on some surfaces;
/// this relative form is for the feed card only.
String _timeAgo(DateTime publishedAt) {
  final Duration delta = DateTime.now().difference(publishedAt);
  if (delta.inMinutes < 1) return 'just now';
  if (delta.inHours < 1) return '${delta.inMinutes}m ago';
  if (delta.inDays < 1) return '${delta.inHours}h ago';
  if (delta.inDays < 30) return '${delta.inDays}d ago';
  if (delta.inDays < 365) return '${delta.inDays ~/ 30}mo ago';
  return '${delta.inDays ~/ 365}y ago';
}
