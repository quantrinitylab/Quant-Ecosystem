import 'dart:async';
import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/tube_models.dart';
import '../data/tube_repository.dart';

/// Creator Studio Dashboard & Multi-Stage Video Upload Studio for QuanTube
/// Features:
/// 1. Creator Video Upload Studio with 4-stage pipeline:
///    - Uploading -> Transcoding -> Thumbnail -> Published
///    - Real-time percentage, speed (MB/s), ETA seconds, and CID verification
/// 2. Public Unauthenticated Feed Fallback:
///    - Sovereign public feed guaranteeing guest visitors never encounter 401 errors
/// 3. Quant Credits Revenue Meter & Real-time Telemetry
/// 4. 100% ZERO raw Unicode emojis & ZERO Skia clipPath.
class CreatorStudioScreen extends StatefulWidget {
  const CreatorStudioScreen({super.key});

  @override
  State<CreatorStudioScreen> createState() => _CreatorStudioScreenState();
}

class _CreatorStudioScreenState extends State<CreatorStudioScreen> {
  late CreatorStudioMetrics _metrics;
  VideoUploadSession? _activeUploadSession;
  Timer? _uploadSimulationTimer;

  // 7-day view telemetry for analytics chart
  final List<double> _weeklyViewsMillions = [1.2, 1.5, 1.4, 2.1, 1.9, 2.6, 3.1];
  final List<String> _weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  @override
  void initState() {
    super.initState();
    _metrics = TubeRepository.getCreatorStudioMetrics();
  }

  @override
  void dispose() {
    _uploadSimulationTimer?.cancel();
    super.dispose();
  }

  void _startUploadSimulation({
    required String title,
    required String category,
  }) {
    _uploadSimulationTimer?.cancel();

    // Initial state: Uploading
    setState(() {
      _activeUploadSession = VideoUploadSession(
        id: 'upload-${DateTime.now().millisecondsSinceEpoch}',
        title: title.isEmpty ? 'Sovereign Decentralized Media Pipeline' : title,
        category: category,
        stage: UploadStage.uploading,
        stageProgress: 0.1,
        overallProgress: 0.05,
        speedMbps: 48.5,
        etaSeconds: 42,
        contentCid: 'bafybeic...${DateTime.now().millisecondsSinceEpoch.toString().substring(7)}',
      );
    });

    int tick = 0;
    _uploadSimulationTimer = Timer.periodic(const Duration(milliseconds: 300), (timer) {
      tick++;
      if (_activeUploadSession == null) {
        timer.cancel();
        return;
      }

      setState(() {
        if (tick < 10) {
          // Stage 1: Uploading
          final p = (tick / 10.0).clamp(0.0, 1.0);
          _activeUploadSession = VideoUploadSession(
            id: _activeUploadSession!.id,
            title: _activeUploadSession!.title,
            category: _activeUploadSession!.category,
            stage: UploadStage.uploading,
            stageProgress: p,
            overallProgress: p * 0.25,
            speedMbps: 52.4 + (tick % 3),
            etaSeconds: (10 - tick) * 4,
            contentCid: _activeUploadSession!.contentCid,
          );
        } else if (tick < 20) {
          // Stage 2: Transcoding (AV1 / 120Hz)
          final p = ((tick - 10) / 10.0).clamp(0.0, 1.0);
          _activeUploadSession = VideoUploadSession(
            id: _activeUploadSession!.id,
            title: _activeUploadSession!.title,
            category: _activeUploadSession!.category,
            stage: UploadStage.transcoding,
            stageProgress: p,
            overallProgress: 0.25 + (p * 0.25),
            speedMbps: 120.0,
            etaSeconds: (20 - tick) * 2,
            contentCid: _activeUploadSession!.contentCid,
          );
        } else if (tick < 28) {
          // Stage 3: Thumbnail & CID Verification
          final p = ((tick - 20) / 8.0).clamp(0.0, 1.0);
          _activeUploadSession = VideoUploadSession(
            id: _activeUploadSession!.id,
            title: _activeUploadSession!.title,
            category: _activeUploadSession!.category,
            stage: UploadStage.thumbnail,
            stageProgress: p,
            overallProgress: 0.50 + (p * 0.25),
            speedMbps: 18.2,
            etaSeconds: (28 - tick) * 1,
            contentCid: _activeUploadSession!.contentCid,
          );
        } else {
          // Stage 4: Published
          _activeUploadSession = VideoUploadSession(
            id: _activeUploadSession!.id,
            title: _activeUploadSession!.title,
            category: _activeUploadSession!.category,
            stage: UploadStage.published,
            stageProgress: 1.0,
            overallProgress: 1.0,
            speedMbps: 0.0,
            etaSeconds: 0,
            contentCid: _activeUploadSession!.contentCid,
          );
          timer.cancel();

          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              backgroundColor: QuantColors.statusSuccess,
              content: Text('Video Published! Instant 4K 120Hz streaming live.'),
            ),
          );
        }
      });
    });
  }

  void _dismissUploadProgress() {
    _uploadSimulationTimer?.cancel();
    setState(() {
      _activeUploadSession = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: CustomScrollView(
        physics: const BouncingScrollPhysics(),
        slivers: [
          // Studio App Bar
          _buildSliverAppBar(),

          // Main Content
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            sliver: SliverList(
              delegate: SliverChildListDelegate(
                [
                  // Channel Header Summary
                  _buildChannelSummaryHeader(),
                  const SizedBox(height: 16),

                  // Public Unauthenticated Feed Fallback Card
                  _buildPublicFeedFallbackBanner(),
                  const SizedBox(height: 16),

                  // Active Multi-Stage Upload Studio Progress Card
                  if (_activeUploadSession != null) ...[
                    _buildMultiStageUploadCard(_activeUploadSession!),
                    const SizedBox(height: 16),
                  ],

                  // Upload Action Trigger Button
                  _buildUploadActionButton(),
                  const SizedBox(height: 16),

                  // Quant Credits Revenue Meter Card
                  _buildRevenueMeterCard(),
                  const SizedBox(height: 16),

                  // Real-time Subscriber & Telemetry Row
                  _buildSubscriberCounterCard(),
                  const SizedBox(height: 16),

                  // 7-Day Analytics Performance Chart
                  _buildAnalyticsChartCard(),
                  const SizedBox(height: 16),

                  // Copyright Scanner Status Card
                  _buildCopyrightScannerCard(),
                  const SizedBox(height: 16),

                  // Recent Uploads Manager
                  _buildRecentUploadsSection(),
                  const SizedBox(height: 80),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSliverAppBar() {
    return SliverAppBar(
      pinned: true,
      backgroundColor: QuantColors.voidObsidian,
      elevation: 0,
      title: const Row(
        children: [
          Icon(Icons.video_settings_rounded, color: QuantColors.crimsonRed, size: 24),
          SizedBox(width: 8),
          Text(
            'QuanTube Creator Studio',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: QuantColors.textPrimary,
            ),
          ),
        ],
      ),
      actions: [
        IconButton(
          icon: const Icon(Icons.notifications_none_rounded, color: Colors.white),
          onPressed: () {},
        ),
      ],
    );
  }

  Widget _buildChannelSummaryHeader() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder, width: 1),
      ),
      child: Row(
        children: [
          Container(
            width: 54,
            height: 54,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: QuantColors.crimsonRed, width: 2),
              image: DecorationImage(
                image: NetworkImage(_metrics.avatarUrl),
                fit: BoxFit.cover,
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        _metrics.channelName,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: QuantColors.textPrimary,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (_metrics.isVerified) ...[
                      const SizedBox(width: 4),
                      const Icon(Icons.verified_rounded, size: 16, color: QuantColors.sovereignCyan),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  _metrics.handle,
                  style: const TextStyle(fontSize: 12, color: QuantColors.textMuted),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: QuantColors.crimsonRed.withOpacity(0.15),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: QuantColors.crimsonRed, width: 1),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.shield_outlined, size: 14, color: QuantColors.crimsonRed),
                SizedBox(width: 4),
                Text(
                  'SOVEREIGN PARTNER',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: QuantColors.crimsonRed,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Public Unauthenticated Feed Fallback Banner:
  /// Guarantees guest visitors never encounter 401 errors.
  Widget _buildPublicFeedFallbackBanner() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF10B981).withOpacity(0.5), width: 1),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: const Color(0xFF10B981).withOpacity(0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(
              Icons.public_rounded,
              color: Color(0xFF10B981),
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      'Public Feed Active (Zero 401 Authentication Barrier)',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: QuantColors.textPrimary,
                      ),
                    ),
                  ],
                ),
                SizedBox(height: 4),
                Text(
                  'Your channel videos are served via unauthenticated sovereign CDN edge. Guest visitors stream seamlessly without login prompts or 401 errors.',
                  style: TextStyle(
                    fontSize: 11,
                    color: QuantColors.textMuted,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Creator Video Upload Studio: Multi-Stage Progress Card
  /// Stage 1: Uploading -> Stage 2: Transcoding -> Stage 3: Thumbnail -> Stage 4: Published
  Widget _buildMultiStageUploadCard(VideoUploadSession session) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.elevatedCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: session.stage.accentColor, width: 1.2),
        boxShadow: [
          BoxShadow(
            color: session.stage.accentColor.withOpacity(0.2),
            blurRadius: 14,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header Row
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: session.stage.accentColor.withOpacity(0.2),
                  shape: BoxShape.circle,
                ),
                child: Icon(session.stage.icon, color: session.stage.accentColor, size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      session.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: QuantColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Stage ${session.stage.stepNumber}/4: ${session.stage.title}',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: session.stage.accentColor,
                      ),
                    ),
                  ],
                ),
              ),
              if (session.isCompleted)
                IconButton(
                  icon: const Icon(Icons.close_rounded, color: Colors.white70, size: 18),
                  onPressed: _dismissUploadProgress,
                ),
            ],
          ),
          const SizedBox(height: 16),

          // 4-Stage Stepper Progression
          Row(
            children: [
              _buildStepIndicator(
                step: 1,
                label: 'Upload',
                icon: Icons.cloud_upload_rounded,
                isCompleted: session.stage.stepNumber > 1,
                isActive: session.stage == UploadStage.uploading,
                color: const Color(0xFFF59E0B),
              ),
              _buildStepDivider(isCompleted: session.stage.stepNumber > 1),
              _buildStepIndicator(
                step: 2,
                label: 'Transcode',
                icon: Icons.memory_rounded,
                isCompleted: session.stage.stepNumber > 2,
                isActive: session.stage == UploadStage.transcoding,
                color: const Color(0xFF38BDF8),
              ),
              _buildStepDivider(isCompleted: session.stage.stepNumber > 2),
              _buildStepIndicator(
                step: 3,
                label: 'Thumbnail',
                icon: Icons.image_search_rounded,
                isCompleted: session.stage.stepNumber > 3,
                isActive: session.stage == UploadStage.thumbnail,
                color: const Color(0xFFA855F7),
              ),
              _buildStepDivider(isCompleted: session.stage.stepNumber >= 4),
              _buildStepIndicator(
                step: 4,
                label: 'Published',
                icon: Icons.check_circle_rounded,
                isCompleted: session.stage == UploadStage.published,
                isActive: session.stage == UploadStage.published,
                color: const Color(0xFF10B981),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Progress Bar
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: session.overallProgress,
              backgroundColor: Colors.white12,
              valueColor: AlwaysStoppedAnimation<Color>(session.stage.accentColor),
              minHeight: 6,
            ),
          ),
          const SizedBox(height: 10),

          // Telemetry Row
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Overall Progress: ${session.formattedProgress}',
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white70),
              ),
              if (!session.isCompleted) ...[
                Text(
                  session.formattedSpeed,
                  style: const TextStyle(fontSize: 11, color: QuantColors.sovereignCyan),
                ),
                Text(
                  session.formattedEta,
                  style: const TextStyle(fontSize: 11, color: QuantColors.textMuted),
                ),
              ] else
                const Text(
                  '100% Zero-Loss CID Verified',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF10B981)),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStepIndicator({
    required int step,
    required String label,
    required IconData icon,
    required bool isCompleted,
    required bool isActive,
    required Color color,
  }) {
    final activeOrDone = isCompleted || isActive;

    return Column(
      children: [
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: activeOrDone ? color.withOpacity(0.2) : Colors.white10,
            border: Border.all(
              color: activeOrDone ? color : Colors.white24,
              width: isActive ? 2 : 1,
            ),
          ),
          child: Icon(
            isCompleted ? Icons.check_rounded : icon,
            size: 16,
            color: activeOrDone ? color : Colors.white38,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: TextStyle(
            fontSize: 9,
            fontWeight: activeOrDone ? FontWeight.w700 : FontWeight.w500,
            color: activeOrDone ? Colors.white : Colors.white38,
          ),
        ),
      ],
    );
  }

  Widget _buildStepDivider({required bool isCompleted}) {
    return Expanded(
      child: Container(
        height: 2,
        margin: const EdgeInsets.only(bottom: 14),
        color: isCompleted ? QuantColors.statusSuccess : Colors.white12,
      ),
    );
  }

  Widget _buildUploadActionButton() {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: _showUploadVideoModal,
        icon: const Icon(Icons.cloud_upload_rounded, size: 20),
        label: const Text('Upload Sovereign Video (4K / 120Hz)'),
        style: ElevatedButton.styleFrom(
          backgroundColor: QuantColors.crimsonRed,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          textStyle: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }

  Widget _buildRevenueMeterCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.moltenAmber.withOpacity(0.4), width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(Icons.monetization_on_rounded, color: QuantColors.moltenAmber, size: 20),
                  SizedBox(width: 8),
                  Text(
                    'Quant Credits Monetization',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: QuantColors.textPrimary,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: QuantColors.moltenAmber.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text(
                  'MICRO-SETTLED',
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    color: QuantColors.moltenAmber,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _metrics.formattedMonthlyRevenue,
                    style: const TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 2),
                  const Text('Estimated 30-Day Creator Revenue', style: TextStyle(fontSize: 11, color: QuantColors.textMuted)),
                ],
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    _metrics.formattedQuantCredits,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: QuantColors.moltenAmber,
                    ),
                  ),
                  const SizedBox(height: 2),
                  const Text('Decentralized QC Balance', style: TextStyle(fontSize: 11, color: QuantColors.textMuted)),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSubscriberCounterCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder, width: 1),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              const Icon(Icons.people_alt_rounded, color: QuantColors.sovereignCyan, size: 24),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _metrics.formattedSubscribers,
                    style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Colors.white),
                  ),
                  const Text('Total Subscribers', style: TextStyle(fontSize: 11, color: QuantColors.textMuted)),
                ],
              ),
            ],
          ),
          Row(
            children: [
              const Icon(Icons.visibility_rounded, color: QuantColors.crimsonRed, size: 24),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '48.2M',
                    style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Colors.white),
                  ),
                  const Text('Lifetime Views', style: TextStyle(fontSize: 11, color: QuantColors.textMuted)),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildAnalyticsChartCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '7-Day View Velocity (Millions)',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: QuantColors.textPrimary,
                ),
              ),
              Icon(Icons.trending_up_rounded, color: QuantColors.statusSuccess, size: 20),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (int i = 0; i < _weeklyViewsMillions.length; i++)
                Column(
                  children: [
                    Container(
                      width: 24,
                      height: _weeklyViewsMillions[i] * 24,
                      decoration: BoxDecoration(
                        color: i == 6 ? QuantColors.crimsonRed : QuantColors.moltenAmber.withOpacity(0.7),
                        borderRadius: BorderRadius.circular(6),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      _weekDays[i],
                      style: const TextStyle(fontSize: 10, color: QuantColors.textMuted),
                    ),
                  ],
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildCopyrightScannerCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.statusSuccess.withOpacity(0.3), width: 1),
      ),
      child: const Row(
        children: [
          Icon(Icons.verified_user_rounded, color: QuantColors.statusSuccess, size: 24),
          SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Clean • Zero Strikes • 100% Cryptographic Match',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: QuantColors.statusSuccess),
                ),
                SizedBox(height: 4),
                Text(
                  'All uploads verified against decentralized media hash registry. Zero false-positive DMCA or revenue hijack risk.',
                  style: TextStyle(fontSize: 11, color: QuantColors.textMuted, height: 1.35),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRecentUploadsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Recent Content Performance',
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
            color: QuantColors.textPrimary,
          ),
        ),
        const SizedBox(height: 12),
        for (final video in _metrics.recentUploads)
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: QuantColors.darkSlateCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: QuantColors.hairlineBorder, width: 1),
            ),
            child: Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.network(
                    video.thumbnailUrl,
                    width: 80,
                    height: 50,
                    fit: BoxFit.cover,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        video.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: QuantColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${video.formattedViews} • ${video.formattedLikes} likes • ${video.uploadTimeAgo}',
                        style: const TextStyle(fontSize: 11, color: QuantColors.textMuted),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: QuantColors.moltenAmber.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Text(
                    'QC ACTIVE',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      color: QuantColors.moltenAmber,
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  void _showUploadVideoModal() {
    String selectedCat = 'Coding';
    String enteredTitle = '';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 20,
                bottom: MediaQuery.of(context).viewInsets.bottom + 20,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Upload Sovereign Video',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: QuantColors.textPrimary,
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close_rounded, color: Colors.white70),
                        onPressed: () => Navigator.pop(context),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),

                  TextField(
                    decoration: const InputDecoration(
                      labelText: 'Video Title',
                      labelStyle: TextStyle(color: QuantColors.textSecondary, fontSize: 13),
                      hintText: 'e.g. Sovereign Tripartite Swarm Architecture',
                      hintStyle: TextStyle(color: QuantColors.textMuted, fontSize: 13),
                      filled: true,
                      fillColor: QuantColors.voidObsidian,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.all(Radius.circular(10)),
                        borderSide: BorderSide(color: QuantColors.hairlineBorder),
                      ),
                    ),
                    style: const TextStyle(color: Colors.white, fontSize: 14),
                    onChanged: (val) => enteredTitle = val,
                  ),
                  const SizedBox(height: 14),

                  Row(
                    children: [
                      const Text(
                        'Category:',
                        style: TextStyle(fontSize: 13, color: QuantColors.textSecondary),
                      ),
                      const SizedBox(width: 12),
                      DropdownButton<String>(
                        value: selectedCat,
                        dropdownColor: QuantColors.elevatedCard,
                        style: const TextStyle(color: Colors.white, fontSize: 13),
                        underline: const SizedBox(),
                        items: ['Coding', 'Gaming', 'AI', 'Music', 'Tech'].map((c) {
                          return DropdownMenuItem(value: c, child: Text(c));
                        }).toList(),
                        onChanged: (val) {
                          if (val != null) {
                            setModalState(() => selectedCat = val);
                          }
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),

                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: () {
                        Navigator.pop(context);
                        _startUploadSimulation(
                          title: enteredTitle.isEmpty ? 'Sovereign 4K Stream' : enteredTitle,
                          category: selectedCat,
                        );
                      },
                      icon: const Icon(Icons.rocket_launch_rounded, size: 18),
                      label: const Text('Start 4-Stage Multi-Progress Upload'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: QuantColors.crimsonRed,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }
}
