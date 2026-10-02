// ============================================================================
// quant_wave_app - tab bodies for the QuantWave tab shell (Phase 3, shift 2)
// ============================================================================
//
// Placeholder bodies for the four bottom-nav tabs. NO API data is wired:
// the QuantWave OpenAPI spec does not exist yet
// (app-foundations/quantwave/ is empty), so every list below is a skeleton
// marked TODO(UNVERIFIED). When the spec lands, each tab becomes a vertical
// slice wired against it — no endpoint is invented here.
//
// Perf notes (PERF): every scrollable list uses ListView.builder with a
// fixed itemExtent so the framework skips per-item layout measurement;
// rows are const-constructible and avoid nested scrollables.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quant_wave_core/quant_wave_core.dart';

/// Skeleton rows for the discussion timeline tab.
///
/// TODO(UNVERIFIED): replace with real thread data once the QuantWave
/// OpenAPI spec exists (app-foundations/quantwave/). No endpoints assumed.
class TimelineTabBody extends StatelessWidget {
  /// Creates the timeline tab body.
  const TimelineTabBody({super.key});

  /// Number of skeleton rows rendered (UI placeholder, not data).
  static const int skeletonRowCount = 20;

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      // PERF: fixed extent — no per-item measurement on scroll.
      itemExtent: 104,
      itemCount: skeletonRowCount,
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemBuilder: (BuildContext context, int index) {
        return const _ThreadSkeletonRow();
      },
    );
  }
}

/// One skeleton thread row: avatar dot + title/excerpt bars.
class _ThreadSkeletonRow extends StatelessWidget {
  const _ThreadSkeletonRow();

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final Color barColor = scheme.surfaceContainerHighest;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: barColor,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const SizedBox(height: 2),
                _SkeletonBar(widthFactor: 0.85, color: barColor),
                const SizedBox(height: 8),
                _SkeletonBar(widthFactor: 0.55, color: barColor),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Rounded shimmer bar for skeleton rows.
class _SkeletonBar extends StatelessWidget {
  const _SkeletonBar({required this.widthFactor, required this.color});

  final double widthFactor;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return FractionallySizedBox(
      widthFactor: widthFactor,
      child: Container(
        height: 12,
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(6),
        ),
      ),
    );
  }
}

/// Placeholder for the notifications tab.
///
/// TODO(UNVERIFIED): real notification data waits on the QuantWave OpenAPI
/// spec (app-foundations/quantwave/). No endpoints assumed.
class NotificationsTabBody extends StatelessWidget {
  /// Creates the notifications tab body.
  const NotificationsTabBody({super.key});

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return ListView.builder(
      // PERF: fixed extent — no per-item measurement on scroll.
      itemExtent: 72,
      itemCount: 12,
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemBuilder: (BuildContext context, int index) {
        return ListTile(
          leading: Icon(
            Icons.notifications_outlined,
            color: scheme.onSurfaceVariant,
          ),
          title: Container(
            height: 12,
            margin: const EdgeInsets.only(right: 96),
            decoration: BoxDecoration(
              color: scheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(6),
            ),
          ),
          subtitle: Container(
            height: 10,
            margin: const EdgeInsets.only(right: 160, top: 6),
            decoration: BoxDecoration(
              color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
              borderRadius: BorderRadius.circular(5),
            ),
          ),
        );
      },
    );
  }
}

/// Placeholder for the direct-messages tab.
///
/// TODO(UNVERIFIED): real conversation data waits on the QuantWave OpenAPI
/// spec (app-foundations/quantwave/). No endpoints assumed.
class MessagesTabBody extends StatelessWidget {
  /// Creates the messages tab body.
  const MessagesTabBody({super.key});

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return ListView.builder(
      // PERF: fixed extent — no per-item measurement on scroll.
      itemExtent: 80,
      itemCount: 10,
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemBuilder: (BuildContext context, int index) {
        return ListTile(
          leading: CircleAvatar(
            backgroundColor: scheme.surfaceContainerHighest,
            child: Icon(
              Icons.person_outline,
              color: scheme.onSurfaceVariant,
            ),
          ),
          title: Container(
            height: 12,
            margin: const EdgeInsets.only(right: 120),
            decoration: BoxDecoration(
              color: scheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(6),
            ),
          ),
          subtitle: Container(
            height: 10,
            margin: const EdgeInsets.only(right: 72, top: 6),
            decoration: BoxDecoration(
              color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
              borderRadius: BorderRadius.circular(5),
            ),
          ),
          trailing: Icon(
            Icons.chevron_right,
            color: scheme.onSurfaceVariant,
          ),
        );
      },
    );
  }
}

/// Placeholder profile tab.
///
/// The sign-out button is REAL — it drives
/// [AuthSessionNotifier.logout] in quant_wave_core; the router's auth gate
/// then bounces back to /login. Everything else here is a placeholder
/// until the QuantWave user-profile API is specified
/// (TODO(UNVERIFIED): app-foundations/quantwave/).
class ProfileTabBody extends ConsumerWidget {
  /// Creates the profile tab body.
  const ProfileTabBody({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    return ListView(
      padding: const EdgeInsets.all(24),
      children: <Widget>[
        Center(
          child: CircleAvatar(
            radius: 40,
            backgroundColor: scheme.surfaceContainerHighest,
            child: Icon(
              Icons.person_outline,
              size: 40,
              color: scheme.onSurfaceVariant,
            ),
          ),
        ),
        const SizedBox(height: 16),
        Semantics(
          header: true,
          child: Text(
            // TODO(UNVERIFIED): real display name from the profile API.
            'QuantWave user',
            style: textTheme.titleLarge,
            textAlign: TextAlign.center,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          // TODO(UNVERIFIED): real handle from the profile API.
          'Profile details arrive with the QuantWave API spec.',
          style: textTheme.bodyMedium
              ?.copyWith(color: scheme.onSurfaceVariant),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 32),
        OutlinedButton.icon(
          onPressed: () => ref.read(authSessionProvider.notifier).logout(),
          icon: const Icon(Icons.logout_outlined),
          label: const Text('Sign out'),
        ),
      ],
    );
  }
}
