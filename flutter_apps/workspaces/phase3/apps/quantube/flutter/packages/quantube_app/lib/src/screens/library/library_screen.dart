// ============================================================================
// quantube_app - library screen (downloads / history / watch later / liked)
// ============================================================================
//
// Library shell for the QuanTube app. Only the Downloads tab is real UI:
// it watches [DownloadManager.watchDownloads] and wires every tile action
// (pause/resume/cancel/delete) to the manager contract. History, Watch
// Later, and Liked are honest placeholders — the QuanTube API spec does not
// exist yet (app-foundations/quantube), so no list endpoints are invented.
//
// Route wiring is W2's job (see board note: `/library` -> LibraryScreen()).
// This file only defines the screen.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quantube_core/quantube_core.dart';

import 'widgets/download_tile.dart';

/// App-local stream of download snapshots, derived from the shared manager.
///
/// Kept here (not in core) because it is a UI convenience — core only owns
/// the [DownloadManager] contract.
final _downloadListProvider = StreamProvider<List<DownloadTask>>(
  (ref) => ref.watch(downloadManagerProvider).watchDownloads(),
  name: 'downloadListProvider',
);

/// Library screen: Downloads / History / Watch Later / Liked tabs.
///
/// Dark-first via the ambient [ThemeData] (QuantTubeTheme dark default).
/// TODO(UNVERIFIED): History / Watch Later / Liked need the spec's list
/// endpoints (app-foundations/quantube) — they are placeholders until then.
class LibraryScreen extends StatelessWidget {
  const LibraryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final TextTheme textTheme = Theme.of(context).textTheme;
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Library'),
          bottom: TabBar(
            tabs: <Widget>[
              const Tab(text: 'Downloads'),
              const Tab(text: 'History'),
              const Tab(text: 'Watch Later'),
              const Tab(text: 'Liked'),
            ],
            labelStyle: textTheme.labelLarge,
          ),
        ),
        body: const TabBarView(
          children: <Widget>[
            _DownloadsTab(),
            _LibraryPlaceholder(
              icon: Icons.history,
              title: 'History',
              message:
                  'Watch history needs the spec (app-foundations/quantube).',
            ),
            _LibraryPlaceholder(
              icon: Icons.watch_later_outlined,
              title: 'Watch Later',
              message:
                  'Saved-for-later needs the spec (app-foundations/quantube).',
            ),
            _LibraryPlaceholder(
              icon: Icons.thumb_up_outlined,
              title: 'Liked',
              message: 'Liked videos need the spec (app-foundations/quantube).',
            ),
          ],
        ),
      ),
    );
  }
}

/// The real tab: live download list wired to the [DownloadManager].
class _DownloadsTab extends ConsumerWidget {
  const _DownloadsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<DownloadTask>> downloads =
        ref.watch(_downloadListProvider);
    return downloads.when(
      data: (List<DownloadTask> tasks) {
        if (tasks.isEmpty) return const _EmptyDownloads();
        return ListView.separated(
          padding: const EdgeInsets.symmetric(vertical: 8),
          itemCount: tasks.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (BuildContext context, int index) =>
              DownloadTile(task: tasks[index]),
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (Object error, StackTrace _) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'Could not load downloads: $error',
            style: Theme.of(context)
                .textTheme
                .bodyMedium
                ?.copyWith(color: Theme.of(context).colorScheme.error),
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }
}

/// Empty state for the downloads list.
class _EmptyDownloads extends StatelessWidget {
  const _EmptyDownloads();

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
              Icons.download_for_offline_outlined,
              size: 64,
              color: scheme.onSurfaceVariant,
            ),
            const SizedBox(height: 16),
            Text(
              'No downloads yet',
              style: textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              'Videos you save for offline will appear here. '
              'Playback + offline are QuanTube\u2019s competitive edge — '
              'the real download engine lands with the API spec.',
              style: textTheme.bodyMedium
                  ?.copyWith(color: scheme.onSurfaceVariant),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

/// Honest placeholder for spec-gated tabs: icon + title + one-line reason.
class _LibraryPlaceholder extends StatelessWidget {
  const _LibraryPlaceholder({
    required this.icon,
    required this.title,
    required this.message,
  });

  final IconData icon;
  final String title;
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
            Icon(icon, size: 64, color: scheme.onSurfaceVariant),
            const SizedBox(height: 16),
            Text(title, style: textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(
              message,
              style: textTheme.bodyMedium
                  ?.copyWith(color: scheme.onSurfaceVariant),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
