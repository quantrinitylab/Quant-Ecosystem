// ============================================================================
// quantai_core - typed ScheduledTasks API wrapper
// ============================================================================
//
// Thin typed wrapper over the transport layer. Every method is wired 1:1 to
// a spec'd operation in `app-foundations/quantai/openapi.yaml` (line refs on
// each method); no endpoint is invented. Backend failures surface as
// [SchedulerApiException].
//
// Response bodies are `{success, data}` envelopes (see `sessions_api.dart`):
// methods request `Map<String, dynamic>` and unwrap `data` themselves.
//
// Testability: [SchedulerApi] depends on the narrow [SchedulerTransport]
// interface (not on [QuantAiApiClient] directly). Production wires the
// [QuantAiSchedulerTransport] adapter; tests supply a fake. The adapter is
// trivial delegation and is covered by tests asserting it forwards arguments.

import 'package:quant_foundation/quant_foundation.dart';

import '../api/quantai_api_client.dart';
import 'scheduler_models.dart';

/// Failure of a typed scheduler API call (transport, HTTP, or envelope).
class SchedulerApiException implements Exception {
  final String code;
  final String message;
  final int statusCode;

  const SchedulerApiException(
    this.message, {
    this.code = 'SCHEDULER_API_ERROR',
    this.statusCode = 0,
  });

  factory SchedulerApiException.fromApiError(ApiError error) =>
      SchedulerApiException(
        error.message,
        code: error.code,
        statusCode: error.statusCode,
      );

  @override
  String toString() =>
      'SchedulerApiException($code, status $statusCode): $message';
}

/// Narrow transport interface for the scheduler endpoints.
///
/// Keeps [SchedulerApi] unit-testable without a real Dio stack.
abstract class SchedulerTransport {
  Future<ApiResult<Map<String, dynamic>>> get(
    String path, {
    Map<String, dynamic>? queryParameters,
  });

  Future<ApiResult<Map<String, dynamic>>> post(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
  });

  Future<ApiResult<Map<String, dynamic>>> patch(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
  });

  Future<ApiResult<Map<String, dynamic>>> delete(
    String path, {
    Map<String, dynamic>? queryParameters,
  });
}

/// Production [SchedulerTransport]: delegates to the shared client
/// (auth/refresh/retry interceptor stack included).
class QuantAiSchedulerTransport implements SchedulerTransport {
  final QuantAiApiClient client;

  const QuantAiSchedulerTransport(this.client);

  @override
  Future<ApiResult<Map<String, dynamic>>> get(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) =>
      client.get<Map<String, dynamic>>(path,
          queryParameters: queryParameters);

  @override
  Future<ApiResult<Map<String, dynamic>>> post(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
  }) =>
      client.post<Map<String, dynamic>>(path,
          data: data, queryParameters: queryParameters);

  @override
  Future<ApiResult<Map<String, dynamic>>> patch(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
  }) =>
      client.patch<Map<String, dynamic>>(path,
          data: data, queryParameters: queryParameters);

  @override
  Future<ApiResult<Map<String, dynamic>>> delete(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) =>
      client.delete<Map<String, dynamic>>(path,
          queryParameters: queryParameters);
}

/// Typed wrapper for the QuantAI scheduled-tasks endpoints.
///
/// Auth: Bearer tokens are injected by [QuantAiApiClient]'s interceptor
/// stack (D1 — the existing OAuth2 flow); nothing here manages credentials.
class SchedulerApi {
  final SchedulerTransport _transport;

  const SchedulerApi({required SchedulerTransport transport})
      : _transport = transport;

  // -- Parse ------------------------------------------------------------------

  /// Parse a natural-language trigger into a cron preview.
  ///
  /// spec: app-foundations/quantai/openapi.yaml L3597
  /// `POST /agents/scheduled/parse` (body `nlPrompt`) → 200.
  Future<ScheduleParsePreview> parseTrigger(String nlPrompt) async {
    final payload = await _request(
      () => _transport.post(
        '/agents/scheduled/parse',
        data: {'nlPrompt': nlPrompt},
      ),
      'parseTrigger',
    );
    return ScheduleParsePreview.fromJson(_dataMap(payload) ?? const {});
  }

  // -- Tasks ------------------------------------------------------------------

  /// List the caller's scheduled tasks.
  ///
  /// spec: app-foundations/quantai/openapi.yaml L3617
  /// `GET /agents/scheduled/` (query `status`, `agentId`, `targetApp`).
  Future<List<ScheduledTask>> listTasks({
    ScheduledTaskStatus? status,
    String? agentId,
    String? targetApp,
  }) async {
    final payload = await _request(
      () => _transport.get(
        '/agents/scheduled/',
        queryParameters: {
          if (status != null) 'status': status.wireValue,
          if (agentId != null) 'agentId': agentId,
          if (targetApp != null) 'targetApp': targetApp,
        },
      ),
      'listTasks',
    );
    final items = _dataList(payload);
    return items.map(ScheduledTask.fromJson).toList();
  }

  /// Create a recurring agent task.
  ///
  /// spec: app-foundations/quantai/openapi.yaml L3617
  /// `POST /agents/scheduled/` → 201.
  Future<ScheduledTask> createTask(ScheduledTask task) async {
    final payload = await _request(
      () => _transport.post(
        '/agents/scheduled/',
        data: task.toCreateJson(),
      ),
      'createTask',
    );
    return _taskOrThrow(payload, 'createTask');
  }

  /// Fetch one scheduled task by id.
  ///
  /// spec: app-foundations/quantai/openapi.yaml L3658
  /// `GET /agents/scheduled/{id}`.
  Future<ScheduledTask> getTask(String id) async {
    final payload = await _request(
      () => _transport.get(
        '/agents/scheduled/${Uri.encodeComponent(id)}',
      ),
      'getTask',
    );
    return _taskOrThrow(payload, 'getTask');
  }

  /// Update a scheduled task (only non-null fields are sent).
  ///
  /// spec: app-foundations/quantai/openapi.yaml L3658
  /// `PATCH /agents/scheduled/{id}`.
  Future<ScheduledTask> updateTask(
    String id, {
    String? name,
    String? description,
    String? cronExpression,
    String? actionPrompt,
    String? targetApp,
    ScheduledTaskStatus? status,
    Map<String, dynamic>? config,
  }) async {
    final body = <String, dynamic>{
      if (name != null) 'name': name,
      if (description != null) 'description': description,
      if (cronExpression != null) 'cronExpression': cronExpression,
      if (actionPrompt != null) 'actionPrompt': actionPrompt,
      if (targetApp != null) 'targetApp': targetApp,
      if (status != null) 'status': status.wireValue,
      if (config != null) 'config': config,
    };
    final payload = await _request(
      () => _transport.patch(
        '/agents/scheduled/${Uri.encodeComponent(id)}',
        data: body,
      ),
      'updateTask',
    );
    return _taskOrThrow(payload, 'updateTask');
  }

  /// Delete/cancel a scheduled task.
  ///
  /// spec: app-foundations/quantai/openapi.yaml L3658
  /// `DELETE /agents/scheduled/{id}`.
  Future<void> deleteTask(String id) async {
    await _request(
      () => _transport.delete(
        '/agents/scheduled/${Uri.encodeComponent(id)}',
      ),
      'deleteTask',
    );
  }

  /// Manually trigger immediate execution of a task.
  ///
  /// spec: app-foundations/quantai/openapi.yaml L3710
  /// `POST /agents/scheduled/{id}/trigger` → 200 `{success, data: run}`.
  Future<TaskRun> triggerTask(String id) async {
    final payload = await _request(
      () => _transport.post(
        '/agents/scheduled/${Uri.encodeComponent(id)}/trigger',
      ),
      'triggerTask',
    );
    final run = _runOrNull(payload);
    if (run == null) {
      throw const SchedulerApiException(
        'triggerTask returned an unparseable run payload',
      );
    }
    return run;
  }

  // -- Runs -------------------------------------------------------------------

  /// Execution ledger history of a task.
  ///
  /// spec: app-foundations/quantai/openapi.yaml L3723
  /// `GET /agents/scheduled/{id}/runs` (query `limit`).
  // TODO(UNVERIFIED): spec marks `limit` as a raw string query param (no
  // zod); the backend may expect a string, so we pass it as-is.
  Future<List<TaskRun>> listRuns(String id, {int? limit}) async {
    final payload = await _request(
      () => _transport.get(
        '/agents/scheduled/${Uri.encodeComponent(id)}/runs',
        queryParameters: {
          if (limit != null) 'limit': '$limit',
        },
      ),
      'listRuns',
    );
    return _dataList(payload).map(TaskRun.fromJson).toList();
  }

  /// Fetch one execution-ledger run.
  ///
  /// spec: app-foundations/quantai/openapi.yaml L3738
  /// `GET /agents/scheduled/{id}/runs/{runId}`.
  Future<TaskRun> getRun(String id, String runId) async {
    final payload = await _request(
      () => _transport.get(
        '/agents/scheduled/${Uri.encodeComponent(id)}/runs/'
        '${Uri.encodeComponent(runId)}',
      ),
      'getRun',
    );
    final run = _runOrNull(payload);
    if (run == null) {
      throw const SchedulerApiException(
        'getRun returned an unparseable run payload',
      );
    }
    return run;
  }

  // -- Internals ---------------------------------------------------------------

  /// Runs [call], throwing [SchedulerApiException] on transport/HTTP
  /// failure, and returns the raw envelope body (`{success, data, ...}`).
  Future<Map<String, dynamic>?> _request(
    Future<ApiResult<Map<String, dynamic>>> Function() call,
    String operation,
  ) async {
    final result = await call();
    if (!result.success) {
      final error = result.error;
      throw error == null
          ? SchedulerApiException('$operation failed without an error payload')
          : SchedulerApiException.fromApiError(error);
    }
    return result.data;
  }

  /// The `{..., data: {...}}` inner map, or `null`.
  Map<String, dynamic>? _dataMap(Map<String, dynamic>? body) {
    final inner = body?['data'];
    return inner is Map<String, dynamic> ? inner : null;
  }

  /// The `{..., data: [...]}` inner list of maps (empty when absent).
  List<Map<String, dynamic>> _dataList(Map<String, dynamic>? body) {
    final inner = body?['data'];
    if (inner is List) {
      return inner.whereType<Map<String, dynamic>>().toList();
    }
    return const [];
  }

  ScheduledTask _taskOrThrow(
    Map<String, dynamic>? payload,
    String operation,
  ) {
    final task = _taskOrNull(payload);
    if (task == null) {
      throw SchedulerApiException(
        '$operation returned an unparseable task payload',
      );
    }
    return task;
  }

  ScheduledTask? _taskOrNull(Map<String, dynamic>? payload) {
    final map = _dataMap(payload);
    if (map == null || map.isEmpty) return null;
    return ScheduledTask.fromJson(map);
  }

  TaskRun? _runOrNull(Map<String, dynamic>? payload) {
    final map = _dataMap(payload);
    if (map == null || map.isEmpty) return null;
    return TaskRun.fromJson(map);
  }
}
