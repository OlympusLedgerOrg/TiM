/**
 * Centralised API client for TiM frontend.
 *
 * Provides a single point of configuration for every HTTP call:
 * • Automatic Bearer-token injection from localStorage
 * • Consistent JSON error handling with structured error objects
 * • Configurable request timeout (default 30 s)
 * • Base URL resolution from environment or relative path
 *
 * Usage:
 *   import { apiClient } from '@/services/apiClient';
 *   const data = await apiClient.get<MyType>('/equipment');
 *   await apiClient.post('/movements', { batchId, quantity });
 */

// ─── Configuration ──────────────────────────────────────────────────────────

const API_BASE = '/api/v1';
const DEFAULT_TIMEOUT_MS = 30_000;

// ─── Error type ─────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('token');
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function handleResponse<T>(res: Response): Promise<T> {
  const requestId = res.headers.get('X-Request-ID') ?? undefined;

  if (!res.ok) {
    let body: { message?: string; code?: string } = {};
    try {
      body = await res.json();
    } catch {
      // Non-JSON error body — use status text
    }
    throw new ApiError(
      body.message || res.statusText || `Request failed (${res.status})`,
      res.status,
      body.code,
      requestId,
    );
  }

  // 204 No Content — return undefined
  if (res.status === 204) return undefined as unknown as T;

  return res.json() as Promise<T>;
}

// ─── Core request function ──────────────────────────────────────────────────

interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** Request body — automatically serialised to JSON */
  body?: unknown;
  /** Timeout in milliseconds (default: 30 000) */
  timeout?: number;
  /** Skip automatic auth header injection */
  skipAuth?: boolean;
}

async function request<T>(
  path: string,
  { body, timeout = DEFAULT_TIMEOUT_MS, skipAuth = false, ...init }: RequestOptions = {},
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(skipAuth ? {} : getAuthHeaders()),
        ...(init.headers as Record<string, string> | undefined),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    return handleResponse<T>(res);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('Request timed out', 408, 'TIMEOUT');
    }
    throw new ApiError(
      err instanceof Error ? err.message : 'Network error',
      0,
      'NETWORK_ERROR',
    );
  } finally {
    clearTimeout(timer);
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export const apiClient = {
  get<T>(path: string, opts?: Omit<RequestOptions, 'body'>) {
    return request<T>(path, { ...opts, method: 'GET' });
  },

  post<T>(path: string, body?: unknown, opts?: RequestOptions) {
    return request<T>(path, { ...opts, body, method: 'POST' });
  },

  put<T>(path: string, body?: unknown, opts?: RequestOptions) {
    return request<T>(path, { ...opts, body, method: 'PUT' });
  },

  patch<T>(path: string, body?: unknown, opts?: RequestOptions) {
    return request<T>(path, { ...opts, body, method: 'PATCH' });
  },

  delete<T>(path: string, opts?: RequestOptions) {
    return request<T>(path, { ...opts, method: 'DELETE' });
  },
};
