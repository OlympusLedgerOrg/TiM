import { io } from '../app.js';

/**
 * Equipment Socket Events — Real-time equipment state for the station dashboard
 *
 * Events:
 *  - equipmentStateChanged: Equipment status changed (RUNNING → DOWN, etc.)
 *  - downtimeAlert: New downtime event logged
 *  - downtimeResolved: Downtime event closed (machine back up)
 *
 * All events are scoped to tenant rooms for multi-tenant isolation.
 */

export function emitEquipmentStateChanged(
  tenantId: string,
  payload: {
    equipmentId: string;
    code: string;
    status: string;
    previousStatus: string;
    statusSince: string;
  },
) {
  io.to(`tenant:${tenantId}`).emit('equipmentStateChanged', {
    ...payload,
    tenantId,
    ts: new Date().toISOString(),
  });
}

export function emitDowntimeAlert(
  tenantId: string,
  payload: {
    eventId: string;
    equipmentCode: string;
    equipmentName: string;
    category: string;
    reasonCode: string;
    reasonText: string | null;
    startedAt: string;
  },
) {
  io.to(`tenant:${tenantId}`).emit('downtimeAlert', {
    ...payload,
    tenantId,
    ts: new Date().toISOString(),
  });
}

export function emitDowntimeResolved(
  tenantId: string,
  payload: {
    eventId: string;
    equipmentCode: string;
    endedAt: string;
    durationMin: number | null;
  },
) {
  io.to(`tenant:${tenantId}`).emit('downtimeResolved', {
    ...payload,
    tenantId,
    ts: new Date().toISOString(),
  });
}
