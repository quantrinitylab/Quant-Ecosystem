// ============================================================================
// quant_core - delta-sync module barrel (M4, W3)
// ============================================================================
//
// Public surface of the delta-sync engine: [MailSyncService]/[SyncResult]
// and the [mailSyncServiceProvider] wiring.
//
// Note: this barrel does NOT export the cache seam
// (`../cache/thread_cache.dart`, W1) or the changes API seam
// (`../threads_api.dart`) — those live in their own modules.

export 'mail_sync_service.dart';
export 'sync_providers.dart';
