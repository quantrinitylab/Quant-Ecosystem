// ============================================================================
// ads_app - dashboard shell (UI-only)
// ============================================================================
//
// Post-login landing: branded app bar, bottom tab navigation
// (Dashboard, Campaigns, Credits, Profile), the Credits wallet card and the
// stub campaign list on the Dashboard tab.
//
// All data is hardcoded UI stub content from `widgets/dashboard/stub_ads_data.dart`
// (marked TODO(UNVERIFIED)) — the QuantAds API spec is still pending
// (`app-foundations/quantads/` does not exist yet), so no endpoints are
// invented and no network calls are made. The Campaigns / Credits / Profile
// tabs beyond the dashboard slice render honest "spec pending" stubs.
//
// The logout action calls the real session notifier; the router's auth gate
// then bounces the user back to `/login`.

import 'package:ads_core/ads_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../widgets/dashboard/campaign_card.dart';
import '../widgets/dashboard/credits_wallet_card.dart';
import '../widgets/dashboard/stub_ads_data.dart';

/// Post-login dashboard shell.
class DashboardScreen extends ConsumerStatefulWidget {
  /// Creates the dashboard screen.
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  int _selectedIndex = 0;

  static const double _campaignItemExtent = 152;

  Future<void> _signOut() async {
    await ref.read(authSessionProvider.notifier).logout();
  }

  void _onTabSelected(int index) {
    setState(() => _selectedIndex = index);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('QuantAds'),
        actions: <Widget>[
          IconButton(
            // VQA-P2-06: M3 IconButton defaults to 40x40 — keep the touch
            // target at least 48x48dp (AppBar toolbar height 56 fits it).
            style: IconButton.styleFrom(
              minimumSize: const Size(48, 48),
            ),
            tooltip: 'Sign out',
            icon: const Icon(Icons.logout_outlined),
            onPressed: _signOut,
          ),
        ],
      ),
      body: IndexedStack(
        index: _selectedIndex,
        children: <Widget>[
          _DashboardTab(
            itemExtent: _campaignItemExtent,
            onSeeAll: () => _onTabSelected(1),
          ),
          _CampaignsTab(itemExtent: _campaignItemExtent),
          const _SpecPendingTab(
            title: 'Credits',
            icon: Icons.account_balance_wallet_outlined,
            message: 'Credits wallet detail coming — QuantAds API spec '
                'pending. No balances or purchase history are shown here '
                'on purpose.',
          ),
          _ProfileTab(onSignOut: _signOut),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _selectedIndex,
        onTap: _onTabSelected,
        type: BottomNavigationBarType.fixed,
        items: const <BottomNavigationBarItem>[
          BottomNavigationBarItem(
            icon: Icon(Icons.dashboard_outlined),
            activeIcon: Icon(Icons.dashboard),
            label: 'Dashboard',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.campaign_outlined),
            activeIcon: Icon(Icons.campaign),
            label: 'Campaigns',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.account_balance_wallet_outlined),
            activeIcon: Icon(Icons.account_balance_wallet),
            label: 'Credits',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.person_outline),
            activeIcon: Icon(Icons.person),
            label: 'Profile',
          ),
        ],
      ),
    );
  }
}

/// Overview tab: credits wallet card first (Quant Credits economy is
/// first-class in this app), then the campaign list.
class _DashboardTab extends StatelessWidget {
  const _DashboardTab({
    required this.itemExtent,
    required this.onSeeAll,
  });

  final double itemExtent;
  final VoidCallback onSeeAll;

  @override
  Widget build(BuildContext context) {
    final TextTheme textTheme = Theme.of(context).textTheme;
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final List<StubCampaign> campaigns = StubAdsData.campaigns;

    return CustomScrollView(
      slivers: <Widget>[
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          sliver: SliverToBoxAdapter(
            child: CreditsWalletCard(StubAdsData.wallet),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
          sliver: SliverToBoxAdapter(
            child: Row(
              children: <Widget>[
                Expanded(
                  child: Text(
                    'Campaigns',
                    style: textTheme.titleMedium,
                  ),
                ),
                TextButton(
                  // VQA-P2-06: keep the touch target at least 48x48dp.
                  style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
                  onPressed: onSeeAll,
                  child: const Text('See all'),
                ),
              ],
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          sliver: SliverList.builder(
            itemCount: campaigns.length,
            itemBuilder: (BuildContext context, int index) => SizedBox(
              height: itemExtent + 12,
              child: Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: CampaignCard(campaigns[index], itemExtent: itemExtent),
              ),
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            child: Text(
              // TODO(spec): wire campaign stats to the QuantAds openapi.yaml
              // endpoints once the spec lands (app-foundations/quantads/).
              'Stub data shown for UI construction — replace with API '
              'wiring when the spec lands.',
              style: textTheme.bodySmall?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
            ),
          ),
        ),
      ],
    );
  }
}

/// Full campaign list tab (same stub data, scrollable).
class _CampaignsTab extends StatelessWidget {
  const _CampaignsTab({required this.itemExtent});

  final double itemExtent;

  @override
  Widget build(BuildContext context) {
    final List<StubCampaign> campaigns = StubAdsData.campaigns;
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: campaigns.length,
      itemExtent: itemExtent + 12,
      itemBuilder: (BuildContext context, int index) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: CampaignCard(campaigns[index], itemExtent: itemExtent),
      ),
    );
  }
}

/// Profile tab: stub profile card plus the real sign-out action.
class _ProfileTab extends StatelessWidget {
  const _ProfileTab({required this.onSignOut});

  final Future<void> Function() onSignOut;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: <Widget>[
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: <Widget>[
                CircleAvatar(
                  backgroundColor:
                      scheme.primary.withValues(alpha: 0.14),
                  foregroundColor: scheme.primary,
                  child: const Icon(Icons.person_outline),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        // TODO(spec): replace with the signed-in advertiser
                        // profile from the QuantAds spec when it lands.
                        'Advertiser',
                        style: textTheme.titleMedium,
                      ),
                      Text(
                        'QuantMail SSO session',
                        style: textTheme.bodySmall?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        // VQA-P2-06: keep the touch target at least 48x48dp.
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(
            minimumSize: const Size(48, 48),
          ),
          onPressed: onSignOut,
          icon: const Icon(Icons.logout_outlined),
          label: const Text('Sign out'),
        ),
      ],
    );
  }
}

/// Honest placeholder for tabs whose backend does not exist yet.
///
/// Names the future surface and admits the spec is pending — no invented
/// data, no invented endpoints.
class _SpecPendingTab extends StatelessWidget {
  const _SpecPendingTab({
    required this.title,
    required this.icon,
    required this.message,
  });

  final String title;
  final IconData icon;
  final String message;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(
              icon,
              size: 48,
              color: scheme.primary,
            ),
            const SizedBox(height: 16),
            Semantics(
              header: true,
              child: Text(
                title,
                style: textTheme.titleLarge,
                textAlign: TextAlign.center,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              style: textTheme.bodyMedium?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
            ),
            // TODO(spec): wire to the QuantAds openapi.yaml endpoints once
            // the spec lands (app-foundations/quantads/).
          ],
        ),
      ),
    );
  }
}
