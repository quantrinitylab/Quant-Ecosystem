import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/tube_models.dart';
import '../data/tube_repository.dart';
import 'video_player_screen.dart';

/// Subscriptions Feed Screen for QuanTube
/// Displays subscribed creator avatars row and latest video uploads.
class SubscriptionsScreen extends StatelessWidget {
  const SubscriptionsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final videos = TubeRepository.getVideos();

    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: CustomScrollView(
        physics: const BouncingScrollPhysics(),
        slivers: [
          // Subscribed Channels Horizontal Bar
          SliverToBoxAdapter(
            child: _buildSubscribedChannelsRow(context),
          ),

          const SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Text(
                'Latest Sovereign Uploads',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: QuantColors.textPrimary,
                ),
              ),
            ),
          ),

          // Uploads Feed
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            sliver: SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, index) {
                  final video = videos[index];
                  return _buildSubscriptionVideoCard(context, video);
                },
                childCount: videos.length,
              ),
            ),
          ),

          const SliverToBoxAdapter(
            child: SizedBox(height: 80),
          ),
        ],
      ),
    );
  }

  Widget _buildSubscribedChannelsRow(BuildContext context) {
    final channels = [
      {'name': 'Quantrinity', 'avatar': 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=120', 'live': true},
      {'name': 'Quant AI', 'avatar': 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120', 'live': false},
      {'name': 'GameTech', 'avatar': 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120', 'live': false},
      {'name': 'SoundLab', 'avatar': 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120', 'live': true},
      {'name': 'CodeVerse', 'avatar': 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120', 'live': false},
    ];

    return Container(
      height: 96,
      margin: const EdgeInsets.only(top: 8),
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        itemCount: channels.length,
        separatorBuilder: (_, __) => const SizedBox(width: 14),
        itemBuilder: (context, index) {
          final ch = channels[index];
          final isLive = ch['live'] as bool;

          return Column(
            children: [
              Stack(
                alignment: Alignment.center,
                children: [
                  Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: isLive ? QuantColors.crimsonRed : QuantColors.hairlineBorder,
                        width: isLive ? 2 : 1,
                      ),
                      image: DecorationImage(
                        image: NetworkImage(ch['avatar'] as String),
                        fit: BoxFit.cover,
                      ),
                    ),
                  ),
                  if (isLive)
                    Positioned(
                      bottom: 0,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                        decoration: BoxDecoration(
                          color: QuantColors.crimsonRed,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text(
                          'LIVE',
                          style: TextStyle(
                            fontSize: 8,
                            fontWeight: FontWeight.w900,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                ch['name'] as String,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: QuantColors.textPrimary,
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildSubscriptionVideoCard(BuildContext context, VideoItem video) {
    return GestureDetector(
      onTap: () {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (context) => VideoPlayerScreen(video: video),
          ),
        );
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: QuantColors.darkSlateCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: QuantColors.hairlineBorder, width: 0.8),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: SizedBox(
                width: 120,
                height: 72,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Image.network(video.thumbnailUrl, fit: BoxFit.cover),
                    Positioned(
                      bottom: 4,
                      right: 4,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                        decoration: BoxDecoration(
                          color: Colors.black87,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          video.formattedDuration,
                          style: const TextStyle(fontSize: 9, color: Colors.white, fontWeight: FontWeight.w700),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    video.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: QuantColors.textPrimary,
                      height: 1.25,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '${video.channelTitle} • ${video.formattedViews}',
                    style: const TextStyle(
                      fontSize: 11,
                      color: QuantColors.textMuted,
                    ),
                  ),
                  Text(
                    video.uploadTimeAgo,
                    style: const TextStyle(
                      fontSize: 10,
                      color: QuantColors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
