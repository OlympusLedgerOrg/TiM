/**
 * Equipment Service — Floor worker API client for equipment, downtime, OEE
 *
 * Powers the station dashboard equipment panel:
 * - Equipment status (🟢 Running / 🔴 Down / 🟡 Idle / 🔧 Maintenance)
 * - Downtime reason entry
 * - OEE metrics
 * - Scrap reason codes
 * - Shift assignments
 *
 * Replaces what Axxos does on separate terminals at Rutherfordton.
 */

const API_BASE = '/api/v1/equipment';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Not authenticated');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type EquipmentStatusValue = 'RUNNING' | 'IDLE' | 'DOWN' | 'MAINTENANCE' | 'SETUP' | 'CHANGEOVER';
export type DowntimeCategoryValue = 'PLANNED' | 'UNPLANNED' | 'CHANGEOVER' | 'MATERIAL_WAIT' | 'QUALITY_HOLD' | 'MAINTENANCE';

export interface EquipmentSummary {
  id: string;
  code: string;
  name: string;
  type: string;
  status: EquipmentStatusValue;
  statusSince: string;
  workCenterCode: string | null;
  axxosEquipmentId: string | null;
  currentDowntime: {
    id: string;
    category: string;
    reasonCode: string;
    reasonText: string | null;
    startedAt: string;
    durationMin: number;
  } | null;
}

export interface DowntimeEvent {
  id: string;
  category: string;
  reasonCode: string;
  reasonText: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMin: number | null;
  isOpen: boolean;
}

export interface OeeSnapshot {
  equipmentId: string;
  equipmentCode: string;
  availability: number;
  performance: number;
  quality: number;
  oee: number;
  targetOee: number | null;
  periodStart: string;
  periodEnd: string;
}

export interface ScrapReason {
  id: string;
  code: string;
  description: string;
  category: string;
}

export interface ShiftAssignment {
  id: string;
  operatorId: string;
  operatorName: string;
  badgeId: string | null;
  shift: string;
  date: string;
  workCenterCode: string | null;
  clockInAt: string | null;
  clockOutAt: string | null;
}

// ─── Equipment State ──────────────────────────────────────────────────────────

export async function getEquipment(workCenter: string): Promise<{ equipment: EquipmentSummary[] }> {
  const res = await fetch(`${API_BASE}?workCenter=${encodeURIComponent(workCenter)}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch equipment: ${res.status}`);
  return res.json();
}

export async function updateEquipmentStatus(
  equipmentId: string,
  data: { status: EquipmentStatusValue; operatorId?: string },
): Promise<{ equipment: { id: string; code: string; status: string; previousStatus: string } }> {
  const res = await fetch(`${API_BASE}/${equipmentId}/status`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(err.message || `Failed to update status: ${res.status}`);
  }
  return res.json();
}

// ─── Downtime ─────────────────────────────────────────────────────────────────

export async function logDowntime(
  equipmentId: string,
  data: {
    category: DowntimeCategoryValue;
    reasonCode: string;
    reasonText?: string;
    reportedById?: string;
    workOrderId?: string;
  },
): Promise<{ event: { id: string; reasonCode: string; startedAt: string } }> {
  const res = await fetch(`${API_BASE}/${equipmentId}/downtime`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(err.message || `Failed to log downtime: ${res.status}`);
  }
  return res.json();
}

export async function closeDowntime(eventId: string): Promise<{ event: { id: string; durationMin: number } }> {
  const res = await fetch(`${API_BASE}/downtime/${eventId}/close`, {
    method: 'PUT',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(err.message || `Failed to close downtime: ${res.status}`);
  }
  return res.json();
}

export async function getDowntimeHistory(
  equipmentId: string,
  hoursBack = 24,
): Promise<{ events: DowntimeEvent[] }> {
  const res = await fetch(`${API_BASE}/${equipmentId}/downtime?hours=${hoursBack}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch downtime history: ${res.status}`);
  return res.json();
}

// ─── OEE ──────────────────────────────────────────────────────────────────────

export async function getOee(
  equipmentId: string,
  start?: string,
  end?: string,
): Promise<OeeSnapshot> {
  const params = new URLSearchParams();
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const res = await fetch(`${API_BASE}/${equipmentId}/oee${qs}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch OEE: ${res.status}`);
  return res.json();
}

// ─── Scrap Reasons ────────────────────────────────────────────────────────────

export async function getScrapReasons(): Promise<{ reasons: ScrapReason[] }> {
  const res = await fetch(`${API_BASE}/scrap-reasons`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch scrap reasons: ${res.status}`);
  return res.json();
}

// ─── Shifts ───────────────────────────────────────────────────────────────────

export async function getShiftAssignments(
  date?: string,
  shift?: string,
): Promise<{ assignments: ShiftAssignment[] }> {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (shift) params.set('shift', shift);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const res = await fetch(`${API_BASE}/shifts${qs}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch shift assignments: ${res.status}`);
  return res.json();
}

export async function clockIn(data: {
  operatorId: string;
  shift: 'FIRST' | 'SECOND' | 'THIRD';
  workCenterCode?: string;
}): Promise<{ assignment: { id: string; clockInAt: string } }> {
  const res = await fetch(`${API_BASE}/shifts/clock-in`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(err.message || `Failed to clock in: ${res.status}`);
  }
  return res.json();
}
