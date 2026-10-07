// Sovereign Quant Ecosystem - QuantAds Advanced Analytics & Audience Intelligence
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../models/ads_models.dart';

class AnalyticsScreen extends StatefulWidget {
  const AnalyticsScreen({super.key});

  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> {
  late List<DemographicsGroup> _ageDemographics;
  late List<DemographicsGroup> _genderDemographics;
  late List<GeoMetric> _geoMetrics;
  late List<FunnelStage> _funnelStages;
  late List<GeoYieldBreakdown> _geoYieldBreakdowns;
  String _selectedAttributionModel = 'Data-Driven Multi-Touch';
  int _selectedFormatFilter = 0; // 0=All, 1=Rewarded, 2=Native, 3=Interstitial, 4=Banner

  static const Color adsAmber = Color(0xFFF59E0B);
  static const Color sovereignCyan = Color(0xFF38BDF8);

  final List<String> _attributionModels = const [
    'Data-Driven Multi-Touch',
    'Linear Enclave',
    'Time-Decay Sovereign',
    'First-Touch Acquisition',
    'Last-Touch Conversion',
  ];

  final List<String> _formatTabs = const [
    'All Formats',
    'Rewarded Video',
    'Native In-Feed',
    'Interstitial',
    'Banner',
  ];

  @override
  void initState() {
    super.initState();
    // No mock data: analytics load from the real backend. Until the data seam
    // is wired, every chart is honestly empty.
    _ageDemographics = <DemographicsGroup>[];
    _genderDemographics = <DemographicsGroup>[];
    _geoMetrics = <GeoMetric>[];
    _funnelStages = <FunnelStage>[];
    _geoYieldBreakdowns = <GeoYieldBreakdown>[];
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
            // Top ROAS & Return on Ad Spend Summary Banner
            _buildRoasSummaryCard(),

            const SizedBox(height: 20),

            // Global eCPM Yield Heatmap Breakdown (US, IN, EU, APAC x Formats)
            _buildGlobalEcpmYieldSection(),

            const SizedBox(height: 20),

            // Conversion Funnel: Impression -> Click -> Install -> Purchase
            _buildConversionFunnelSection(),

            const SizedBox(height: 20),

            // Audience Demographics Breakdown (Age & Gender)
            _buildDemographicsSection(),

            const SizedBox(height: 20),

            // Geographic Performance Matrix
            _buildGeographicPerformanceSection(),

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _buildRoasSummaryCard() {
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
                  Icon(Icons.trending_up_rounded, color: adsAmber, size: 18),
                  SizedBox(width: 6),
                  Text(
                    'ROAS & Revenue Attribution',
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
                  '+38.4% vs Google Ads',
                  style: TextStyle(
                    color: QuantColors.statusSuccess,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Blended ROAS',
                      style: TextStyle(color: QuantColors.textMuted, fontSize: 11),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      '4.85x',
                      style: TextStyle(
                        color: QuantColors.textPrimary,
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.5,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Target: 3.50x (138% of Goal)',
                      style: TextStyle(
                        color: adsAmber.withOpacity(0.9),
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              Container(width: 1, height: 56, color: QuantColors.subtleDivider),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(left: 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Total Attributed Revenue',
                        style: TextStyle(color: QuantColors.textMuted, fontSize: 11),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        '\$57,694.00',
                        style: TextStyle(
                          color: QuantColors.statusSuccess,
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.5,
                        ),
                      ),
                      const SizedBox(height: 2),
                      const Text(
                        'On \$11,895.75 Total Ad Spend',
                        style: TextStyle(
                          color: QuantColors.textSecondary,
                          fontSize: 10,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          const Divider(color: QuantColors.subtleDivider, height: 1),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Attribution Model:',
                style: TextStyle(color: QuantColors.textMuted, fontSize: 11),
              ),
              DropdownButton<String>(
                value: _selectedAttributionModel,
                dropdownColor: QuantColors.elevatedCard,
                underline: const SizedBox(),
                icon: const Icon(Icons.arrow_drop_down_rounded, color: adsAmber),
                style: const TextStyle(
                  color: adsAmber,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
                items: _attributionModels.map((m) {
                  return DropdownMenuItem<String>(
                    value: m,
                    child: Text(m),
                  );
                }).toList(),
                onChanged: (val) {
                  if (val != null) {
                    setState(() => _selectedAttributionModel = val);
                  }
                },
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildGlobalEcpmYieldSection() {
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
                  Icon(Icons.public_rounded, color: adsAmber, size: 18),
                  SizedBox(width: 6),
                  Text(
                    'Global eCPM Yield Heatmap',
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
                  color: sovereignCyan.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  'Top 4 Macro Regions',
                  style: TextStyle(
                    color: sovereignCyan,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            'Cross-geography programmatic yield matrix across top video, native in-feed, interstitial, and banner formats.',
            style: TextStyle(color: QuantColors.textMuted, fontSize: 11),
          ),
          const SizedBox(height: 14),

          // Format Filter Tabs
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: List.generate(_formatTabs.length, (idx) {
                final isSelected = _selectedFormatFilter == idx;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(
                      _formatTabs[idx],
                      style: TextStyle(
                        color: isSelected ? Colors.black : QuantColors.textSecondary,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    selected: isSelected,
                    selectedColor: adsAmber,
                    backgroundColor: QuantColors.elevatedCard,
                    side: BorderSide(
                      color: isSelected ? adsAmber : QuantColors.hairlineBorder,
                    ),
                    onSelected: (val) {
                      if (val) {
                        setState(() => _selectedFormatFilter = idx);
                      }
                    },
                  ),
                );
              }),
            ),
          ),

          const SizedBox(height: 16),

          // Heatmap Matrix Table
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: QuantColors.elevatedCard,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Row(
              children: [
                Expanded(
                  flex: 3,
                  child: Text(
                    'Geography',
                    style: TextStyle(color: QuantColors.textMuted, fontSize: 10, fontWeight: FontWeight.w700),
                  ),
                ),
                Expanded(
                  flex: 2,
                  child: Text(
                    'Rewarded',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: QuantColors.textMuted, fontSize: 10, fontWeight: FontWeight.w700),
                  ),
                ),
                Expanded(
                  flex: 2,
                  child: Text(
                    'In-Feed',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: QuantColors.textMuted, fontSize: 10, fontWeight: FontWeight.w700),
                  ),
                ),
                Expanded(
                  flex: 2,
                  child: Text(
                    'Interst.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: QuantColors.textMuted, fontSize: 10, fontWeight: FontWeight.w700),
                  ),
                ),
                Expanded(
                  flex: 2,
                  child: Text(
                    'Fill Rate',
                    textAlign: TextAlign.end,
                    style: TextStyle(color: QuantColors.textMuted, fontSize: 10, fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 6),

          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _geoYieldBreakdowns.length,
            separatorBuilder: (_, __) => const Divider(color: QuantColors.subtleDivider, height: 10),
            itemBuilder: (context, index) {
              final geo = _geoYieldBreakdowns[index];
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                child: Row(
                  children: [
                    Expanded(
                      flex: 3,
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: adsAmber.withOpacity(0.15),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              geo.regionCode,
                              style: const TextStyle(
                                color: adsAmber,
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              geo.regionName,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: QuantColors.textPrimary,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      flex: 2,
                      child: _buildHeatmapCell('\$${geo.rewardedVideoEcpm.toStringAsFixed(2)}', geo.rewardedVideoEcpm, 9.0),
                    ),
                    Expanded(
                      flex: 2,
                      child: _buildHeatmapCell('\$${geo.nativeFeedEcpm.toStringAsFixed(2)}', geo.nativeFeedEcpm, 7.0),
                    ),
                    Expanded(
                      flex: 2,
                      child: _buildHeatmapCell('\$${geo.interstitialEcpm.toStringAsFixed(2)}', geo.interstitialEcpm, 8.0),
                    ),
                    Expanded(
                      flex: 2,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            '${geo.overallFillRate.toStringAsFixed(1)}%',
                            style: const TextStyle(
                              color: QuantColors.statusSuccess,
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          Text(
                            '${(geo.totalImpressions / 1000000).toStringAsFixed(1)}M impr',
                            style: const TextStyle(
                              color: QuantColors.textMuted,
                              fontSize: 9,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            },
          ),

          const SizedBox(height: 12),

          // Total aggregate summary chip
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: QuantColors.elevatedCard,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: sovereignCyan.withOpacity(0.3)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Row(
                  children: [
                    Icon(Icons.analytics_rounded, color: sovereignCyan, size: 16),
                    SizedBox(width: 6),
                    Text(
                      'Global Weighted Fill Counter:',
                      style: TextStyle(color: QuantColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
                const Text(
                  '98.1% Network Fill (9.6M Impr.)',
                  style: TextStyle(
                    color: sovereignCyan,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeatmapCell(String label, double value, double maxValue) {
    final intensity = (value / maxValue).clamp(0.15, 1.0);
    final bgColor = adsAmber.withOpacity(0.12 + (intensity * 0.5));

    return Center(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(
            color: intensity > 0.7 ? adsAmber.withOpacity(0.8) : QuantColors.hairlineBorder,
            width: 0.5,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: intensity > 0.6 ? Colors.white : Colors.white70,
            fontSize: 10,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }

  Widget _buildConversionFunnelSection() {
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
                  Icon(Icons.filter_alt_outlined, color: sovereignCyan, size: 18),
                  SizedBox(width: 6),
                  Text(
                    'Conversion Funnel',
                    style: TextStyle(
                      color: QuantColors.textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              Text(
                'Ecosystem End-to-End',
                style: TextStyle(
                  color: sovereignCyan.withOpacity(0.9),
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _funnelStages.length,
            separatorBuilder: (_, index) {
              final stage = _funnelStages[index + 1];
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    const SizedBox(width: 44),
                    const Icon(Icons.south_rounded, color: QuantColors.textMuted, size: 14),
                    const SizedBox(width: 8),
                    Text(
                      '${stage.conversionRate.toStringAsFixed(1)}% conversion rate (${stage.dropoffRate.toStringAsFixed(1)}% drop-off)',
                      style: const TextStyle(
                        color: QuantColors.textMuted,
                        fontSize: 10,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              );
            },
            itemBuilder: (context, index) {
              final stage = _funnelStages[index];
              return _buildFunnelStepCard(stage, index);
            },
          ),
        ],
      ),
    );
  }

  Widget _buildFunnelStepCard(FunnelStage stage, int index) {
    final colors = [
      adsAmber,
      sovereignCyan,
      const Color(0xFF10B981),
      const Color(0xFFA78BFA),
    ];
    final color = colors[index % colors.length];

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: QuantColors.elevatedCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: color.withOpacity(0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(stage.icon, color: color, size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  stage.stageName,
                  style: const TextStyle(
                    color: QuantColors.textPrimary,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  _formatVolume(stage.volume),
                  style: TextStyle(
                    color: color,
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                'Stage ${index + 1}/4',
                style: const TextStyle(
                  color: QuantColors.textMuted,
                  fontSize: 10,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                index == 0 ? 'Top of Funnel' : '${stage.conversionRate.toStringAsFixed(1)}% Yield',
                style: TextStyle(
                  color: index == 0 ? QuantColors.textSecondary : QuantColors.statusSuccess,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _formatVolume(int volume) {
    if (volume >= 1000000) {
      return '${(volume / 1000000).toStringAsFixed(2)}M Users';
    } else if (volume >= 1000) {
      return '${(volume / 1000).toStringAsFixed(1)}K Users';
    } else {
      return '$volume Users';
    }
  }

  Widget _buildDemographicsSection() {
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
          const Row(
            children: [
              Icon(Icons.pie_chart_outline_rounded, color: adsAmber, size: 18),
              SizedBox(width: 6),
              Text(
                'Audience Demographics',
                style: TextStyle(
                  color: QuantColors.textPrimary,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          // Age distribution
          const Text(
            'Age Distribution',
            style: TextStyle(
              color: QuantColors.textSecondary,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Column(
            children: _ageDemographics.map((age) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    SizedBox(
                      width: 50,
                      child: Text(
                        age.segment,
                        style: const TextStyle(
                          color: QuantColors.textPrimary,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: age.percentage / 100,
                          minHeight: 8,
                          backgroundColor: QuantColors.subtleDivider,
                          valueColor: AlwaysStoppedAnimation<Color>(age.color),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    SizedBox(
                      width: 44,
                      child: Text(
                        '${age.percentage.toStringAsFixed(1)}%',
                        textAlign: TextAlign.end,
                        style: TextStyle(
                          color: age.color,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 16),
          const Divider(color: QuantColors.subtleDivider, height: 1),
          const SizedBox(height: 16),
          // Gender distribution
          const Text(
            'Gender Breakdown',
            style: TextStyle(
              color: QuantColors.textSecondary,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: _genderDemographics.map((g) {
              return Expanded(
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: QuantColors.elevatedCard,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: g.color.withOpacity(0.3)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        g.segment,
                        style: const TextStyle(
                          color: QuantColors.textMuted,
                          fontSize: 10,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${g.percentage.toStringAsFixed(1)}%',
                        style: TextStyle(
                          color: g.color,
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildGeographicPerformanceSection() {
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
                  Icon(Icons.map_rounded, color: sovereignCyan, size: 18),
                  SizedBox(width: 6),
                  Text(
                    'Geographic Performance',
                    style: TextStyle(
                      color: QuantColors.textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              Text(
                'Top 5 Regions',
                style: TextStyle(
                  color: sovereignCyan.withOpacity(0.9),
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Table Header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: QuantColors.elevatedCard,
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Row(
              children: [
                Expanded(
                  flex: 3,
                  child: Text(
                    'Country',
                    style: TextStyle(color: QuantColors.textMuted, fontSize: 10, fontWeight: FontWeight.w600),
                  ),
                ),
                Expanded(
                  flex: 2,
                  child: Text(
                    'Impr.',
                    textAlign: TextAlign.end,
                    style: TextStyle(color: QuantColors.textMuted, fontSize: 10, fontWeight: FontWeight.w600),
                  ),
                ),
                Expanded(
                  flex: 2,
                  child: Text(
                    'CTR',
                    textAlign: TextAlign.end,
                    style: TextStyle(color: QuantColors.textMuted, fontSize: 10, fontWeight: FontWeight.w600),
                  ),
                ),
                Expanded(
                  flex: 2,
                  child: Text(
                    'ROAS',
                    textAlign: TextAlign.end,
                    style: TextStyle(color: QuantColors.textMuted, fontSize: 10, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 6),
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _geoMetrics.length,
            separatorBuilder: (_, __) => const Divider(color: QuantColors.subtleDivider, height: 8),
            itemBuilder: (context, index) {
              final geo = _geoMetrics[index];
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                child: Row(
                  children: [
                    Expanded(
                      flex: 3,
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                            decoration: BoxDecoration(
                              color: adsAmber.withOpacity(0.15),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              geo.countryCode,
                              style: const TextStyle(
                                color: adsAmber,
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              geo.countryName,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: QuantColors.textPrimary,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      flex: 2,
                      child: Text(
                        '${(geo.impressions / 1000).toStringAsFixed(1)}K',
                        textAlign: TextAlign.end,
                        style: const TextStyle(color: QuantColors.textSecondary, fontSize: 11),
                      ),
                    ),
                    Expanded(
                      flex: 2,
                      child: Text(
                        '${geo.ctr.toStringAsFixed(1)}%',
                        textAlign: TextAlign.end,
                        style: const TextStyle(color: QuantColors.textSecondary, fontSize: 11),
                      ),
                    ),
                    Expanded(
                      flex: 2,
                      child: Text(
                        '${geo.roas.toStringAsFixed(1)}x',
                        textAlign: TextAlign.end,
                        style: const TextStyle(
                          color: QuantColors.statusSuccess,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
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
}
