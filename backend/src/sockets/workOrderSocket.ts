import { io } from '../app.js';

export function emitStepCompleted(workOrderId: string, payload: { stepId: string; notes?: string }) {
  const room = `work-order:${workOrderId}`;
  io.to(room).emit('stepCompleted', payload);
}

export function emitQueueUpdated(tenantId: string) {
  io.to(`tenant:${tenantId}`).emit('queueUpdated', { tenantId, ts: new Date().toISOString() });
}
