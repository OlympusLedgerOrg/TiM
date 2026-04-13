/**
 * Station Service — Operator-facing API client
 *
 * Powers the station dashboard: active work order, on-hand lots,
 * inbound transfers, material consumption, and production recording.
 */

const API_BASE = '/api/v1/station';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Not authenticated');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StationComponent {
  id: string;
  material: string;
  materialNumber: string;
  required: number;
  consumed: number;
  uom: string;
  lotId: string | null;
  lotNumber: string | null;
  labResult: string | null;
}

export interface StationWorkOrder {
  id: string;
  title: string;
  status: string;
  scheduledEnd: string | null;
  components: StationComponent[];
}

export interface StationLot {
  id: string;
  lotNumber: string;
  material: string;
  materialNumber: string;
  quantity: number;
  uom: string;
  status: string;
  expiresAt: string | null;
  labResult: string | null;
}

export interface StationTransfer {
  id: string;
  lotNumber: string;
  material: string;
  materialNumber: string;
  quantity: number;
  uom: string;
  fromStation: string;
  movedAt: string;
  status: string;
}

// ─── Read Operations ──────────────────────────────────────────────────────────

export async function getStationWorkOrder(workCenter: string): Promise<{ workOrder: StationWorkOrder | null }> {
  const res = await fetch(`${API_BASE}/work-order?workCenter=${encodeURIComponent(workCenter)}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch work order: ${res.status}`);
  return res.json();
}

export async function getStationOnHand(workCenter: string): Promise<{ lots: StationLot[] }> {
  const res = await fetch(`${API_BASE}/on-hand?workCenter=${encodeURIComponent(workCenter)}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch on-hand lots: ${res.status}`);
  return res.json();
}

export async function getStationInbound(workCenter: string): Promise<{ transfers: StationTransfer[] }> {
  const res = await fetch(`${API_BASE}/inbound?workCenter=${encodeURIComponent(workCenter)}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch inbound transfers: ${res.status}`);
  return res.json();
}

// ─── Write Operations ─────────────────────────────────────────────────────────

export async function consumeMaterial(data: {
  workOrderId: string;
  lotId: string;
  quantity: number;
  operatorId?: string;
}): Promise<{ movement: { id: string }; remainingQuantity: number }> {
  const res = await fetch(`${API_BASE}/consume`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(err.message || `Failed to consume material: ${res.status}`);
  }
  return res.json();
}

export async function recordProduction(data: {
  workOrderId: string;
  quantity: number;
  uom: string;
  operatorId?: string;
}): Promise<{ lot: { id: string; quantity: number }; movement: { id: string } }> {
  const res = await fetch(`${API_BASE}/produce`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(err.message || `Failed to record production: ${res.status}`);
  }
  return res.json();
}
