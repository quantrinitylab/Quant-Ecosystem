// Sovereign Quant Ecosystem - QuanTube Video Upload Sheet
// 4-Step Creator Studio Upload Flow:
// 1) File & Transcoding, 2) Metadata, 3) Thumbnail Frame Selector, 4) Visibility & Monetization.
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (pure 120Hz Impeller hardware acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../../models/tube_models.dart';

/// 4-Step Creator Studio Upload Modal Sheet for QuanTube.
/// Guides creators through:
/// 1. File & Transcoding preset selection with real-time hash telemetry.
/// 2. Metadata: Title, Description, Tags, Category, Audience.
/// 3. Thumbnail selector: scrubable video frames, AI auto-selector, custom upload.
/// 4. Visibility & Monetization: Public sovereign CDN, Quant Credits micro-settlement.
class VideoUploadSheet extends StatefulWidget {
  final Function(VideoItem)? onVideoPublished;

  const VideoUploadSheet({
    super.key,
    this.onVideoPublished,
  });

  /// Static helper to display the upload sheet as an obsidian modal bottom sheet.
  static Future<void> show(
    BuildContext context, {
    Function(VideoItem)? onVideoPublished,
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => VideoUploadSheet(onVideoPublished: onVideoPublished),
    );
  }

  @override
  State<VideoUploadSheet> createState() => _VideoUploadSheetState();
}

class _VideoUploadSheetState extends State<VideoUploadSheet> {
  int _currentStep = 0; // 0 to 3

  // Step 1: File & Transcoding state
  String _selectedFileName = 'sovereign_benchmark_4k.raw';
  String _fileSize = '3.42 GB';
  String _videoDuration = '12:45';
  String _selectedCodec = 'AV1 / 120Hz Sovereign';
  String _selectedResolution = '2160p60 4K HDR';
  String _selectedAudioProfile = 'FLAC Lossless (24-bit/96kHz)';
  double _transcodeProgress = 0.85;

  // Step 2: Metadata state
  final TextEditingController _titleController = TextEditingController(
    text: 'Sovereign Tripartite Swarm: 120Hz Impeller & Zero ClipPath Architecture',
  );
  final TextEditingController _descriptionController = TextEditingController(
    text:
        'Comprehensive deep-dive into sovereign media pipelines, hardware-accelerated 120Hz rendering, and zero-latency segment skipping.',
  );
  final TextEditingController _tagInputController = TextEditingController();
  final List<String> _tags = [
    'QuantSovereign',
    'Impeller120Hz',
    'ZeroClipPath',
    'AV1Stream',
    'DecentralizedMedia',
  ];
  String _selectedCategory = 'Coding';
  String _selectedLanguage = 'English (US)';
  bool _isAudienceSafe = true;

  // Step 3: Thumbnail state
  int _selectedFrameIndex = 1;
  final List<String> _extractedFrames = [
    'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=600&q=80',
  ];
  bool _abTestingEnabled = false;

  // Step 4: Visibility & Monetization state
  String _visibilityMode = 'Public (Sovereign CDN Edge)';
  bool _quantCreditsMonetized = true;
  double _cpmRate = 4.50; // $ per 1k views in QC
  bool _sponsorBlockScanActive = true;
  String _licenseType = 'Sovereign Open Attribution (CC-BY-SA 4.0)';

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    _tagInputController.dispose();
    super.dispose();
  }

  void _nextStep() {
    if (_currentStep < 3) {
      setState(() => _currentStep++);
    } else {
      _publishVideo();
    }
  }

  void _previousStep() {
    if (_currentStep > 0) {
      setState(() => _currentStep--);
    }
  }

  void _addTag(String tag) {
    final cleaned = tag.trim().replaceAll('#', '');
    if (cleaned.isNotEmpty && !_tags.contains(cleaned)) {
      setState(() {
        _tags.add(cleaned);
        _tagInputController.clear();
      });
    }
  }

  void _removeTag(String tag) {
    setState(() {
      _tags.remove(tag);
    });
  }

  void _publishVideo() {
    final publishedItem = VideoItem(
      id: 'vid-${DateTime.now().millisecondsSinceEpoch}',
      title: _titleController.text.trim().isEmpty
          ? 'Sovereign 4K Video Stream'
          : _titleController.text.trim(),
      channelTitle: 'Quantrinity Sovereign Tech',
      channelHandle: '@quantrinity',
      channelAvatarUrl:
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
      isChannelVerified: true,
      viewsCount: 0,
      uploadTimeAgo: 'Just now',
      durationSeconds: 765,
      thumbnailUrl: _extractedFrames[_selectedFrameIndex],
      streamUrl: 'https://quanttube.in/stream/sovereign-live.mpd',
      category: _selectedCategory,
      likesCount: 1,
      dislikesCount: 0,
      description: _descriptionController.text.trim(),
      segments: const [
        VideoSegment(
          id: 'seg-intro',
          title: 'Intro & Impeller Overview',
          startSeconds: 0,
          endSeconds: 45,
          type: SegmentType.intro,
          autoSkip: false,
        ),
      ],
      commentsCount: 0,
      isPublicFeed: _visibilityMode.contains('Public'),
    );

    widget.onVideoPublished?.call(publishedItem);
    Navigator.of(context).pop();

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        backgroundColor: QuantColors.statusSuccess,
        content: Text(
          'Video published to Sovereign CDN. 4K 120Hz live stream available globally.',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      height: MediaQuery.of(context).size.height * 0.90,
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        border: Border(
          top: BorderSide(color: QuantColors.activeBorder, width: 1.2),
          left: BorderSide(color: QuantColors.hairlineBorder, width: 0.8),
          right: BorderSide(color: QuantColors.hairlineBorder, width: 0.8),
        ),
      ),
      child: Column(
        children: [
          // Top Drag Handle & Title Bar
          _buildTopBar(),

          // 4-Step Stepper Progress Bar
          _buildStepperNavigation(),

          const Divider(color: QuantColors.hairlineBorder, height: 1),

          // Scrollable Step Body
          Expanded(
            child: SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(20, 16, 20, bottomInset + 16),
              physics: const BouncingScrollPhysics(),
              child: _buildCurrentStepContent(),
            ),
          ),

          // Bottom Navigation Actions (Back / Next / Publish)
          _buildBottomActionDock(),
        ],
      ),
    );
  }

  Widget _buildTopBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      child: Column(
        children: [
          Container(
            width: 44,
            height: 4,
            decoration: BoxDecoration(
              color: QuantColors.activeBorder,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: QuantColors.crimsonRed.withOpacity(0.18),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(
                  Icons.video_call_rounded,
                  color: QuantColors.crimsonRed,
                  size: 20,
                ),
              ),
              const SizedBox(width: 10),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Creator Studio Video Upload',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: QuantColors.textPrimary,
                      ),
                    ),
                    Text(
                      '4-Step Sovereign Pipeline • AV1 120Hz Impeller',
                      style: TextStyle(
                        fontSize: 11,
                        color: QuantColors.textMuted,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close_rounded, color: Colors.white70),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStepperNavigation() {
    final steps = [
      {'title': 'Transcoding', 'icon': Icons.memory_rounded},
      {'title': 'Metadata', 'icon': Icons.edit_note_rounded},
      {'title': 'Thumbnail', 'icon': Icons.image_rounded},
      {'title': 'Monetization', 'icon': Icons.monetization_on_rounded},
    ];

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      color: QuantColors.darkSlateCard,
      child: Row(
        children: [
          for (int i = 0; i < steps.length; i++) ...[
            Expanded(
              child: GestureDetector(
                onTap: () {
                  if (i <= _currentStep) {
                    setState(() => _currentStep = i);
                  }
                },
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 26,
                      height: 26,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: i < _currentStep
                            ? QuantColors.statusSuccess
                            : i == _currentStep
                                ? QuantColors.crimsonRed
                                : QuantColors.elevatedCard,
                        border: Border.all(
                          color: i == _currentStep
                              ? QuantColors.crimsonRed
                              : QuantColors.hairlineBorder,
                          width: 1.2,
                        ),
                      ),
                      child: Center(
                        child: i < _currentStep
                            ? const Icon(Icons.check_rounded, size: 14, color: Colors.white)
                            : Text(
                                '${i + 1}',
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white,
                                ),
                              ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        steps[i]['title'] as String,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: i == _currentStep ? FontWeight.w700 : FontWeight.w500,
                          color: i == _currentStep ? Colors.white : QuantColors.textMuted,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (i < steps.length - 1)
              Container(
                width: 14,
                height: 1.5,
                margin: const EdgeInsets.symmetric(horizontal: 4),
                color: i < _currentStep ? QuantColors.statusSuccess : QuantColors.hairlineBorder,
              ),
          ],
        ],
      ),
    );
  }

  Widget _buildCurrentStepContent() {
    switch (_currentStep) {
      case 0:
        return _buildStep1FileAndTranscoding();
      case 1:
        return _buildStep2Metadata();
      case 2:
        return _buildStep3Thumbnail();
      case 3:
        return _buildStep4VisibilityAndMonetization();
      default:
        return const SizedBox();
    }
  }

  // ===========================================================================
  // STEP 1: FILE & TRANSCODING
  // ===========================================================================
  Widget _buildStep1FileAndTranscoding() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader(
          title: '1. Source Media & Decentralized Transcoding',
          subtitle: 'Select source master file and configure hardware AV1 encoding profile.',
          icon: Icons.cloud_upload_rounded,
        ),
        const SizedBox(height: 16),

        // File Drag & Drop Simulation Card
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: QuantColors.darkSlateCard,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: QuantColors.hairlineBorder, width: 1),
          ),
          child: Column(
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: QuantColors.crimsonRed.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(
                      Icons.video_file_rounded,
                      color: QuantColors.crimsonRed,
                      size: 28,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _selectedFileName,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: QuantColors.textPrimary,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '$_fileSize • Duration: $_videoDuration • 4K Master',
                          style: const TextStyle(
                            fontSize: 12,
                            color: QuantColors.textMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  TextButton.icon(
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('File picker opened: Replaced master RAW source.'),
                        ),
                      );
                    },
                    icon: const Icon(Icons.sync_rounded, size: 16, color: QuantColors.sovereignCyan),
                    label: const Text(
                      'Replace',
                      style: TextStyle(color: QuantColors.sovereignCyan, fontSize: 12),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              // Transcoding Progress Indicator
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: _transcodeProgress,
                  backgroundColor: QuantColors.elevatedCard,
                  valueColor: const AlwaysStoppedAnimation<Color>(QuantColors.crimsonRed),
                  minHeight: 6,
                ),
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Transcoding Progress: ${(_transcodeProgress * 100).toInt()}%',
                    style: const TextStyle(fontSize: 11, color: Colors.white70),
                  ),
                  const Text(
                    '64.8 MB/s • CID: bafybeic7v...2q',
                    style: TextStyle(fontSize: 11, color: QuantColors.statusSuccess),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),

        // Transcoding Codec Selection
        const Text(
          'Target Encoding Codec',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: QuantColors.textPrimary,
          ),
        ),
        const SizedBox(height: 8),
        _buildDropdownSelector<String>(
          value: _selectedCodec,
          items: const [
            'AV1 / 120Hz Sovereign',
            'HEVC / H.265 Master 60Hz',
            'VP9 Web-Optimized',
            'ProRes 422 Sovereign Archive',
          ],
          onChanged: (val) {
            if (val != null) setState(() => _selectedCodec = val);
          },
        ),
        const SizedBox(height: 16),

        // Resolution Selection
        const Text(
          'Master Output Resolution',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: QuantColors.textPrimary,
          ),
        ),
        const SizedBox(height: 8),
        _buildDropdownSelector<String>(
          value: _selectedResolution,
          items: const [
            '2160p60 4K HDR',
            '1440p120 Ultra HD',
            '1080p60 Full HD',
            '720p60 HD',
          ],
          onChanged: (val) {
            if (val != null) setState(() => _selectedResolution = val);
          },
        ),
        const SizedBox(height: 16),

        // Audio Profile Selection
        const Text(
          'Audio Mastering Profile',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: QuantColors.textPrimary,
          ),
        ),
        const SizedBox(height: 8),
        _buildDropdownSelector<String>(
          value: _selectedAudioProfile,
          items: const [
            'FLAC Lossless (24-bit/96kHz)',
            'Opus High-Bitrate (320 kbps)',
            'Binaural 3D Spatial Audio',
            'AAC Standard Stereo (256 kbps)',
          ],
          onChanged: (val) {
            if (val != null) setState(() => _selectedAudioProfile = val);
          },
        ),
      ],
    );
  }

  // ===========================================================================
  // STEP 2: METADATA
  // ===========================================================================
  Widget _buildStep2Metadata() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader(
          title: '2. Video Metadata & Discoverability',
          subtitle: 'Define title, structured description, sovereign tags, and content rating.',
          icon: Icons.edit_note_rounded,
        ),
        const SizedBox(height: 16),

        // Video Title Input
        const Text(
          'Video Title *',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: QuantColors.textPrimary,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _titleController,
          maxLength: 100,
          style: const TextStyle(color: Colors.white, fontSize: 14),
          decoration: InputDecoration(
            hintText: 'Enter an engaging, sovereign video title...',
            hintStyle: const TextStyle(color: QuantColors.textMuted, fontSize: 13),
            filled: true,
            fillColor: QuantColors.darkSlateCard,
            counterStyle: const TextStyle(color: QuantColors.textMuted, fontSize: 11),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: QuantColors.hairlineBorder),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: QuantColors.hairlineBorder),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: QuantColors.crimsonRed, width: 1.5),
            ),
          ),
        ),
        const SizedBox(height: 14),

        // Description Input
        const Text(
          'Description & Timestamps',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: QuantColors.textPrimary,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _descriptionController,
          maxLines: 4,
          maxLength: 5000,
          style: const TextStyle(color: Colors.white, fontSize: 13, height: 1.4),
          decoration: InputDecoration(
            hintText: 'Describe video contents, cite sovereign git repos, and add timestamps...',
            hintStyle: const TextStyle(color: QuantColors.textMuted, fontSize: 13),
            filled: true,
            fillColor: QuantColors.darkSlateCard,
            counterStyle: const TextStyle(color: QuantColors.textMuted, fontSize: 11),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: QuantColors.hairlineBorder),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: QuantColors.hairlineBorder),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: QuantColors.crimsonRed, width: 1.5),
            ),
          ),
        ),
        const SizedBox(height: 14),

        // Tags Input & Tag Chips
        const Text(
          'Sovereign Discovery Tags',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: QuantColors.textPrimary,
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _tagInputController,
                style: const TextStyle(color: Colors.white, fontSize: 13),
                decoration: InputDecoration(
                  hintText: 'Add tag (e.g. Impeller, Rust)...',
                  hintStyle: const TextStyle(color: QuantColors.textMuted, fontSize: 13),
                  filled: true,
                  fillColor: QuantColors.darkSlateCard,
                  isDense: true,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: const BorderSide(color: QuantColors.hairlineBorder),
                  ),
                ),
                onSubmitted: _addTag,
              ),
            ),
            const SizedBox(width: 8),
            ElevatedButton(
              onPressed: () => _addTag(_tagInputController.text),
              style: ElevatedButton.styleFrom(
                backgroundColor: QuantColors.elevatedCard,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                  side: const BorderSide(color: QuantColors.hairlineBorder),
                ),
              ),
              child: const Text('Add Tag'),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: _tags.map((tag) {
            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: QuantColors.hairlineBorder),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '#$tag',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: QuantColors.sovereignCyan,
                    ),
                  ),
                  const SizedBox(width: 4),
                  GestureDetector(
                    onTap: () => _removeTag(tag),
                    child: const Icon(
                      Icons.close_rounded,
                      size: 14,
                      color: Colors.white60,
                    ),
                  ),
                ],
              ),
            );
          }).toList(),
        ),
        const SizedBox(height: 18),

        // Category & Language Row
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Category',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white70),
                  ),
                  const SizedBox(height: 6),
                  _buildDropdownSelector<String>(
                    value: _selectedCategory,
                    items: const ['Coding', 'Gaming', 'AI', 'Music', 'Tech', 'Science', 'Crypto'],
                    onChanged: (val) {
                      if (val != null) setState(() => _selectedCategory = val);
                    },
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Language',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white70),
                  ),
                  const SizedBox(height: 6),
                  _buildDropdownSelector<String>(
                    value: _selectedLanguage,
                    items: const ['English (US)', 'Hindi', 'Spanish', 'German', 'Japanese'],
                    onChanged: (val) {
                      if (val != null) setState(() => _selectedLanguage = val);
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 18),

        // Audience Safe Toggle
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: QuantColors.darkSlateCard,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: QuantColors.hairlineBorder),
          ),
          child: Row(
            children: [
              const Icon(Icons.family_restroom_rounded, color: QuantColors.statusSuccess, size: 22),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Suitable For All Audiences',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white),
                    ),
                    Text(
                      'Does not contain age-restricted or sensitive material',
                      style: TextStyle(fontSize: 11, color: QuantColors.textMuted),
                    ),
                  ],
                ),
              ),
              Switch(
                value: _isAudienceSafe,
                activeColor: QuantColors.statusSuccess,
                onChanged: (v) => setState(() => _isAudienceSafe = v),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ===========================================================================
  // STEP 3: THUMBNAIL FRAME SELECTOR
  // ===========================================================================
  Widget _buildStep3Thumbnail() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader(
          title: '3. Thumbnail Frame Selector',
          subtitle: 'Pick high-contrast timeline frames, trigger AI auto-selection, or upload custom art.',
          icon: Icons.image_search_rounded,
        ),
        const SizedBox(height: 16),

        // Current Selected Thumbnail Preview
        Container(
          height: 180,
          width: double.infinity,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: QuantColors.crimsonRed, width: 2),
            boxShadow: [
              BoxShadow(
                color: QuantColors.crimsonRed.withOpacity(0.2),
                blurRadius: 16,
                offset: const Offset(0, 4),
              ),
            ],
            image: DecorationImage(
              image: NetworkImage(_extractedFrames[_selectedFrameIndex]),
              fit: BoxFit.cover,
            ),
          ),
          child: Stack(
            children: [
              Positioned(
                top: 12,
                left: 12,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: QuantColors.voidObsidian.withOpacity(0.85),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: QuantColors.crimsonRed),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.star_rounded, size: 14, color: QuantColors.moltenAmber),
                      SizedBox(width: 4),
                      Text(
                        'ACTIVE THUMBNAIL (16:9)',
                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.white),
                      ),
                    ],
                  ),
                ),
              ),
              Positioned(
                bottom: 12,
                right: 12,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.black87,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    'Timestamp: 0${_selectedFrameIndex + 2}:14',
                    style: const TextStyle(fontSize: 11, color: Colors.white70, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),

        // AI Auto-Select & Custom Upload Row
        Row(
          children: [
            Expanded(
              child: ElevatedButton.icon(
                onPressed: () {
                  setState(() => _selectedFrameIndex = 0);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('AI Auto-Selected optimal thumbnail frame (highest neural contrast).'),
                    ),
                  );
                },
                icon: const Icon(Icons.auto_awesome_rounded, size: 16, color: QuantColors.moltenAmber),
                label: const Text('AI Auto-Select'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: QuantColors.elevatedCard,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                    side: const BorderSide(color: QuantColors.moltenAmber),
                  ),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Custom Cover Art file picker opened.')),
                  );
                },
                icon: const Icon(Icons.file_upload_outlined, size: 16, color: QuantColors.sovereignCyan),
                label: const Text('Custom Upload'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: QuantColors.sovereignCyan,
                  side: const BorderSide(color: QuantColors.hairlineBorder),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),

        // Extracted Timeline Frames Grid
        const Text(
          'Extracted Video Timeline Frames',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: QuantColors.textPrimary,
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 80,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: _extractedFrames.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (context, idx) {
              final isSelected = idx == _selectedFrameIndex;
              return GestureDetector(
                onTap: () => setState(() => _selectedFrameIndex = idx),
                child: Container(
                  width: 120,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: isSelected ? QuantColors.crimsonRed : QuantColors.hairlineBorder,
                      width: isSelected ? 2.5 : 1,
                    ),
                    image: DecorationImage(
                      image: NetworkImage(_extractedFrames[idx]),
                      fit: BoxFit.cover,
                    ),
                  ),
                  child: isSelected
                      ? Container(
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(8),
                            color: QuantColors.crimsonRed.withOpacity(0.2),
                          ),
                          child: const Center(
                            child: Icon(Icons.check_circle_rounded, color: Colors.white, size: 24),
                          ),
                        )
                      : null,
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 18),

        // A/B Thumbnail Testing Switch
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: QuantColors.darkSlateCard,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: QuantColors.hairlineBorder),
          ),
          child: Row(
            children: [
              const Icon(Icons.compare_rounded, color: QuantColors.sovereignCyan, size: 22),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Enable A/B CTR Thumbnail Experiment',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white),
                    ),
                    Text(
                      'Test 2 variants across initial 10,000 guest impressions',
                      style: TextStyle(fontSize: 11, color: QuantColors.textMuted),
                    ),
                  ],
                ),
              ),
              Switch(
                value: _abTestingEnabled,
                activeColor: QuantColors.sovereignCyan,
                onChanged: (v) => setState(() => _abTestingEnabled = v),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ===========================================================================
  // STEP 4: VISIBILITY & MONETIZATION
  // ===========================================================================
  Widget _buildStep4VisibilityAndMonetization() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader(
          title: '4. Visibility & Sovereign Monetization',
          subtitle: 'Configure public CDN distribution, Quant Credits micro-settlement, and SponsorBlock.',
          icon: Icons.monetization_on_rounded,
        ),
        const SizedBox(height: 16),

        // Visibility Options
        const Text(
          'Distribution & Visibility',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: QuantColors.textPrimary,
          ),
        ),
        const SizedBox(height: 8),
        for (final mode in [
          'Public (Sovereign CDN Edge)',
          'Unlisted (Decentralized CID Link Only)',
          'Private (Key-Encrypted Self-Only)',
        ]) ...[
          GestureDetector(
            onTap: () => setState(() => _visibilityMode = mode),
            child: Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: _visibilityMode == mode
                    ? QuantColors.crimsonRed.withOpacity(0.12)
                    : QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: _visibilityMode == mode ? QuantColors.crimsonRed : QuantColors.hairlineBorder,
                  width: _visibilityMode == mode ? 1.5 : 1,
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    _visibilityMode == mode ? Icons.radio_button_checked : Icons.radio_button_off,
                    color: _visibilityMode == mode ? QuantColors.crimsonRed : Colors.white38,
                    size: 18,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      mode,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: _visibilityMode == mode ? FontWeight.w700 : FontWeight.w500,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
        const SizedBox(height: 16),

        // Quant Credits (QC) Monetization Card
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: QuantColors.darkSlateCard,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: _quantCreditsMonetized
                  ? QuantColors.moltenAmber
                  : QuantColors.hairlineBorder,
              width: 1.2,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.monetization_on_rounded, color: QuantColors.moltenAmber, size: 22),
                      SizedBox(width: 8),
                      Text(
                        'Quant Credits Monetization',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                  Switch(
                    value: _quantCreditsMonetized,
                    activeColor: QuantColors.moltenAmber,
                    onChanged: (v) => setState(() => _quantCreditsMonetized = v),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              const Text(
                'Direct peer-to-peer micro-settlement. 95% revenue to creator with 0% platform extraction.',
                style: TextStyle(fontSize: 12, color: QuantColors.textMuted, height: 1.35),
              ),
              if (_quantCreditsMonetized) ...[
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Estimated CPM Settlement:',
                      style: TextStyle(fontSize: 12, color: Colors.white70),
                    ),
                    Text(
                      '\$${_cpmRate.toStringAsFixed(2)} / 1,000 views (45 QC)',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: QuantColors.moltenAmber,
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),

        // SponsorBlock Segment Detection Opt-In
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: QuantColors.darkSlateCard,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: QuantColors.hairlineBorder),
          ),
          child: Row(
            children: [
              const Icon(Icons.bolt_rounded, color: QuantColors.statusSuccess, size: 22),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'SponsorBlock Automated Indexing',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white),
                    ),
                    Text(
                      'Automatically index chapters, sponsors, and self-promos',
                      style: TextStyle(fontSize: 11, color: QuantColors.textMuted),
                    ),
                  ],
                ),
              ),
              Switch(
                value: _sponsorBlockScanActive,
                activeColor: QuantColors.statusSuccess,
                onChanged: (v) => setState(() => _sponsorBlockScanActive = v),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // License Selector
        const Text(
          'Content Rights & Sovereign Licensing',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: QuantColors.textPrimary,
          ),
        ),
        const SizedBox(height: 8),
        _buildDropdownSelector<String>(
          value: _licenseType,
          items: const [
            'Sovereign Open Attribution (CC-BY-SA 4.0)',
            'Standard Sovereign Creator License (Non-Commercial)',
            'Public Domain Dedication (CC0)',
          ],
          onChanged: (val) {
            if (val != null) setState(() => _licenseType = val);
          },
        ),
      ],
    );
  }

  // ===========================================================================
  // BOTTOM ACTION DOCK
  // ===========================================================================
  Widget _buildBottomActionDock() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        border: Border(top: BorderSide(color: QuantColors.hairlineBorder, width: 1)),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            if (_currentStep > 0) ...[
              OutlinedButton.icon(
                onPressed: _previousStep,
                icon: const Icon(Icons.arrow_back_rounded, size: 18),
                label: const Text('Back'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.white,
                  side: const BorderSide(color: QuantColors.hairlineBorder),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                ),
              ),
              const SizedBox(width: 12),
            ],
            Expanded(
              child: ElevatedButton.icon(
                onPressed: _nextStep,
                icon: Icon(
                  _currentStep == 3 ? Icons.rocket_launch_rounded : Icons.arrow_forward_rounded,
                  size: 18,
                ),
                label: Text(
                  _currentStep == 3 ? 'Publish Sovereign Video' : 'Next Step (${_currentStep + 1}/4)',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: QuantColors.crimsonRed,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionHeader({
    required String title,
    required String subtitle,
    required IconData icon,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: QuantColors.crimsonRed.withOpacity(0.18),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, color: QuantColors.crimsonRed, size: 20),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: QuantColors.textPrimary,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: const TextStyle(
                  fontSize: 12,
                  color: QuantColors.textMuted,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildDropdownSelector<T>({
    required T value,
    required List<T> items,
    required ValueChanged<T?> onChanged,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<T>(
          value: value,
          isExpanded: true,
          dropdownColor: QuantColors.elevatedCard,
          icon: const Icon(Icons.keyboard_arrow_down_rounded, color: Colors.white70),
          style: const TextStyle(color: Colors.white, fontSize: 13),
          items: items.map((item) {
            return DropdownMenuItem<T>(
              value: item,
              child: Text(item.toString()),
            );
          }).toList(),
          onChanged: onChanged,
        ),
      ),
    );
  }
}
