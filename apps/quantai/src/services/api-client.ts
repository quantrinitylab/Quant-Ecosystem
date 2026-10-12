// ============================================================================
// QuantAI - Frontend API Client
// ============================================================================
//
// NOTE (F-162 cleanup): this client is intentionally minimal. The app
// standardized on `apiFetchRaw` from `@quant/api-client` for direct route
// calls, so the ~22 legacy route methods that used to live here (chat,
// devices, automations, models, training, ecosystem, analytics, plugins)
// were deleted after a repo-wide caller audit found them all dead. The only
// live surface is the token holder (setToken, used by services/auth-session.ts).
// listConversations is also gone (F-161: the useConversations hook was dead).
// New routes must be added via apiFetchRaw at the call site — not here.

import { getAuthToken } from '../lib/auth';
import { apiFetchRaw } from '@quant/api-client';

const API_BASE = '/api';
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

class QuantAIApiClient {
  private token: string = '';
  setToken(token: string): void {
    this.token = token;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = this.token || getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await apiFetchRaw(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      // Fail-closed (F-162 improvement): a non-2xx (502 HTML page, empty body,
      // gateway error) must never reach `res.json()` and throw a raw
      // SyntaxError — map it to the standard envelope so callers see a clean
      // `{ success: false, error }` instead.
      let message = res.statusText || 'Request failed';
      try {
        const parsed = (await res.json()) as Partial<{
          message?: unknown;
          error?: { message?: unknown } | unknown;
        }>;
        // Accept a top-level `message` or the standard `{ error: { message } }` envelope.
        const nested =
          typeof parsed?.error === 'object' && parsed.error !== null
            ? (parsed.error as { message?: unknown }).message
            : undefined;
        const candidate = parsed?.message ?? nested;
        if (typeof candidate === 'string' && candidate) {
          message = candidate;
        }
      } catch {
        // Non-JSON error body (e.g. HTML) — keep the status text.
      }
      return { success: false, error: { code: `HTTP_${res.status}`, message } };
    }
    return res.json();
  }
}

export const apiClient = new QuantAIApiClient();
export default apiClient;
