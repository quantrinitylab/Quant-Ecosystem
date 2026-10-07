// ============================================================================
// quantmax_app - FeedScreen: vertical full-screen video pager (Shift 2)
// ============================================================================
//
// TikTok-style vertical PageView — QuantMax ka home surface. 60fps notes:
// - Har page `RepaintBoundary` me wrapped — page transitions sirf changed
//   page repaint karte hain, poora tree nahi.
// - `allowImplicitScrolling: true` — adjacent pages pre-built rehte hain,
//   isliye page change par playback instant start hota hai (no black frame).
// - `onPageChanged` me `setState` SIRF index ke liye hota hai; purane page
//   ka pause / naye page ka play `isActive` prop se
//   `VideoCard.didUpdateWidget` me hota hai — koi rebuild storm nahi.
//
// Data: W2 ka `feedItemsProvider` (`LocalSampleFeedRepository` — explicitly
// sample data). Real feed endpoints `app-foundations/quantmax` spec ke baad
// wire honge; yahan koi endpoint invent nahi kiya gaya.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quantmax_core/quantmax_core.dart';

import '../widgets/video_card.dart';

/// Vertical video feed — the home surface of QuantMax.
class FeedScreen extends ConsumerStatefulWidget {
  const FeedScreen({super.key});

  @override
  ConsumerState<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends ConsumerState<FeedScreen> {
  final PageController _pageController = PageController();
  int _currentIndex = 0;

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  /// Page change par sirf index state update hota hai.
  ///
  /// Playback control `VideoCard` ke `isActive` prop ke through hota hai:
  /// index change se har card ka `didUpdateWidget` chalta hai, jo purane
  /// page ko pause aur naye page ko play karta hai.
  void _onPageChanged(int index) {
    setState(() => _currentIndex = index);
  }

  @override
  Widget build(BuildContext context) {
    // Feed full-bleed hai (koi AppBar nahi): status/navigation bar icons
    // dark video par white rahen.
    final AsyncValue<List<MaxVideo>> feed = ref.watch(feedItemsProvider);

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: QuantMaxColors.feedCanvas,
      ),
      child: Scaffold(
        backgroundColor: QuantMaxColors.feedCanvas,
        body: feed.when(
          data: (List<MaxVideo> videos) {
            if (videos.isEmpty) {
              return const _FeedEmptyState();
            }
            final int active = _currentIndex.clamp(0, videos.length - 1);
            return PageView.builder(
              controller: _pageController,
              scrollDirection: Axis.vertical,
              itemCount: videos.length,
              allowImplicitScrolling: true,
              onPageChanged: _onPageChanged,
              itemBuilder: (BuildContext context, int index) {
                final MaxVideo video = videos[index];
                return RepaintBoundary(
                  child: VideoCard(
                    key: ValueKey<Object>(video.id),
                    video: video,
                    isActive: index == active,
                  ),
                );
              },
            );
          },
          loading: () => const _FeedLoadingState(),
          error: (Object error, StackTrace stackTrace) => _FeedErrorState(
            onRetry: () => ref.invalidate(feedItemsProvider),
          ),
        ),
      ),
    );
  }
}

/// Loading: simple dark placeholder (koi package nahi laaya gaya).
class _FeedLoadingState extends StatelessWidget {
  const _FeedLoadingState();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: CircularProgressIndicator(
        color: QuantMaxColors.primary500,
      ),
    );
  }
}

/// Error: retry button — `ref.invalidate` se provider dobara fetch karta hai.
class _FeedErrorState extends StatelessWidget {
  const _FeedErrorState({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const Icon(
              Icons.error_outline,
              size: 48,
              color: QuantMaxColors.onVideoSecondary,
            ),
            const SizedBox(height: 16),
            const Text(
              "Couldn't load the feed",
              style: QuantMaxTextStyles.videoUsername,
            ),
            const SizedBox(height: 8),
            const Text(
              'Check your connection and try again.',
              style: QuantMaxTextStyles.videoCaption,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: onRetry,
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Empty: sample feed khali ho to dikhta hai (real feed spec ke baad aayega).
class _FeedEmptyState extends StatelessWidget {
  const _FeedEmptyState();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(
              Icons.play_circle_outline,
              size: 64,
              color: QuantMaxColors.onVideoTertiary,
            ),
            SizedBox(height: 16),
            Text(
              'No videos yet',
              style: QuantMaxTextStyles.videoUsername,
            ),
            SizedBox(height: 8),
            Text(
              'New videos will appear here.',
              style: QuantMaxTextStyles.videoCaption,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
