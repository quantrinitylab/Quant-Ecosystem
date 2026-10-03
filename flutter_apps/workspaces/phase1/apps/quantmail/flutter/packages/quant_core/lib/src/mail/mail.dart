// ============================================================================
// quant_core - mail module barrel
// ============================================================================
//
// Public surface of the M3 mail stack: models, API surfaces, providers,
// repositories and the [MailCache] offline-cache seam. (Does not export
// quant_core.dart — that top-level barrel is maintained separately.)

export 'models/email.dart';
export 'models/pagination.dart';
export 'models/thread.dart';
export 'emails_api.dart';
export 'threads_api.dart';
export 'mail_providers.dart';
export 'thread_detail_repository.dart';
export 'thread_detail_providers.dart';
export 'cache/cache.dart';
export 'compose/compose.dart';
export 'outbox/outbox.dart';
export 'realtime/realtime.dart';
