import { prisma } from '../prisma/client.js';
import { emitStepCompleted } from '../sockets/workOrderSocket.js';

export async function completeStep(opts: {
  tenantId: string;
  workOrderId: string;
  stepId: string;
  notes?: string;
  actorUserId: string;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const step = await tx.step.findFirst({
      where: { id: opts.stepId, workOrderId: opts.workOrderId, tenantId: opts.tenantId }
    });
    if (!step) return { status: 404, body: { message: 'Work order or step not found' } };
    if (step.status === 'COMPLETED') return { status: 409, body: { message: 'Step already completed' } };

    const updated = await tx.step.update({
      where: { id: step.id },
      data: { status: 'COMPLETED', notes: opts.notes ?? step.notes }
    });

    await tx.auditLog.create({
      data: {
        tenantId: opts.tenantId,
        workOrderId: opts.workOrderId,
        stepId: opts.stepId,
        actorUserId: opts.actorUserId,
        action: 'STEP_COMPLETED',
        metadata: { notes: opts.notes ?? null }
      }
    });

    return {
      status: 200,
      body: { step: { id: updated.id, status: updated.status, notes: updated.notes } }
    };
  });

  if (result.status === 200) {
    emitStepCompleted(opts.workOrderId, { stepId: opts.stepId, notes: opts.notes });
  }
  return result;
}
