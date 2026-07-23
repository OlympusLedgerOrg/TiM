import { apiClient } from './apiClient';

export interface DispatchTruck {
  id: string;
  unitNumber: string;
  tankCapacityGallons: number;
  onboardGallons: number;
  availableGallons: number;
  reservedGallons: number;
  dispatchableGallons: number;
  status: string;
  homeYard?: string | null;
  assignedDriver?: { id: string; name: string } | null;
}

export interface DispatchWorkOrder {
  id: string;
  workOrderNumber: string;
  serviceType: string;
  priority: string;
  status: string;
  estimatedGallons: number;
  scheduledStart?: string | null;
  customer: { id: string; name: string; primaryPhone?: string | null };
  serviceLocation: {
    id: string;
    addressLine1: string;
    city: string;
    state: string;
    postalCode: string;
  };
  assignedTruck?: { id: string; unitNumber: string } | null;
  assignedDriver?: { id: string; name: string } | null;
}

export interface CallIntake {
  id: string;
  externalCallId: string;
  callerPhone: string;
  callerName?: string | null;
  summary: string;
  priority: string;
  requestedService?: string | null;
  estimatedGallons?: number | null;
  receivedAt: string;
}

export interface DispatchBoard {
  trucks: DispatchTruck[];
  workOrders: DispatchWorkOrder[];
  callIntakes: CallIntake[];
}

export function getDispatchBoard(): Promise<DispatchBoard> {
  return apiClient.get<DispatchBoard>('/field-service/dispatch-board');
}
