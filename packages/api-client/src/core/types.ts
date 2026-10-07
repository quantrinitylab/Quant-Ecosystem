// ============================================================================
// API Client SDK - Core Types
// ============================================================================

/** Standard API response wrapper */
export interface APIResponse<T> {
  success: boolean;
  data: T;
  error?: APIError;
  metadata?: {
    requestId: string;
    timestamp: number;
  };
}

/** API error structure */
export interface APIError {
  code: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
}

/** Paginated response */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/** HTTP request configuration */
export interface RequestConfig {
  baseUrl: string;
  headers?: Record<string, string>;
  timeout?: number;
  authToken?: string;
}

/** Query hook options */
export interface QueryOptions {
  enabled?: boolean;
  staleTime?: number;
  cacheTime?: number;
  refetchOnWindowFocus?: boolean;
  retry?: number | boolean;
}

/** Token refresh configuration for HttpClient */
export interface RefreshConfig {
  /** Endpoint path for token refresh (e.g., '/api/auth/refresh') */
  endpoint: string;
  /** Function that returns the current refresh token */
  getRefreshToken: () => string | null;
}
