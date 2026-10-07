// ============================================================================
// gram_app - story rail (Shift 2, W2)
// ============================================================================
//
// Horizontal stories strip for the feed header. Watches `storiesProvider`
// (W1 feed domain contract) — 72dp circular avatars, brand-gradient ring for
// unviewed stories, grey ring for viewed. "+ Your story" tile nahi hai —
// camera flow Shift 3 me aayega.
//
// Loading -> shimmer-ish placeholders; error -> retry button.

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gram_core/gram_core.dart';

/// Height of the whole rail (avatars + username labels).
const double kStoryRailHeight = 104.0;

/// Diameter of one story avatar (ring + image).
const double kStoryAvatarSize = 72.0;

/// Stories strip shown above the feed list.
///
/// All image loads use [CachedNetworkImage] with a shimmer-ish placeholder
/// and a broken-image error widget (media performance law, MISSION.md).
class StoryRail extends ConsumerWidget {
  const StoryRail({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<GramStory>> stories = ref.watch(storiesProvider);

    return SizedBox(
      height: kStoryRailHeight,
      child: stories.when(
        data: (List<GramStory> items) {
          if (items.isEmpty) {
            return const _StoryRailEmpty();
          }
          return ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            itemCount: items.length,
            addAutomaticKeepAlives: false,
            itemBuilder: (BuildContext context, int index) =>
                _StoryItem(story: items[index]),
          );
        },
        loading: () => ListView.builder(
          scrollDirection: Axis.horizontal,
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          itemCount: 6,
          addAutomaticKeepAlives: false,
          itemBuilder: (BuildContext context, int index) =>
              const _StoryShimmer(),
        ),
        error: (Object error, StackTrace stackTrace) => Center(
          child: TextButton.icon(
            onPressed: () => ref.invalidate(storiesProvider),
            icon: const Icon(Icons.refresh, size: 16),
            label: const Text('Retry stories'),
          ),
        ),
      ),
    );
  }
}

/// One story tile: gradient ring + avatar + truncated username.
class _StoryItem extends StatelessWidget {
  const _StoryItem({required this.story});

  final GramStory story;

  @override
  Widget build(BuildContext context) {
    final bool viewed = story.viewed;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          RepaintBoundary(
            child: Container(
              width: kStoryAvatarSize,
              height: kStoryAvatarSize,
              padding: const EdgeInsets.all(3),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: viewed ? null : GramColors.brandGradient,
                color: viewed ? GramColors.foregroundTertiaryDark : null,
              ),
              child: Container(
                padding: const EdgeInsets.all(2),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Theme.of(context).scaffoldBackgroundColor,
                ),
                child: ClipOval(
                  child: CachedNetworkImage(
                    imageUrl: story.thumbnailUrl,
                    width: kStoryAvatarSize,
                    height: kStoryAvatarSize,
                    fit: BoxFit.cover,
                    placeholder: (BuildContext context, String url) =>
                        Container(color: GramColors.surfaceVariantDark),
                    errorWidget:
                        (BuildContext context, String url, Object error) =>
                            Container(
                      color: GramColors.surfaceVariantDark,
                      child: const Icon(Icons.broken_image, size: 24),
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 4),
          SizedBox(
            width: kStoryAvatarSize,
            child: Text(
              story.author.username,
              style: GramTextStyles.storyLabel,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
            ),
          ),
        ],
      ),
    );
  }
}

/// Shimmer-ish placeholder circle while stories load.
class _StoryShimmer extends StatelessWidget {
  const _StoryShimmer();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(horizontal: 6),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          SizedBox(
            width: kStoryAvatarSize,
            height: kStoryAvatarSize,
            child: DecoratedBox(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: GramColors.surfaceVariantDark,
              ),
            ),
          ),
          SizedBox(height: 4),
          SizedBox(
            width: 56,
            height: 10,
            child: DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.all(Radius.circular(5)),
                color: GramColors.surfaceVariantDark,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StoryRailEmpty extends StatelessWidget {
  const _StoryRailEmpty();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        'No stories yet',
        style: GramTextStyles.bodySmall
            .copyWith(color: GramColors.foregroundSecondaryDark),
      ),
    );
  }
}
