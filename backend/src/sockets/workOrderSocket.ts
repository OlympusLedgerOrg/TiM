import { io } from '../app.js';

export function emitStepCompleted(
  workOrderId: string,
  payload: { stepId: string; notes?: string }
) {
  const room = `work-order:${workOrderId}`;
  io.to(room).emit('stepCompleted', payload);
}
