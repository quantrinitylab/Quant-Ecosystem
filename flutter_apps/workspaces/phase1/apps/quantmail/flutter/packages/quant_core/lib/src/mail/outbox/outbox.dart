// ============================================================================
// quant_core - outbox module barrel (M6: modifier queue, W2)
//
// Public surface of the persistent modifier-queue: the [OutboxOp] model,
// the [OutboxStore] persistence seam (+ SQLite impl), the single-writer
// [OutboxDrainer], the Riverpod wiring, and the [ThreadMutationService]
// entry point.
export 'outbox_op.dart';
export 'outbox_store.dart';
export 'outbox_drainer.dart';
export 'outbox_providers.dart';
export '../thread_mutation_service.dart';
