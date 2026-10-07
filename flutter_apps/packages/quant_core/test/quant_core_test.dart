import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/quant_core.dart';

void main() {
  group('Quant Core Unit Tests', () {
    test('QuantSessionState unauthenticated baseline', () {
      final state = QuantSessionState.unauthenticated();
      expect(state.isAuthenticated, false);
      expect(state.userId, null);
      expect(state.accessToken, null);
      expect(state.tenantId, null);
    });

    test('QuantSessionState authenticated state', () {
      final state = QuantSessionState(
        userId: 'usr_123',
        email: 'founder@quantmail.in',
        tenantId: 'sovereign-hq',
        accessToken: 'jwt_mock_token_abc',
        expiresAt: DateTime.now().add(const Duration(hours: 2)),
      );
      expect(state.isAuthenticated, true);
      expect(state.tenantId, 'sovereign-hq');
    });

    test('SyncOperation serialization and status transitions', () {
      final op = SyncOperation(
        entityType: 'mail',
        action: 'star',
        entityId: 'mail_999',
        payload: {'is_starred': true},
      );

      expect(op.status, SyncStatus.pending);
      expect(op.retryCount, 0);

      final map = op.toMap();
      expect(map['entity_type'], 'mail');
      expect(map['action'], 'star');

      final reconstructed = SyncOperation.fromMap(map);
      expect(reconstructed.id, op.id);
      expect(reconstructed.entityId, 'mail_999');
      expect(reconstructed.payload['is_starred'], true);

      final failed = op.copyWith(
        status: SyncStatus.failed,
        retryCount: 1,
        lastError: 'HTTP 503 Service Unavailable',
      );
      expect(failed.status, SyncStatus.failed);
      expect(failed.retryCount, 1);
      expect(failed.lastError, 'HTTP 503 Service Unavailable');
    });

    test('QuantOfflineStore mutation queue lifecycle', () async {
      final store = QuantOfflineStore();

      final op1 = SyncOperation(
        entityType: 'mail',
        action: 'send',
        entityId: 'draft_001',
        payload: {'to': 'test@quantmail.in'},
      );

      final op2 = SyncOperation(
        entityType: 'calendar',
        action: 'create_event',
        entityId: 'evt_002',
        payload: {'title': 'Board Sync'},
      );

      await store.enqueueSyncOperation(op1);
      await store.enqueueSyncOperation(op2);

      final pending = await store.getPendingOperations();
      expect(pending.length, 2);

      await store.markOperationSynced(op1.id);
      final remaining = await store.getPendingOperations();
      expect(remaining.length, 1);
      expect(remaining.first.id, op2.id);

      await store.markOperationFailed(op2.id, 'Timeout');
      final failedOps = await store.getPendingOperations();
      expect(failedOps.first.retryCount, 1);
      expect(failedOps.first.lastError, 'Timeout');
    });

    test('QuantOfflineStore entity cache', () async {
      final store = QuantOfflineStore();

      await store.cacheEntity('emails', 'msg_1', {'subject': 'Hello Quant'});
      final cached = await store.getCachedEntity('emails', 'msg_1');

      expect(cached, isNotNull);
      expect(cached?['subject'], 'Hello Quant');
    });

    test('QuantApiException encapsulates status and latency', () {
      const ex = QuantApiException(
        message: 'Unauthorized',
        statusCode: 401,
        path: '/v1/mail/inbox',
        latencyMs: 3,
      );

      expect(ex.statusCode, 401);
      expect(ex.latencyMs, 3);
      expect(ex.toString(), contains('latency: 3ms'));
    });
  });
}
