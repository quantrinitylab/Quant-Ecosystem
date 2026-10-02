import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';

/// Sovereign Asset Library Screen for QuantCooks.
///
/// Royalty-free music, whoosh/boom sound effects, video overlays, kinetic typography fonts,
/// and Hollywood cinema 3D LUT profiles.
///
/// Strictly ZERO raw Unicode emojis throughout this screen.
/// Strictly ZERO Skia clipPath calls (pure 120Hz Impeller hardware acceleration).
class AssetsLibraryScreen extends StatefulWidget {
  final Function(String assetName, String type)? onImportAsset;

  const AssetsLibraryScreen({super.key, this.onImportAsset});

  @override
  State<AssetsLibraryScreen> createState() => _AssetsLibraryScreenState();
}

class _AssetsLibraryScreenState extends State<AssetsLibraryScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final TextEditingController _searchController = TextEditingController();

  final List<Map<String, String>> _musicTracks = const [
    {'title': 'Cyber City Drive', 'bpm': '128 BPM', 'duration': '02:45', 'genre': 'Synthwave'},
    {'title': 'Sub-Bass Euphoria', 'bpm': '140 BPM', 'duration': '01:58', 'genre': 'Trap'},
    {'title': 'Deep Focus Matrix', 'bpm': '110 BPM', 'duration': '03:12', 'genre': 'Ambient Lo-Fi'},
    {'title': 'Action Hyper Riser', 'bpm': '150 BPM', 'duration': '01:30', 'genre': 'Glitch Hop'},
  ];

  final List<Map<String, String>> _soundFx = const [
    {'title': 'Cinematic Sub-Drop Boom', 'category': 'Impacts', 'duration': '00:03'},
    {'title': 'Whip Pan Fast Whoosh', 'category': 'Transitions', 'duration': '00:01'},
    {'title': 'Futuristic HUD Glitch Bleep', 'category': 'Sci-Fi UI', 'duration': '00:02'},
    {'title': 'Vinyl Scratch Stop', 'category': 'Retro', 'duration': '00:01'},
  ];

  final List<Map<String, String>> _luts = const [
    {'title': 'Blade Runner 2049', 'description': 'Teal & Neon Orange High Dynamic Range'},
    {'title': 'Dune Arrakis Sand', 'description': 'Desaturated Warm Gold & Amber'},
    {'title': 'Matrix Greenphosphor', 'description': 'Deep Black with Cyber Matrix Shadows'},
    {'title': 'Kodak Vision3 500T', 'description': 'Organic 35mm Analog Film Grain'},
  ];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SafeArea(
        child: Column(
          children: [
            // Top Bar
            _buildTopBar(),

            // Search Bar
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
              child: Container(
                decoration: BoxDecoration(
                  color: QuantColors.darkSlateCard,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: QuantColors.hairlineBorder),
                ),
                child: TextField(
                  controller: _searchController,
                  style: const TextStyle(fontSize: 13, color: Colors.white),
                  decoration: const InputDecoration(
                    hintText: 'Search 10,000+ royalty-free assets...',
                    hintStyle: TextStyle(color: QuantColors.textMuted, fontSize: 13),
                    prefixIcon: Icon(Icons.search_rounded, color: QuantColors.textMuted, size: 20),
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              ),
            ),

            // Tab Bar
            TabBar(
              controller: _tabController,
              indicatorColor: QuantColors.moltenAmber,
              indicatorWeight: 2,
              labelColor: QuantColors.moltenAmber,
              unselectedLabelColor: QuantColors.textSecondary,
              labelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
              tabs: const [
                Tab(text: 'Music & SFX'),
                Tab(text: 'Cinema 3D LUTs'),
                Tab(text: 'Kinetic Fonts'),
              ],
            ),

            // Tab Views
            Expanded(
              child: TabBarView(
                controller: _tabController,
                children: [
                  _buildAudioTab(),
                  _buildLutsTab(),
                  _buildFontsTab(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 0.8),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [QuantColors.emeraldMatrix, QuantColors.sovereignCyan],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  Icons.folder_special_rounded,
                  color: Colors.white,
                  size: 20,
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Asset Vault',
                    style: QuantTypography.titleMedium.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    'Commercial Cleared Sound & VFX',
                    style: QuantTypography.microCapsule.copyWith(
                      color: QuantColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ],
          ),

          // Cloud sync status
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: QuantColors.darkSlateCard,
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: QuantColors.hairlineBorder),
            ),
            child: const Row(
              children: [
                Icon(Icons.cloud_done_rounded, size: 14, color: QuantColors.statusSuccess),
                SizedBox(width: 4),
                Text(
                  'SYNCED',
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    color: QuantColors.statusSuccess,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAudioTab() {
    return ListView(
      padding: const EdgeInsets.all(16.0),
      physics: const BouncingScrollPhysics(),
      children: [
        const Text(
          'TRENDING MUSIC BEDS',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            color: QuantColors.textMuted,
          ),
        ),
        const SizedBox(height: 8),
        ..._musicTracks.map((item) => _buildAudioItem(
              title: item['title']!,
              subtitle: '${item['genre']} · ${item['bpm']}',
              duration: item['duration']!,
              icon: Icons.music_note_rounded,
              color: QuantColors.moltenAmber,
            )),
        const SizedBox(height: 20),
        const Text(
          'STUDIO SOUND EFFECTS (SFX)',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            color: QuantColors.textMuted,
          ),
        ),
        const SizedBox(height: 8),
        ..._soundFx.map((item) => _buildAudioItem(
              title: item['title']!,
              subtitle: item['category']!,
              duration: item['duration']!,
              icon: Icons.graphic_eq_rounded,
              color: QuantColors.sovereignCyan,
            )),
      ],
    );
  }

  Widget _buildAudioItem({
    required String title,
    required String subtitle,
    required String duration,
    required IconData icon,
    required Color color,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: color.withOpacity(0.18),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: QuantColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: const TextStyle(
                    fontSize: 11,
                    color: QuantColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          Text(
            duration,
            style: const TextStyle(
              fontFamily: 'monospace',
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: QuantColors.textMuted,
            ),
          ),
          const SizedBox(width: 10),
          IconButton(
            icon: const Icon(Icons.add_circle_outline_rounded, size: 20),
            color: QuantColors.moltenAmber,
            tooltip: 'Add to Timeline',
            onPressed: () {
              widget.onImportAsset?.call(title, 'audio');
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  backgroundColor: QuantColors.darkSlateCard,
                  content: Text(
                    'Added "$title" to Audio Track.',
                    style: const TextStyle(color: QuantColors.textPrimary),
                  ),
                  duration: const Duration(seconds: 1),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildLutsTab() {
    return ListView.builder(
      padding: const EdgeInsets.all(16.0),
      physics: const BouncingScrollPhysics(),
      itemCount: _luts.length,
      itemBuilder: (context, index) {
        final lut = _luts[index];
        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: QuantColors.darkSlateCard,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: QuantColors.hairlineBorder),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [QuantColors.sunsetGold, QuantColors.obsidianPurple],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  Icons.palette_rounded,
                  color: Colors.white,
                  size: 22,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      lut['title']!,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: QuantColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      lut['description']!,
                      style: const TextStyle(
                        fontSize: 11,
                        color: QuantColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.check_circle_outline_rounded, size: 22),
                color: QuantColors.sovereignCyan,
                tooltip: 'Apply 3D LUT',
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      backgroundColor: QuantColors.darkSlateCard,
                      content: Text(
                        'Cinema 3D LUT "${lut['title']}" applied.',
                        style: const TextStyle(color: QuantColors.textPrimary),
                      ),
                    ),
                  );
                },
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildFontsTab() {
    final fonts = [
      {'name': 'Impact Heavy Kinetic', 'style': 'BOLD CONDENSED'},
      {'name': 'Bebas Neue Pro', 'style': 'TITLE HEADER'},
      {'name': 'Inter Sovereign Sans', 'style': 'CLEAN MODERN'},
      {'name': 'Fira Code Cyber Mono', 'style': 'TERMINAL HUD'},
    ];

    return ListView.builder(
      padding: const EdgeInsets.all(16.0),
      physics: const BouncingScrollPhysics(),
      itemCount: fonts.length,
      itemBuilder: (context, index) {
        final font = fonts[index];
        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: QuantColors.darkSlateCard,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: QuantColors.hairlineBorder),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    font['name']!,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: QuantColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    font['style']!,
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: QuantColors.moltenAmber,
                      letterSpacing: 0.5,
                    ),
                  ),
                ],
              ),
              const Icon(
                Icons.text_fields_rounded,
                color: QuantColors.textMuted,
                size: 20,
              ),
            ],
          ),
        );
      },
    );
  }
}
