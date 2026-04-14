/**
 * Operator Management API client — CRUD operations for admin panel.
 */

const API_BASE = '/api/v1/operators';

function getToken(): string {
  return localStorage.getItem('token') || '';
}

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OperatorRecord {
  id: string;
  name: string;
  badgeId: string | null;
  isActive: boolean;
  createdAt: string;
  recentShifts?: Array<{
    id: string;
    shift: string;
    date: string;
    workCenterCode: string | null;
    clockInAt: string | null;
    clockOutAt: string | null;
  }>;
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ─── API Functions ────────────────────────────────────────────────────────────

export async function listOperators(opts?: {
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<{ operators: OperatorRecord[]; pagination: PaginationInfo }> {
  const params = new URLSearchParams();
  if (opts?.search) params.set('search', opts.search);
  if (opts?.isActive !== undefined) params.set('isActive', String(opts.isActive));
  if (opts?.page) params.set('page', String(opts.page));
  if (opts?.pageSize) params.set('pageSize', String(opts.pageSize));

  const res = await fetch(`${API_BASE}?${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getOperator(id: string): Promise<{ operator: OperatorRecord }> {
  const res = await fetch(`${API_BASE}/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function createOperator(data: { name: string; badgeId: string }): Promise<{ operator: OperatorRecord }> {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function updateOperator(id: string, data: {
  name?: string;
  badgeId?: string;
  isActive?: boolean;
}): Promise<{ operator: OperatorRecord }> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function deleteOperator(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function bulkImportOperators(operators: Array<{ name: string; badgeId: string }>): Promise<{
  results: { imported: number; skipped: number; errors: Array<{ name: string; badgeId: string; reason: string }> };
}> {
  const res = await fetch(`${API_BASE}/bulk-import`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ operators }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
