// ============================================================================
// quant_core - compose module barrel (M7: compose core, W2)
//
// Local barrel for the compose domain layer (request model, API surface,
// modifier-queue service, Riverpod providers). The coordinator adds these
// exports to `src/mail/mail.dart` at reconcile (shared-file rule).
export 'compose_api.dart';
export 'compose_providers.dart';
export 'compose_request.dart';
export 'compose_service.dart';
export 'sent_tracker.dart';
