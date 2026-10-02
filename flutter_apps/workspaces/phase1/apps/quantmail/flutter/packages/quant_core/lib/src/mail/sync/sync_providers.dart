// ============================================================================
// quant_core - delta-sync providers (M4, W3)
// ============================================================================

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'mail_sync_service.dart';

/// The delta-sync engine, shared app-wide.
///
/// Constructed over [Ref] so the cache ([threadListCacheProvider]) and API
/// seams ([emailChangesApiProvider], [threadsApiProvider]) resolve lazily
/// per call — tests override those providers without touching this one.
final mailSyncServiceProvider = Provider<MailSyncService>(
  (ref) => MailSyncService(ref),
  name: 'mailSyncServiceProvider',
);
