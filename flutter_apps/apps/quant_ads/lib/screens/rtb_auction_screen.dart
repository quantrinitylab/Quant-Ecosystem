// Sovereign Quant Ecosystem - QuantAds Live RTB Auction Monitoring Dashboard
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../models/ads_models.dart';
import '../services/ads_mock_data.dart';

class RtbAuctionScreen extends StatefulWidget {
  const RtbAuctionScreen({super.key});

  @override
  State<RtbAuctionScreen> createState() => _RtbAuctionScreenState();
}

class _RtbAuctionScreenState extends State<RtbAuctionScreen> {
  late AuctionTelemetry _telemetry;
  late List<RtbBidEvent> _bidStream;
  late List<EcpmHeatmapCell> _heatmapCells;
  late List<DspLatencyMetric> _dspLatencies;
  late List<WaterfallTier> _waterfallTiers;
  double _floorPrice = 1.50;

  static const Color adsAmber = Color(0xFFF59E0B);
  static const Color sovereignCyan = Color(0xFF38BDF8);

  final List<String> _days = const ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  final List<String> _hours = const ['00-04', '04-08', '08-12', '12-16', '16-20', '20-24'];

  @override
  void initState() {
    super.initState();
    _telemetry = AdsMockData.getInitialAuctionTelemetry();
    _bidStream = AdsMockData.getRecentBidStream();
    _heatmapCells = AdsMockData.getHeatmapData();
    _dspLatencies = AdsMockData.getDspLatencyMetrics();
    _waterfallTiers = AdsMockData.getWaterfallTiers();
    _floorPrice = _telemetry.floorPrice;
  }

  void _simulateNewBid() {
    final now = DateTime.now();
    final newBid = RtbBidEvent(
      id: 'bid-${now.millisecondsSinceEpoch.toString().substring(8)}',
      bidderName: 'Sovereign Direct DSP',
      latencyMs: (3.2 + (now.millisecond % 45) / 10).clamp(3.0, 7.8),
      bidPriceEcpm: 5.20 + (now.millisecond % 20) / 10,
      winningPriceEcpm: 4.85,
      adFormat: 'Rewarded Video',
      outcome: BidOutcome.won,
      slotId: 'slot-gram-feed-01',
      timestamp: now,
    );

    setState(() {
      _bidStream.insert(0, newBid);
      if (_bidStream.length > 20) {
        _bidStream.removeLast();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top Live Telemetry Capsule (<18ms Hard SLA)
            _buildLiveStatusBanner(),

            const SizedBox(height: 16),

            // Win-Rate Telemetry Gauges Grid (QPS, p99 Latency, Avg eCPM, Win Rate)
            _buildTelemetryGauges(),

            const SizedBox(height: 20),

            // DSP Latency Bar Chart (<18ms SLA Visualizer)
            _buildDspLatencyBarChartSection(),

            const SizedBox(height: 20),

            // Bid Waterfall Graph (Tiers 0 through 4)
            _buildBidWaterfallSection(),

            const SizedBox(height: 20),

            // Interactive Floor Price Controls & Slider
            _buildFloorPriceControls(),

            const SizedBox(height: 20),

            // eCPM Heatmap Matrix
            _buildEcpmHeatmapSection(),

            const SizedBox(height: 20),

            // Live Real-Time Bidding Stream Feed
            _buildBidStreamSection(),

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _buildLiveStatusBanner() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  color: QuantColors.statusSuccess,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: QuantColors.statusSuccess.withOpacity(0.6),
                      blurRadius: 6,
                      spreadRadius: 1,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Text(
                'OpenRTB 3.0 Engine: Sovereign Bidding Active',
                style: TextStyle(
                  color: QuantColors.textPrimary,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          Row(
            children: [
              IconButton(
                constraints: const BoxConstraints(),
                padding: EdgeInsets.zero,
                icon: const Icon(Icons.flash_on_rounded, color: adsAmber, size: 18),
                tooltip: 'Simulate Incoming Bid',
                onPressed: _simulateNewBid,
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: sovereignCyan.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text(
                  '48 Active DSPs',
                  style: TextStyle(
                    color: sovereignCyan,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTelemetryGauges() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: _buildGaugeItem(
                  title: 'Throughput',
                  value: '${(_telemetry.qps / 1000).toStringAsFixed(1)}K',
                  unit: 'QPS',
                  statusColor: QuantColors.statusSuccess,
                  icon: Icons.speed_rounded,
                ),
              ),
              Container(width: 1, height: 44, color: QuantColors.subtleDivider),
              Expanded(
                child: _buildGaugeItem(
                  title: 'p99 Latency',
                  value: '${_telemetry.p99LatencyMs}',
                  unit: 'ms',
                  statusColor: adsAmber,
                  subtext: '< 18ms SLA',
                  icon: Icons.timer_outlined,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Divider(color: QuantColors.subtleDivider, height: 1),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _buildGaugeItem(
                  title: 'Average eCPM',
                  value: '\$${_telemetry.averageEcpm.toStringAsFixed(2)}',
                  unit: '',
                  statusColor: sovereignCyan,
                  icon: Icons.payments_rounded,
                ),
              ),
              Container(width: 1, height: 44, color: QuantColors.subtleDivider),
              Expanded(
                child: _buildGaugeItem(
                  title: 'Win Rate Gauge',
                  value: '${_telemetry.winRatePercent}%',
                  unit: '',
                  statusColor: QuantColors.statusSuccess,
                  subtext: 'High Yield',
                  icon: Icons.check_circle_outline_rounded,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildGaugeItem({
    required String title,
    required String value,
    required String unit,
    required Color statusColor,
    required IconData icon,
    String? subtext,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: QuantColors.textMuted, size: 14),
              const SizedBox(width: 4),
              Text(
                title,
                style: const TextStyle(
                  color: QuantColors.textMuted,
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                value,
                style: TextStyle(
                  color: statusColor,
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                ),
              ),
              if (unit.isNotEmpty) ...[
                const SizedBox(width: 3),
                Text(
                  unit,
                  style: const TextStyle(
                    color: QuantColors.textSecondary,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
              if (subtext != null) ...[
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                  decoration: BoxDecoration(
                    color: adsAmber.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    subtext,
                    style: const TextStyle(
                      color: adsAmber,
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildDspLatencyBarChartSection() {
    const double maxSlaMs = 18.0;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(Icons.bar_chart_rounded, color: sovereignCyan, size: 18),
                  SizedBox(width: 6),
                  Text(
                    'DSP Latency Benchmarks',
                    style: TextStyle(
                      color: QuantColors.textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: QuantColors.statusSuccess.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  '< 18ms SLA Guarantee',
                  style: TextStyle(
                    color: QuantColors.statusSuccess,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            'Edge auctioneer resolves RTB bids within SLA before client frame execution.',
            style: TextStyle(color: QuantColors.textMuted, fontSize: 11),
          ),
          const SizedBox(height: 16),
          Column(
            children: _dspLatencies.map((dsp) {
              final ratio = (dsp.latencyMs / maxSlaMs).clamp(0.05, 1.0);
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          dsp.dspName,
                          style: const TextStyle(
                            color: QuantColors.textPrimary,
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Row(
                          children: [
                            Text(
                              '${dsp.latencyMs.toStringAsFixed(1)} ms',
                              style: TextStyle(
                                color: dsp.barColor,
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              'Win: ${dsp.winRatePercent.toStringAsFixed(0)}%',
                              style: const TextStyle(
                                color: QuantColors.textMuted,
                                fontSize: 10,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Stack(
                      children: [
                        Container(
                          height: 8,
                          decoration: BoxDecoration(
                            color: QuantColors.subtleDivider,
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ),
                        FractionallySizedBox(
                          widthFactor: ratio,
                          child: Container(
                            height: 8,
                            decoration: BoxDecoration(
                              color: dsp.barColor,
                              borderRadius: BorderRadius.circular(4),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('0ms', style: TextStyle(color: QuantColors.textMuted, fontSize: 9)),
              const Text('9ms (Median)', style: TextStyle(color: QuantColors.textMuted, fontSize: 9)),
              Text('18ms SLA Limit', style: TextStyle(color: adsAmber.withOpacity(0.9), fontSize: 9, fontWeight: FontWeight.w700)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildBidWaterfallSection() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(Icons.waterfall_chart_rounded, color: adsAmber, size: 18),
                  SizedBox(width: 6),
                  Text(
                    'Bid Waterfall Graph',
                    style: TextStyle(
                      color: QuantColors.textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: adsAmber.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  '5-Tier Priority Cascade',
                  style: TextStyle(
                    color: adsAmber,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            'Autonomous mediation router dynamically maximizes publisher yield across programmatic tiers.',
            style: TextStyle(color: QuantColors.textMuted, fontSize: 11),
          ),
          const SizedBox(height: 14),
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _waterfallTiers.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final tier = _waterfallTiers[index];
              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: QuantColors.elevatedCard,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: tier.tierColor.withOpacity(0.3)),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 24,
                      height: 24,
                      decoration: BoxDecoration(
                        color: tier.tierColor.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Center(
                        child: Text(
                          'P${tier.priority}',
                          style: TextStyle(
                            color: tier.tierColor,
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            tier.tierName,
                            style: const TextStyle(
                              color: QuantColors.textPrimary,
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Floor: \$${tier.floorEcpm.toStringAsFixed(2)} • ${tier.dspCount} DSPs connected',
                            style: const TextStyle(
                              color: QuantColors.textMuted,
                              fontSize: 10,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          '${tier.fillRatePercent.toStringAsFixed(1)}% Fill',
                          style: TextStyle(
                            color: tier.tierColor,
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        Text(
                          '+\$${tier.yieldAmount.toStringAsFixed(0)} Yield',
                          style: const TextStyle(
                            color: QuantColors.statusSuccess,
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildFloorPriceControls() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(Icons.tune_rounded, color: adsAmber, size: 18),
                  SizedBox(width: 6),
                  Text(
                    'Floor Price Optimization',
                    style: TextStyle(
                      color: QuantColors.textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              Text(
                '\$${_floorPrice.toStringAsFixed(2)} / eCPM',
                style: const TextStyle(
                  color: adsAmber,
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            'Dynamic AI Floor adjusts minimum bid price dynamically based on publisher audience density & ad format.',
            style: TextStyle(color: QuantColors.textMuted, fontSize: 11),
          ),
          const SizedBox(height: 12),
          SliderTheme(
            data: SliderThemeData(
              activeTrackColor: adsAmber,
              inactiveTrackColor: QuantColors.subtleDivider,
              thumbColor: adsAmber,
              overlayColor: adsAmber.withOpacity(0.2),
              trackHeight: 4,
            ),
            child: Slider(
              value: _floorPrice,
              min: 0.50,
              max: 5.00,
              divisions: 45,
              onChanged: (val) {
                setState(() {
                  _floorPrice = val;
                  _telemetry = _telemetry.copyWith(floorPrice: val);
                });
              },
            ),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Conservative (\$0.50)',
                style: TextStyle(color: QuantColors.textMuted, fontSize: 10),
              ),
              Text(
                'Yield Index: ${(100 + (_floorPrice * 8)).toInt()}%',
                style: const TextStyle(
                  color: QuantColors.statusSuccess,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const Text(
                'Aggressive (\$5.00)',
                style: TextStyle(color: QuantColors.textMuted, fontSize: 10),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildEcpmHeatmapSection() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(Icons.grid_view_rounded, color: sovereignCyan, size: 18),
                  SizedBox(width: 6),
                  Text(
                    'eCPM Heatmap Matrix',
                    style: TextStyle(
                      color: QuantColors.textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: QuantColors.elevatedCard,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text(
                  'Peak: Fri-Sat Eve (\$7.8)',
                  style: TextStyle(
                    color: adsAmber,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Time header row
          Row(
            children: [
              const SizedBox(width: 36),
              ...List.generate(6, (col) {
                return Expanded(
                  child: Center(
                    child: Text(
                      _hours[col],
                      style: const TextStyle(
                        color: QuantColors.textMuted,
                        fontSize: 9,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                );
              }),
            ],
          ),
          const SizedBox(height: 6),
          // 7 Days Grid
          Column(
            children: List.generate(7, (row) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  children: [
                    SizedBox(
                      width: 36,
                      child: Text(
                        _days[row],
                        style: const TextStyle(
                          color: QuantColors.textSecondary,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    ...List.generate(6, (col) {
                      final cell = _heatmapCells.firstWhere(
                        (c) => c.dayIndex == row && c.hourIndex == col * 4,
                        orElse: () => EcpmHeatmapCell(
                          dayIndex: row,
                          hourIndex: col * 4,
                          ecpm: 4.0,
                          fillRate: 95.0,
                        ),
                      );
                      final intensity = ((cell.ecpm - 3.0) / 5.0).clamp(0.1, 1.0);
                      final cellColor = adsAmber.withOpacity(0.15 + (intensity * 0.75));

                      return Expanded(
                        child: GestureDetector(
                          onTap: () {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                duration: const Duration(seconds: 2),
                                backgroundColor: QuantColors.elevatedCard,
                                content: Text(
                                  '${_days[row]} ${_hours[col]} - eCPM: \$${cell.ecpm.toStringAsFixed(2)} | Fill: ${cell.fillRate.toStringAsFixed(1)}%',
                                  style: const TextStyle(color: QuantColors.textPrimary),
                                ),
                              ),
                            );
                          },
                          child: Container(
                            height: 26,
                            margin: const EdgeInsets.symmetric(horizontal: 1.5),
                            decoration: BoxDecoration(
                              color: cellColor,
                              borderRadius: BorderRadius.circular(4),
                              border: Border.all(
                                color: intensity > 0.7
                                    ? adsAmber
                                    : QuantColors.hairlineBorder.withOpacity(0.5),
                                width: 0.5,
                              ),
                            ),
                            child: Center(
                              child: Text(
                                cell.ecpm.toStringAsFixed(1),
                                style: TextStyle(
                                  color: intensity > 0.6 ? Colors.black : Colors.white70,
                                  fontSize: 9,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ),
                        ),
                      );
                    }),
                  ],
                ),
              );
            }),
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              const Text('Low (\$3.2)', style: TextStyle(color: QuantColors.textMuted, fontSize: 9)),
              const SizedBox(width: 6),
              Container(
                width: 60,
                height: 6,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [adsAmber.withOpacity(0.2), adsAmber],
                  ),
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
              const SizedBox(width: 6),
              const Text('High (\$7.8)', style: TextStyle(color: adsAmber, fontSize: 9, fontWeight: FontWeight.w700)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildBidStreamSection() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(Icons.stream_rounded, color: adsAmber, size: 18),
                  SizedBox(width: 6),
                  Text(
                    'Real-Time Bid Stream',
                    style: TextStyle(
                      color: QuantColors.textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              Text(
                '${_bidStream.length} recent events',
                style: const TextStyle(
                  color: QuantColors.textMuted,
                  fontSize: 11,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _bidStream.length,
            separatorBuilder: (_, __) => const Divider(color: QuantColors.subtleDivider, height: 12),
            itemBuilder: (context, index) {
              final bid = _bidStream[index];
              return _buildBidEventTile(bid);
            },
          ),
        ],
      ),
    );
  }

  Widget _buildBidEventTile(RtbBidEvent bid) {
    Color outcomeColor;
    String outcomeText;
    IconData outcomeIcon;

    switch (bid.outcome) {
      case BidOutcome.won:
        outcomeColor = QuantColors.statusSuccess;
        outcomeText = 'WON';
        outcomeIcon = Icons.check_circle_rounded;
        break;
      case BidOutcome.outbid:
        outcomeColor = adsAmber;
        outcomeText = 'OUTBID';
        outcomeIcon = Icons.remove_circle_outline_rounded;
        break;
      case BidOutcome.belowFloor:
        outcomeColor = QuantColors.statusError;
        outcomeText = 'BELOW FLOOR';
        outcomeIcon = Icons.block_rounded;
        break;
    }

    return Row(
      children: [
        // Latency indicator
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            color: QuantColors.elevatedCard,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: QuantColors.hairlineBorder),
          ),
          child: Center(
            child: Text(
              '${bid.latencyMs.toStringAsFixed(1)}ms',
              style: const TextStyle(
                color: sovereignCyan,
                fontSize: 9,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
        const SizedBox(width: 10),
        // Bidder info
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(
                    bid.bidderName,
                    style: const TextStyle(
                      color: QuantColors.textPrimary,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                    decoration: BoxDecoration(
                      color: QuantColors.elevatedCard,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      bid.adFormat,
                      style: const TextStyle(
                        color: QuantColors.textMuted,
                        fontSize: 9,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 2),
              Text(
                'Slot: ${bid.slotId} • Bid: \$${bid.bidPriceEcpm.toStringAsFixed(2)} eCPM',
                style: const TextStyle(
                  color: QuantColors.textMuted,
                  fontSize: 10,
                ),
              ),
            ],
          ),
        ),
        // Outcome Pill
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
          decoration: BoxDecoration(
            color: outcomeColor.withOpacity(0.15),
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: outcomeColor.withOpacity(0.4)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(outcomeIcon, color: outcomeColor, size: 10),
              const SizedBox(width: 4),
              Text(
                outcomeText,
                style: TextStyle(
                  color: outcomeColor,
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
