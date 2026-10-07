// ============================================================================
// quant_core - connectivity module barrel (M6, W1)
//
// Public surface: the [ConnectivitySource] seam (production
// [ConnectivityPlusSource] + test fakes), the debounced
// [ConnectivityWatcher] that turns offline→online transitions into a
// single [onReconnect] callback, and the Riverpod wiring in
// `../mail/sync/sync_providers.dart` (`connectivitySourceProvider`,
// `connectivityWatcherProvider`).
export 'connectivity_source.dart';
export 'connectivity_watcher.dart';
