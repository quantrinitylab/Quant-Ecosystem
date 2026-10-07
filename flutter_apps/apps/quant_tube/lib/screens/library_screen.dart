import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../data/tube_repository.dart';
import 'video_player_screen.dart';

/// Sovereign Library Screen for QuanTube
/// History, Watch Later, Liked Videos, Playlists, and Offline Downloads.
class LibraryScreen extends StatelessWidget {
  const LibraryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final recentHistory = TubeRepository.getVideos().take(3).toList();

    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: ListView(
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        children: [
          // User Profile Quick Banner
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: QuantColors.darkSlateCard,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: QuantColors.hairlineBorder, width: 1),
            ),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: QuantColors.crimsonRed, width: 2),
                    image: const DecorationImage(
                      image: NetworkImage('https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120'),
                      fit: BoxFit.cover,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Sovereign Quant User',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: QuantColors.textPrimary,
                        ),
                      ),
                      SizedBox(height: 2),
                      Text(
                        'Zero Tracking • E2EE Staged Cache',
                        style: TextStyle(
                          fontSize: 12,
                          color: QuantColors.statusSuccess,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.settings_outlined, color: Colors.white70),
                  onPressed: () {},
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Recently Watched History Strip
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Recent History',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: QuantColors.textPrimary,
                ),
              ),
              TextButton(
                onPressed: () {},
                child: const Text(
                  'See all',
                  style: TextStyle(fontSize: 12, color: QuantColors.crimsonRed),
                ),
              ),
            ],
          ),
          SizedBox(
            height: 140,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              physics: const BouncingScrollPhysics(),
              itemCount: recentHistory.length,
              separatorBuilder: (_, __) => const SizedBox(width: 12),
              itemBuilder: (context, index) {
                final vid = recentHistory[index];
                return GestureDetector(
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (context) => VideoPlayerScreen(video: vid),
                      ),
                    );
                  },
                  child: SizedBox(
                    width: 150,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: AspectRatio(
                            aspectRatio: 16 / 9,
                            child: Image.network(vid.thumbnailUrl, fit: BoxFit.cover),
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          vid.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: QuantColors.textPrimary,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 16),

          // Library Nav Items (Playlists, Downloads, Watch Later, Liked)
          _buildLibraryTile(
            icon: Icons.history_rounded,
            title: 'Full Watch History',
            subtitle: '124 videos watched',
            onTap: () {},
          ),
          _buildLibraryTile(
            icon: Icons.playlist_play_rounded,
            title: 'Sovereign Playlists',
            subtitle: '8 playlists created',
            onTap: () {},
          ),
          _buildLibraryTile(
            icon: Icons.watch_later_outlined,
            title: 'Watch Later',
            subtitle: '18 saved videos',
            onTap: () {},
          ),
          _buildLibraryTile(
            icon: Icons.thumb_up_alt_outlined,
            title: 'Liked Videos',
            subtitle: '412 videos',
            onTap: () {},
          ),
          _buildLibraryTile(
            icon: Icons.download_done_rounded,
            title: 'Offline Downloads',
            subtitle: '12 videos (1080p60) • 4.2 GB cached',
            accentColor: QuantColors.statusSuccess,
            onTap: () {},
          ),

          const SizedBox(height: 80),
        ],
      ),
    );
  }

  Widget _buildLibraryTile({
    required IconData icon,
    required String title,
    required String subtitle,
    Color? accentColor,
    required VoidCallback onTap,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: QuantColors.hairlineBorder, width: 0.8),
      ),
      child: ListTile(
        leading: Icon(icon, color: accentColor ?? QuantColors.textPrimary),
        title: Text(
          title,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: QuantColors.textPrimary,
          ),
        ),
        subtitle: Text(
          subtitle,
          style: const TextStyle(fontSize: 12, color: QuantColors.textMuted),
        ),
        trailing: const Icon(Icons.chevron_right_rounded, color: QuantColors.textMuted),
        onTap: onTap,
      ),
    );
  }
}
