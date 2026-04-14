/**
 * Analytics API client — fetches management dashboard data from the backend.
 */

const API_BASE = '/api/v1/analytics';

function getToken(): string {
  return localStorage.getItem('token') || '';
}

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  };
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlantKPI {
  oee: number;
  availability: number;
  performance: number;
  quality: number;
  throughput: number;
  scrapRate: number;
  onTimeDelivery: number;
  totalEquipment: number;
  runningEquipment: number;
  downEquipment: number;
}

export interface ShiftComparison {
  shift: string;
  date: string;
  downtimeMinutes: number;
  downtimeEvents: number;
  productionCount: number;
  scrapCount: number;
  operatorsClocked: number;
}

export interface DowntimeTrend {
  date: string;
  totalMinutes: number;
  totalEvents: number;
  plannedMinutes: number;
  unplannedMinutes: number;
}

export interface DrillDownData {
  level: string;
  plantAreas?: Array<{
    id: string; code: string; name: string;
    equipmentCount: number; runningCount: number; downCount: number;
  }>;
  workCenters?: Array<{
    id: string; code: string; name: string;
    equipmentCount: number; downtimeMinutes: number; downtimeEvents: number;
  }>;
  equipment?: Array<{
    id: string; code: string; name: string; status: string; type: string;
    downtimeMinutes: number; downtimeEvents: number;
  }>;
}

export interface ShiftReport {
  date: string;
  shift: string;
  shiftStart: string;
  shiftEnd: string;
  generatedAt: string;
  operators: {
    total: number;
    clockedIn: number;
    list: Array<{ name: string; badgeId: string | null; workCenter: string | null; clockIn: string | null; clockOut: string | null }>;
  };
  downtime: {
    totalEvents: number;
    totalMinutes: number;
    events: Array<{
      equipment: string; category: string; reasonCode: string; reasonText: string | null;
      startedAt: string; endedAt: string; durationMin: number;
    }>;
  };
  production: { totalEvents: number; totalQuantity: number };
  consumption: { totalEvents: number; totalQuantity: number };
  quality: { scrapEvents: number; scrapQuantity: number };
}

export interface WorkerMetric {
  operatorId: string;
  operatorName: string;
  badgeId: string;
  shiftsWorked: number;
  totalClockMinutes: number;
}

export interface SapSyncStatus {
  syncStatus: {
    materials: { lastSync: string | null; status: string };
    batches: { lastSync: string | null; status: string };
    movements: { lastSync: string | null; status: string };
    overallStatus: string;
    lastChecked: string;
  };
}

// ─── API Functions ────────────────────────────────────────────────────────────

export function getPlantKPIs(start?: string, end?: string) {
  const params = new URLSearchParams();
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  return fetchJSON<{ kpis: PlantKPI }>(`${API_BASE}/kpis?${params}`);
}

export function getShiftComparison(days = 7) {
  return fetchJSON<{ comparisons: ShiftComparison[] }>(`${API_BASE}/shift-comparison?days=${days}`);
}

export function getDrillDown(opts: {
  plantArea?: string;
  workCenter?: string;
  equipmentId?: string;
  start?: string;
  end?: string;
}) {
  const params = new URLSearchParams();
  if (opts.plantArea) params.set('plantArea', opts.plantArea);
  if (opts.workCenter) params.set('workCenter', opts.workCenter);
  if (opts.equipmentId) params.set('equipmentId', opts.equipmentId);
  if (opts.start) params.set('start', opts.start);
  if (opts.end) params.set('end', opts.end);
  return fetchJSON<DrillDownData>(`${API_BASE}/drill-down?${params}`);
}

export function getDowntimeTrends(opts: {
  granularity: 'daily' | 'weekly' | 'monthly';
  start?: string;
  end?: string;
  plantArea?: string;
  workCenter?: string;
  equipmentId?: string;
}) {
  const params = new URLSearchParams({ granularity: opts.granularity });
  if (opts.start) params.set('start', opts.start);
  if (opts.end) params.set('end', opts.end);
  if (opts.plantArea) params.set('plantArea', opts.plantArea);
  if (opts.workCenter) params.set('workCenter', opts.workCenter);
  if (opts.equipmentId) params.set('equipmentId', opts.equipmentId);
  return fetchJSON<{ trends: DowntimeTrend[] }>(`${API_BASE}/downtime-trends?${params}`);
}

export function getScrapAnalysis(start?: string, end?: string) {
  const params = new URLSearchParams();
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  return fetchJSON<{
    totalScrapEvents: number;
    totalScrapQuantity: number;
    byMaterial: Array<{ code: string; description: string; count: number; quantity: number }>;
  }>(`${API_BASE}/scrap-analysis?${params}`);
}

export function getWorkerPerformance(start?: string, end?: string) {
  const params = new URLSearchParams();
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  return fetchJSON<{ workers: WorkerMetric[] }>(`${API_BASE}/worker-performance?${params}`);
}

export function getShiftReport(date: string, shift: string) {
  return fetchJSON<{ report: ShiftReport }>(`${API_BASE}/shift-report?date=${date}&shift=${shift}`);
}

export function getSapSyncStatus() {
  return fetchJSON<SapSyncStatus>(`${API_BASE}/sap-sync-status`);
}
