import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/tube_models.dart';
import '../data/tube_repository.dart';

/// Creator Studio Dashboard for QuanTube
/// Quant Credits Revenue Meter, Subscriber Counter, Analytics Chart,
/// Upload Flow, and Copyright Scanner Status.
/// Pure 120Hz Impeller acceleration with zero Skia clipPath.
class ChannelStudioScreen extends StatefulWidget {
  const ChannelStudioScreen({super.key});

  @override
  State<ChannelStudioScreen> createState() => _ChannelStudioScreenState();
}

class _ChannelStudioScreenState extends State<ChannelStudioScreen> {
  late CreatorStudioMetrics _metrics;
  int _selectedChartDay = 6; // Latest day

  // Mock 7-day view telemetry for chart
  final List<double> _weeklyViewsMillions = [1.2, 1.5, 1.4, 2.1, 1.9, 2.6, 3.1];
  final List<String> _weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  @override
  void initState() {
    super.initState();
    _metrics = TubeRepository.getCreatorStudioMetrics();
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

                  // Upload Button Action
                  _buildUploadActionButton(),
                  const SizedBox(height: 20),

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
          Icon(Icons.analytics_rounded, color: QuantColors.crimsonRed, size: 24),
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
        IconButton(
          icon: const Icon(Icons.settings_outlined, color: Colors.white),
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
                      const Icon(
                        Icons.check_circle_rounded,
                        size: 16,
                        color: QuantColors.sovereignCyan,
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  _metrics.handle,
                  style: const TextStyle(
                    fontSize: 13,
                    color: QuantColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: QuantColors.statusSuccess.withOpacity(0.12),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: QuantColors.statusSuccess.withOpacity(0.3), width: 0.8),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.bolt_rounded, size: 14, color: QuantColors.statusSuccess),
                SizedBox(width: 4),
                Text(
                  'PARTNER ACTIVE',
                  style: TextStyle(
                    fontSize: 10,
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

  Widget _buildRevenueMeterCard() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.moltenAmber.withOpacity(0.4), width: 1.2),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            QuantColors.darkSlateCard,
            QuantColors.moltenAmber.withOpacity(0.08),
          ],
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
                  Icon(Icons.monetization_on_rounded, color: QuantColors.moltenAmber, size: 20),
                  SizedBox(width: 8),
                  Text(
                    'Quant Credits Revenue Meter',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: QuantColors.moltenAmber,
                      letterSpacing: 0.3,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: QuantColors.statusSuccess.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text(
                  '+28.4% this month',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: QuantColors.statusSuccess,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                _metrics.formattedQuantCredits,
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w900,
                  color: QuantColors.textPrimary,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(width: 10),
              Text(
                '≈ ${_metrics.formattedMonthlyRevenue} USD',
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: QuantColors.textSecondary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Payout Tier Progress Bar
          const Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Monthly Disbursement Tier (25,000 QC)',
                style: TextStyle(fontSize: 11, color: QuantColors.textMuted),
              ),
              Text(
                '74%',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: QuantColors.moltenAmber),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: 0.74,
              backgroundColor: QuantColors.voidObsidian,
              valueColor: const AlwaysStoppedAnimation<Color>(QuantColors.moltenAmber),
              minHeight: 8,
            ),
          ),
          const SizedBox(height: 16),

          // Instant Cashout Button
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Instant QC Cashout initiated to Sovereign Vault'),
                  ),
                );
              },
              icon: const Icon(Icons.account_balance_wallet_rounded, size: 16),
              label: const Text('Instant Settlement / Cashout'),
              style: ElevatedButton.styleFrom(
                backgroundColor: QuantColors.moltenAmber,
                foregroundColor: Colors.black,
                elevation: 0,
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
                textStyle: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Real-Time Channel Reach',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: QuantColors.textSecondary,
                ),
              ),
              Row(
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      color: QuantColors.crimsonRed,
                    ),
                  ),
                  const SizedBox(width: 6),
                  const Text(
                    'LIVE PULSE',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      color: QuantColors.crimsonRed,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _buildMetricTile(
                  label: 'Subscribers',
                  value: _metrics.formattedSubscribers,
                  delta: '+14.2K this week',
                  icon: Icons.people_alt_rounded,
                  accentColor: QuantColors.crimsonRed,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildMetricTile(
                  label: 'Total Views',
                  value: '48.2M',
                  delta: '+1.8M past 28d',
                  icon: Icons.play_circle_fill_rounded,
                  accentColor: QuantColors.sovereignCyan,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMetricTile({
    required String label,
    required String value,
    required String delta,
    required IconData icon,
    required Color accentColor,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: QuantColors.voidObsidian,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: QuantColors.hairlineBorder, width: 0.8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 16, color: accentColor),
              const SizedBox(width: 6),
              Text(
                label,
                style: const TextStyle(fontSize: 11, color: QuantColors.textMuted),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: QuantColors.textPrimary,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            delta,
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: QuantColors.statusSuccess,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAnalyticsChartCard() {
    final maxViews = _weeklyViewsMillions.reduce((a, b) => a > b ? a : b);

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
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                '7-Day View Velocity',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: QuantColors.textPrimary,
                ),
              ),
              Text(
                '${_weeklyViewsMillions[_selectedChartDay]}M views on ${_weekDays[_selectedChartDay]}',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: QuantColors.sovereignCyan,
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),

          // Custom 7-Day Vertical Bar Chart
          SizedBox(
            height: 130,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: List.generate(_weeklyViewsMillions.length, (index) {
                final heightFactor = _weeklyViewsMillions[index] / maxViews;
                final isSelected = index == _selectedChartDay;

                return GestureDetector(
                  onTap: () {
                    setState(() {
                      _selectedChartDay = index;
                    });
                  },
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 250),
                        width: 26,
                        height: 95 * heightFactor,
                        decoration: BoxDecoration(
                          color: isSelected
                              ? QuantColors.crimsonRed
                              : QuantColors.hairlineBorder,
                          borderRadius: BorderRadius.circular(6),
                          boxShadow: isSelected
                              ? [
                                  BoxShadow(
                                    color: QuantColors.crimsonRed.withOpacity(0.4),
                                    blurRadius: 8,
                                    offset: const Offset(0, 2),
                                  ),
                                ]
                              : null,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _weekDays[index],
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                          color: isSelected ? Colors.white : QuantColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                );
              }),
            ),
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
        border: Border.all(color: QuantColors.statusSuccess.withOpacity(0.4), width: 1),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: QuantColors.statusSuccess.withOpacity(0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(
              Icons.verified_user_rounded,
              color: QuantColors.statusSuccess,
              size: 26,
            ),
          ),
          const SizedBox(width: 14),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Sovereign CID Scanner Status',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: QuantColors.textPrimary,
                  ),
                ),
                SizedBox(height: 4),
                Text(
                  'Clean • Zero Strikes • 100% Cryptographic Match',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: QuantColors.statusSuccess,
                  ),
                ),
                SizedBox(height: 4),
                Text(
                  'All uploads verified against decentralized media hash registry. Zero false-positive DMCA or revenue hijack risk.',
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
                        style: const TextStyle(
                          fontSize: 11,
                          color: QuantColors.textMuted,
                        ),
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
    bool monetize = true;
    bool autoSkipScan = true;

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

                  // Title Input
                  const TextField(
                    decoration: InputDecoration(
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
                    style: TextStyle(color: Colors.white, fontSize: 14),
                  ),
                  const SizedBox(height: 14),

                  // Category Selector
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
                  const SizedBox(height: 10),

                  // SponsorBlock Scan Toggle
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text(
                      'Automated SponsorBlock Markers Detection',
                      style: TextStyle(fontSize: 13, color: QuantColors.textPrimary),
                    ),
                    subtitle: const Text(
                      'AI flags intro, sponsor, and outro timestamps automatically',
                      style: TextStyle(fontSize: 11, color: QuantColors.textMuted),
                    ),
                    value: autoSkipScan,
                    activeColor: QuantColors.crimsonRed,
                    onChanged: (val) => setModalState(() => autoSkipScan = val),
                  ),

                  // Monetize QC Toggle
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text(
                      'Quant Credits Monetization',
                      style: TextStyle(fontSize: 13, color: QuantColors.textPrimary),
                    ),
                    subtitle: const Text(
                      'Receive instant QC per-view micro-settlement',
                      style: TextStyle(fontSize: 11, color: QuantColors.textMuted),
                    ),
                    value: monetize,
                    activeColor: QuantColors.moltenAmber,
                    onChanged: (val) => setModalState(() => monetize = val),
                  ),
                  const SizedBox(height: 16),

                  // Submit Upload
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.pop(context);
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Video queued for sovereign transcoding & CID verification'),
                          ),
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: QuantColors.crimsonRed,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      child: const Text('Start Upload & Verify CID'),
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
