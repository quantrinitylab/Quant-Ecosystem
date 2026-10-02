// W3 (Sentinel) — audit trail tests.
//
// Append-only is enforced by the API surface: AuditTrail exposes `append`
// and read-only consumption only. These tests verify seq monotonicity,
// session-bound actorUserId (never caller-supplied), UTC timestamps,
// tamper-evident details hashes, the sink persistence hook, and the
// read-only activity-log stream contract for the proactive program.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:quantai_core/src/sentinel/audit_trail.dart';

void main() {
  late InMemoryAuditSink sink;
  late ProviderContainer container;

  setUp(() {
    sink = InMemoryAuditSink();
    container = ProviderContainer(
      overrides: [
        actorUserIdProvider.overrideWithValue('user-123'),
        auditSinkProvider.overrideWithValue(sink),
      ],
    );
    addTearDown(container.dispose);
  });

  AuditTrail trail() => container.read(auditTrailProvider.notifier);

  Future<void> appendAction(String actionId,
      {Map<String, Object?>? details, AuditDecision decision = AuditDecision.allowed}) =>
      trail().append(
        actionId: actionId,
        kind: AuditEventKind.action,
        decision: decision,
        details: details,
      );

  group('AuditTrail — append-only contract', () {
    test('seq is monotonic starting at 0', () async {
      await appendAction('a1');
      await appendAction('a2');
      await appendAction('a3');

      final events = container.read(auditTrailProvider);
      expect(events.map((e) => e.seq).toList(), [0, 1, 2]);
    });

    test('history only grows: no edit/delete/clear path exists', () async {
      await appendAction('a1');
      await appendAction('a2');
      expect(container.read(auditTrailProvider), hasLength(2));

      // There is simply no mutating API beyond append: a further append can
      // only extend the trail, never rewrite it.
      await appendAction('a3', decision: AuditDecision.denied);
      final events = container.read(auditTrailProvider);
      expect(events, hasLength(3));
      expect(events[0].actionId, 'a1');
      expect(events[1].actionId, 'a2');
      expect(events[2].decision, AuditDecision.denied);
    });

    test('actorUserId is bound from the session provider, never the caller',
        () async {
      // append() takes NO actor argument — identity comes from
      // actorUserIdProvider ('user-123' in this container).
      await appendAction('a1');
      final event = container.read(auditTrailProvider).single;
      expect(event.actorUserId, 'user-123');
    });

    test('timestamps are UTC', () async {
      await appendAction('a1');
      final event = container.read(auditTrailProvider).single;
      expect(event.timestamp.isUtc, isTrue);
    });

    test('explicit timestamps are normalized to UTC', () async {
      final local = DateTime(2026, 10, 3, 12, 0, 0); // non-UTC
      await trail().append(
        actionId: 'a1',
        kind: AuditEventKind.approval,
        decision: AuditDecision.expired,
        timestamp: local,
      );
      final event = container.read(auditTrailProvider).single;
      expect(event.timestamp.isUtc, isTrue);
      expect(event.timestamp, local.toUtc());
    });
  });

  group('AuditTrail — tamper-evident details hash', () {
    test('same details → same hash (order-independent)', () async {
      await appendAction('a1', details: {'b': 2, 'a': 'x'});
      await appendAction('a2', details: {'a': 'x', 'b': 2});

      final events = container.read(auditTrailProvider);
      expect(events[0].detailsHash, events[1].detailsHash);
      expect(events[0].detailsHash, hasLength(16)); // FNV-1a 64 hex
    });

    test('different details → different hash', () async {
      await appendAction('a1', details: {'amount': 100});
      await appendAction('a2', details: {'amount': 101});

      final events = container.read(auditTrailProvider);
      expect(events[0].detailsHash, isNot(events[1].detailsHash));
    });

    test('details themselves are not stored on the event', () async {
      await appendAction('a1', details: {'secret': 's3cr3t'});
      final event = container.read(auditTrailProvider).single;
      expect(event.toString(), isNot(contains('s3cr3t')));
    });
  });

  group('AuditTrail — sink persistence hook', () {
    test('every appended event reaches the sink in seq order', () async {
      await appendAction('a1');
      await appendAction('a2', decision: AuditDecision.denied);

      expect(sink.events.map((e) => e.seq).toList(), [0, 1]);
      expect(sink.events.map((e) => e.actionId).toList(), ['a1', 'a2']);
    });

    test('all kinds are recordable', () async {
      for (final kind in AuditEventKind.values) {
        await trail().append(
          actionId: 'x',
          kind: kind,
          decision: AuditDecision.allowed,
        );
      }
      expect(
        container.read(auditTrailProvider).map((e) => e.kind).toList(),
        AuditEventKind.values,
      );
    });
  });

  group('AuditTrail — read-only activity-log contract', () {
    test('watchEvents emits the current snapshot then each append', () async {
      await appendAction('a1');

      final received = <List<AuditEvent>>[];
      final sub = trail().watchEvents().listen(received.add);
      addTearDown(sub.cancel);

      await appendAction('a2');
      // Let the broadcast stream deliver.
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(received.length, greaterThanOrEqualTo(2));
      expect(received.first.map((e) => e.actionId), ['a1']);
      expect(received.last.map((e) => e.actionId), ['a1', 'a2']);
    });

    test('watchEvents(since:) filters to recent events', () async {
      final t0 = DateTime.utc(2026, 1, 1);
      await trail().append(
        actionId: 'old',
        kind: AuditEventKind.action,
        decision: AuditDecision.allowed,
        timestamp: t0,
      );
      await appendAction('new');

      final snapshot =
          await trail().watchEvents(since: DateTime.utc(2026, 6, 1)).first;
      expect(snapshot.map((e) => e.actionId).toList(), ['new']);
    });

    test('auditEventsProvider streams appends; exposes no mutation',
        () async {
      final received = <List<AuditEvent>>[];
      final sub = container.listen(auditEventsProvider, (_, next) {
        next.whenData(received.add);
      });
      addTearDown(sub.close);

      await appendAction('a1');
      await appendAction('a2');
      // Let the broadcast stream deliver both appends.
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(received, isNotEmpty);
      expect(received.last.map((e) => e.seq).toList(), [0, 1]);

      // The provider exposes List<AuditEvent> only — there is no notifier
      // method reachable through it that could mutate the trail.
      final notifier = container.read(auditTrailProvider.notifier);
      expect(notifier, isA<AuditTrail>());
    });
  });
}
