/**
 * Andon Service — Frontend API client for the public Andon board
 *
 * No authentication required — the Andon board is read-only and
 * designed for wall-mounted TVs on the factory floor.
 */

const API_BASE = '/api/v1/andon';

export interface AndonEquipment {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  statusSince: string;
  plantAreaCode: string | null;
  plantAreaName: string | null;
  workCenterCode: string | null;
  currentDowntime: {
    id: string;
    category: string;
    reasonCode: string;
    reasonText: string | null;
    startedAt: string;
    durationMin: number;
  } | null;
}

export interface AndonPlantArea {
  code: string;
  name: string;
  equipment: AndonEquipment[];
}

export interface AndonBoardData {
  plantAreas: AndonPlantArea[];
  totalEquipment: number;
  downCount: number;
  timestamp: string;
}

export async function getAndonBoard(areaCode?: string, tenant = 'default'): Promise<AndonBoardData> {
  const url = areaCode
    ? `${API_BASE}/${encodeURIComponent(areaCode)}?tenant=${encodeURIComponent(tenant)}`
    : `${API_BASE}?tenant=${encodeURIComponent(tenant)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch andon board: ${res.status}`);
  return res.json();
}
