// ============================================================================
// ads_app - dashboard shell widget tests (UI-only)
// ============================================================================
//
// Pumps [DashboardScreen] with a stubbed authenticated session: the real
// [AuthSessionNotifier] lifecycle (token hydration, network) is replaced by
// an override that immediately reports [AuthAuthenticated]. All content is
// the UI-only stub data — no endpoints are invented and no network is used.

import 'package:ads_core/ads_core.dart';
import 'package:ads_theme/ads_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ads_app/src/screens/dashboard_screen.dart';

/// Auth notifier stub: same public type as production ([AuthSessionNotifier])
/// so [authSessionProvider.notifier].logout() keeps compiling; only the
/// session state is faked.
class _StubAuthSession extends AuthSessionNotifier {
  @override
  Future<AuthSessionState> build() async => const AuthAuthenticated();
}

Future<void> _pumpDashboard(WidgetTester tester) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: <Override>[
        authSessionProvider.overrideWith(_StubAuthSession.new),
      ],
      child: MaterialApp(
        theme: AdsTheme.adsLight,
        darkTheme: AdsTheme.adsDark,
        themeMode: ThemeMode.dark,
        home: const DashboardScreen(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('DashboardScreen shell', () {
    testWidgets('renders brand app bar, wallet card and campaign list',
        (WidgetTester tester) async {
      await _pumpDashboard(tester);

      // Brand app bar.
      expect(find.text('QuantAds'), findsOneWidget);
      expect(find.byTooltip('Sign out'), findsOneWidget);

      // Bottom tab navigation: all four destinations present.
      expect(find.text('Dashboard'), findsOneWidget);
      expect(find.text('Campaigns'), findsWidgets);
      expect(find.text('Credits'), findsWidgets);
      expect(find.text('Profile'), findsOneWidget);
      expect(find.byType(BottomNavigationBar), findsOneWidget);

      // Credits wallet card (UI-only stub content).
      expect(find.text('Quant Credits'), findsOneWidget);
      expect(find.textContaining('12.5 K'), findsOneWidget);
      expect(find.text('Buy credits'), findsOneWidget);

      // Campaign list: stub campaigns render with status chips and stats.
      expect(find.text('Diwali Sale — App Install'), findsOneWidget);
      expect(find.text('Q2 Creator Boost'), findsOneWidget);
      expect(find.text('Active'), findsNWidgets(2));
      expect(find.text('Paused'), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsWidgets);
    });

    testWidgets('tabs switch: campaigns list, credits stub, profile',
        (WidgetTester tester) async {
      await _pumpDashboard(tester);

      Finder tab(IconData icon) =>
          find.widgetWithIcon(BottomNavigationBar, icon);

      // Campaigns tab shows the full stub list.
      await tester.tap(tab(Icons.campaign_outlined));
      await tester.pumpAndSettle();
      expect(
        find.text('QuantChat Launch — Awareness'),
        findsOneWidget,
      );

      // Credits tab is an honest "spec pending" stub.
      await tester.tap(tab(Icons.account_balance_wallet_outlined));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('spec pending'),
        findsOneWidget,
      );

      // Profile tab carries the sign-out action.
      await tester.tap(tab(Icons.person_outline));
      await tester.pumpAndSettle();
      expect(find.text('Advertiser'), findsOneWidget);
      expect(find.text('Sign out'), findsWidgets);

      // Back to dashboard.
      await tester.tap(tab(Icons.dashboard_outlined));
      await tester.pumpAndSettle();
      expect(find.text('Quant Credits'), findsOneWidget);
    });
  });
}
