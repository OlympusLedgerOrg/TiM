import { prisma } from '../prisma/client.js';
import { emitStepCompleted } from '../sockets/workOrderSocket.js';

export async function completeStep(opts: {
  workOrderId: string;
  stepId: string;
  notes?: string;
  actorUserId: string;
}) {
  const step = await prisma.step.findFirst({
    where: { id: opts.stepId, workOrderId: opts.workOrderId }
  });
  if (!step) return { status: 404, body: { message: 'Work order or step not found' } };
  if (step.status === 'COMPLETED') return { status: 409, body: { message: 'Step already completed' } };

  const updated = await prisma.step.update({
    where: { id: step.id },
    data: { status: 'COMPLETED', notes: opts.notes ?? step.notes }
  });

  await prisma.auditLog.create({
    data: {
      workOrderId: opts.workOrderId,
      stepId: opts.stepId,
      actorUserId: opts.actorUserId,
      action: 'STEP_COMPLETED',
      metadata: { notes: opts.notes ?? null }
    }
  });

  emitStepCompleted(opts.workOrderId, { stepId: opts.stepId, notes: opts.notes });
  return { status: 200, body: { step: { id: updated.id, status: updated.status, notes: updated.notes } } };
}
