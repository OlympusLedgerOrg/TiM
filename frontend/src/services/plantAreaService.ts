/**
 * Plant Area Service — Frontend API client
 *
 * Trelleborg Rutherfordton plant areas:
 *  - Main Plant (MAIN) — Core production lines
 *  - Shipping (SHIP)   — Outbound staging and loading
 *  - New Plant (NEW)   — Expansion area
 */

const API_BASE = '/api/v1/plant-areas';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Not authenticated');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlantAreaSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  workCenterCount: number;
  equipmentCount: number;
}

export interface PlantAreaDetail {
  id: string;
  code: string;
  name: string;
  description: string | null;
  workCenters: Array<{ id: string; code: string; name: string }>;
  equipment: Array<{
    id: string;
    code: string;
    name: string;
    type: string;
    status: string;
    statusSince: string;
  }>;
}

// ─── API Calls ────────────────────────────────────────────────────────────────

export async function getPlantAreas(): Promise<{ plantAreas: PlantAreaSummary[] }> {
  const res = await fetch(API_BASE, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch plant areas: ${res.status}`);
  return res.json();
}

export async function getPlantAreaDetail(code: string): Promise<{ plantArea: PlantAreaDetail }> {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(code)}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch plant area: ${res.status}`);
  return res.json();
}
