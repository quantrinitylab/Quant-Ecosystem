// ============================================================================
// QuantAI — AgentLabs Secure Webhook Action Dispatcher & Execution Retry Queue
// ============================================================================

import crypto from 'node:crypto';

export interface WebhookRequest {
  id: string;
  agentId: string;
  url: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body: Record<string, any>;
  secretKey: string;
  maxRetries?: number;
  initialBackoffMs?: number;
}

export interface WebhookExecutionResult {
  requestId: string;
  agentId?: string;
  success: boolean;
  statusCode?: number;
  attemptCount: number;
  latencyMs: number;
  responseBody?: any;
  error?: string;
  executedAt: string;
}

const executionLogs: WebhookExecutionResult[] = [];

/**
 * Generates an HMAC SHA-256 signature for the given payload using secretKey.
 * Returns the hex digest.
 */
export function generateHmacSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Dispatches a webhook request with HMAC signature verification header,
 * idempotency key, latency tracking, and exponential backoff retry loop.
 */
export async function dispatchWebhook(
  request: WebhookRequest,
  fetchFn: typeof fetch = fetch,
  options?: { initialBackoffMs?: number },
): Promise<WebhookExecutionResult> {
  const startTime = Date.now();
  const maxRetries = request.maxRetries !== undefined ? Math.max(1, request.maxRetries) : 3;
  const initialDelay =
    options?.initialBackoffMs ??
    request.initialBackoffMs ??
    (process.env.NODE_ENV === 'test' ? 10 : 300);

  const serializedBody =
    typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  const signatureHex = generateHmacSignature(serializedBody, request.secretKey);

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(request.headers || {}),
    'X-Quant-Signature': `sha256=${signatureHex}`,
    'X-Quant-Idempotency': request.id,
  };

  let attemptCount = 0;
  let lastStatus: number | undefined;
  let responseData: any = undefined;
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    attemptCount = attempt;
    lastError = undefined;

    try {
      const response = await fetchFn(request.url, {
        method: request.method,
        headers: requestHeaders,
        body: serializedBody,
      });

      lastStatus = response.status;

      try {
        const text = await response.text();
        try {
          responseData = JSON.parse(text);
        } catch {
          responseData = text;
        }
      } catch {
        responseData = undefined;
      }

      if (response.ok) {
        const result: WebhookExecutionResult = {
          requestId: request.id,
          agentId: request.agentId,
          success: true,
          statusCode: response.status,
          attemptCount,
          latencyMs: Date.now() - startTime,
          responseBody: responseData,
          executedAt: new Date().toISOString(),
        };
        executionLogs.push(result);
        return result;
      }

      // Non-transient client errors (4xx except 429) do not retry
      if (response.status < 500 && response.status !== 429) {
        lastError = `HTTP ${response.status}: ${
          typeof responseData === 'string' ? responseData : JSON.stringify(responseData)
        }`;
        break;
      }

      lastError = `HTTP ${response.status}: Server Error`;
    } catch (err: any) {
      lastError = err?.message || 'Network error';
    }

    // Exponential backoff before next attempt
    if (attempt < maxRetries) {
      const delayMs = initialDelay * Math.pow(2, attempt - 1);
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  const failedResult: WebhookExecutionResult = {
    requestId: request.id,
    agentId: request.agentId,
    success: false,
    statusCode: lastStatus,
    attemptCount,
    latencyMs: Date.now() - startTime,
    responseBody: responseData,
    error: lastError,
    executedAt: new Date().toISOString(),
  };

  executionLogs.push(failedResult);
  return failedResult;
}

/**
 * Returns webhook execution audit logs, optionally filtered by agentId.
 */
export function getExecutionLogs(agentId?: string): WebhookExecutionResult[] {
  if (agentId) {
    return executionLogs.filter((log) => log.agentId === agentId);
  }
  return [...executionLogs];
}

/**
 * Clears in-memory audit logs for testing purposes.
 */
export function clearLogsForTesting(): void {
  executionLogs.length = 0;
}
