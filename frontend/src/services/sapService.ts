/**
 * SAP Integration Service
 * Client-side service for calling SAP integration APIs
 */

const API_BASE = '/api/v1/sap';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Not authenticated');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export interface SAPMaterial {
  MaterialNumber: string;
  Description: string;
  UnitOfMeasure: string;
  MaterialID: string;
  CreatedAt: string;
}

export interface SAPBatch {
  LotNumber: string;
  MaterialNumber: string;
  MaterialDescription: string;
  Quantity: string;
  UnitOfMeasure: string;
  Status: string;
  WorkCenter: string;
  WorkCenterName: string;
  CreatedAt: string;
  UpdatedAt: string;
  BatchID: string;
}

export interface SAPMovement {
  MovementID: string;
  LotNumber: string;
  MaterialNumber: string;
  Quantity: string;
  UnitOfMeasure: string;
  FromWorkCenter: string;
  ToWorkCenter: string;
  MovedBy: string;
  MovedAt: string;
  Notes: string;
  OlympusCommitID: string;
}

export interface SAPPlantInfo {
  PlantCode: string;
  PlantName: string;
  PlantID: string;
  WorkCenters: Array<{
    WorkCenter: string;
    WorkCenterName: string;
    Description: string;
  }>;
}

export async function getPlantInfo(): Promise<SAPPlantInfo> {
  const res = await fetch(`${API_BASE}/plant`, {
    headers: getAuthHeaders(),
  });
  
  if (!res.ok) {
    throw new Error(`Failed to fetch plant info: ${res.status}`);
  }
  
  return res.json();
}

export async function getMaterials(): Promise<SAPMaterial[]> {
  const res = await fetch(`${API_BASE}/materials`, {
    headers: getAuthHeaders(),
  });
  
  if (!res.ok) {
    throw new Error(`Failed to fetch materials: ${res.status}`);
  }
  
  const data = await res.json();
  return data.value || [];
}

export async function getBatches(filters?: {
  status?: string;
  workCenter?: string;
}): Promise<SAPBatch[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.workCenter) params.set('workCenter', filters.workCenter);
  
  const url = `${API_BASE}/batches${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url, {
    headers: getAuthHeaders(),
  });
  
  if (!res.ok) {
    throw new Error(`Failed to fetch batches: ${res.status}`);
  }
  
  const data = await res.json();
  return data.value || [];
}

export async function getMovements(fromDate?: Date): Promise<SAPMovement[]> {
  const params = new URLSearchParams();
  if (fromDate) {
    params.set('fromDate', fromDate.toISOString());
  }
  
  const url = `${API_BASE}/movements${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url, {
    headers: getAuthHeaders(),
  });
  
  if (!res.ok) {
    throw new Error(`Failed to fetch movements: ${res.status}`);
  }
  
  const data = await res.json();
  return data.value || [];
}

export async function syncMaterial(materialData: {
  materialNumber: string;
  description: string;
  unitOfMeasure: string;
}): Promise<{ material: SAPMaterial; created: boolean }> {
  const res = await fetch(`${API_BASE}/materials/sync`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(materialData),
  });
  
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to sync material: ${res.status} ${error}`);
  }
  
  return res.json();
}
