import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';

import 'screens/agenda_view_screen.dart';
import 'screens/month_grid_screen.dart';
import 'screens/public_booking_screen.dart';
import 'screens/quantmeet_launcher_screen.dart';
import 'screens/reminders_screen.dart';

void main() {
  runApp(const QuantCalendarApp());
}

/// Sovereign Google Calendar & Calendly Killer Standalone Flutter Application
///
/// Features 120Hz Impeller acceleration, zero clipPath calls, and zero raw Unicode emojis.
class QuantCalendarApp extends StatelessWidget {
  const QuantCalendarApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'QuantCalendar',
      debugShowCheckedModeBanner: false,
      theme: QuantTheme.obsidianDarkTheme.copyWith(
        primaryColor: QuantColors.sunsetGold,
        colorScheme: QuantTheme.obsidianDarkTheme.colorScheme.copyWith(
          primary: QuantColors.sunsetGold,
        ),
      ),
      initialRoute: '/',
      onGenerateRoute: (settings) {
        final uri = Uri.parse(settings.name ?? '/');
        if (uri.pathSegments.isNotEmpty && uri.pathSegments[0] == 'booking') {
          final slug = uri.pathSegments.length > 1 ? uri.pathSegments[1] : 'alex-dev';
          return MaterialPageRoute(
            builder: (_) => Scaffold(
              backgroundColor: QuantColors.voidObsidian,
              appBar: AppBar(
                backgroundColor: QuantColors.darkSlateCard,
                elevation: 0,
                leading: const BackButton(color: QuantColors.sunsetGold),
                title: Text('/booking/$slug', style: QuantTypography.titleMedium),
              ),
              body: PublicBookingScreen(slug: slug),
            ),
            settings: settings,
          );
        }
        return MaterialPageRoute(
          builder: (_) => const QuantCalendarHomeScreen(),
          settings: settings,
        );
      },
    );
  }
}

class QuantCalendarHomeScreen extends StatefulWidget {
  const QuantCalendarHomeScreen({super.key});

  @override
  State<QuantCalendarHomeScreen> createState() => _QuantCalendarHomeScreenState();
}

class _QuantCalendarHomeScreenState extends State<QuantCalendarHomeScreen> {
  int _currentViewIndex = 0; // 0: Agenda, 1: Month, 2: Booking, 3: QuantMeet, 4: Reminders
  QuantPillar _activePillar = QuantPillar.calendar;

  void _switchToTab(int index) {
    setState(() {
      _currentViewIndex = index;
    });
  }

  void _onDynamicIslandTapped() {
    showModalBottomSheet(
      context: context,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        side: BorderSide(color: QuantColors.hairlineBorder, width: 1),
      ),
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: QuantColors.activeBorder,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                const Row(
                  children: [
                    Icon(Icons.auto_awesome_rounded, color: QuantColors.sunsetGold, size: 24),
                    SizedBox(width: 10),
                    Text(
                      'Quanty AI Schedule Copilot',
                      style: QuantTypography.titleLarge,
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  'Autonomous Swarm AI is continuously monitoring your dual-timezone schedule (IST / PST), slot mutexes, and CalDAV RFC 5545 sync pipelines.',
                  style: QuantTypography.bodyMedium.copyWith(color: QuantColors.textSecondary),
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: QuantColors.voidObsidian,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: QuantColors.hairlineBorder),
                  ),
                  child: Column(
                    children: [
                      _buildAiInsightRow(
                        icon: Icons.speed_rounded,
                        title: 'CalDAV Sync Latency',
                        value: '<2.4ms (In Parity)',
                        valueColor: QuantColors.statusSuccess,
                      ),
                      const Divider(color: QuantColors.hairlineBorder, height: 16),
                      _buildAiInsightRow(
                        icon: Icons.calendar_view_day_rounded,
                        title: 'Recommended Focus Block',
                        value: '02:30 PM - 04:30 PM IST',
                        valueColor: QuantColors.sunsetGold,
                      ),
                      const Divider(color: QuantColors.hairlineBorder, height: 16),
                      _buildAiInsightRow(
                        icon: Icons.lock_clock_rounded,
                        title: 'Public Booking Mutex Lock',
                        value: '4 Slots Open · Zero Conflicts',
                        valueColor: QuantColors.sovereignCyan,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                SquircleButton(
                  label: 'Dismiss Copilot Insight',
                  isFullWidth: true,
                  backgroundColor: QuantColors.darkSlateSurface,
                  textColor: QuantColors.textPrimary,
                  border: const BorderSide(color: QuantColors.hairlineBorder),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  static Widget _buildAiInsightRow({
    required IconData icon,
    required String title,
    required String value,
    required Color valueColor,
  }) {
    return Row(
      children: [
        Icon(icon, size: 16, color: valueColor),
        const SizedBox(width: 8),
        Expanded(
          child: Text(title, style: QuantTypography.bodySmall),
        ),
        Text(
          value,
          style: QuantTypography.labelSpeed.copyWith(color: valueColor, fontSize: 11),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      bottomNavigationBar: ContextBottomNavBar(
        activePillar: QuantPillar.calendar,
        selectedIndex: _currentViewIndex,
        onTabSelected: _switchToTab,
        badges: const {
          'agenda': 5,
          'booking': 4,
          'reminders': 3,
        },
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Top 5-Pillar Switcher (Ecosystem Parity)
            QuantPillarTopBar(
              activePillar: _activePillar,
              onPillarSelected: (pillar) {
                setState(() => _activePillar = pillar);
                if (pillar != QuantPillar.calendar) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      backgroundColor: QuantColors.darkSlateCard,
                      content: Text(
                        'Switched context to ${pillar.label} Sovereign Pillar.',
                        style: const TextStyle(color: QuantColors.textPrimary),
                      ),
                      duration: const Duration(seconds: 1),
                    ),
                  );
                }
              },
            ),

            // Top Bar with App Branding & Dynamic Island AI Live Capsule
            _buildTopBrandingAndDynamicIsland(),

            // Active Screen Content
            Expanded(
              child: IndexedStack(
                index: _currentViewIndex,
                children: [
                  AgendaViewScreen(
                    onOpenQuantMeet: () => _switchToTab(3),
                  ),
                  MonthGridScreen(
                    onOpenQuantMeet: () => _switchToTab(3),
                  ),
                  PublicBookingScreen(
                    onLaunchQuantMeet: () => _switchToTab(3),
                  ),
                  const QuantMeetLauncherScreen(),
                  const RemindersScreen(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopBrandingAndDynamicIsland() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // App Title & Pillar Badge
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [QuantColors.sunsetGold, QuantColors.moltenAmber],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [
                    BoxShadow(
                      color: QuantColors.sunsetGold.withOpacity(0.3),
                      blurRadius: 10,
                      spreadRadius: 1,
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.calendar_month_rounded,
                  color: QuantColors.voidObsidian,
                  size: 22,
                ),
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Text(
                        'QuantCalendar',
                        style: QuantTypography.titleMedium.copyWith(
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.3,
                        ),
                      ),
                      const SizedBox(width: 6),
                      const QuantBadge(
                        label: 'SOVEREIGN',
                        variant: QuantBadgeVariant.amber,
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'RFC 5545 CalDAV · Calendly Killer',
                    style: QuantTypography.microCapsule.copyWith(
                      color: QuantColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ],
          ),

          // Dynamic Island AI Live Capsule
          QuantAiCapsule(
            title: 'Quanty AI',
            statusText: '<5ms CalDAV',
            beaconColor: QuantColors.sunsetGold,
            isPulsing: true,
            leadingIcon: Icons.auto_awesome_rounded,
            onTap: _onDynamicIslandTapped,
          ),
        ],
      ),
    );
  }
}
