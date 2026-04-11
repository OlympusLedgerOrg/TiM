import { prisma } from '../prisma/client.js';
import { commitToOlympus } from './olympusBridge.js';
import { emitQueueUpdated } from '../sockets/workOrderSocket.js';

export async function logMovement(opts: {
  tenantId: string;
  batchId: string;
  fromWorkCenterId: string;
  toWorkCenterId: string;
  quantity: number;
  movedByUserId: string;
  notes?: string;
}) {
  const batch = await prisma.batch.findFirst({
    where: { id: opts.batchId, tenantId: opts.tenantId },
  });
  if (!batch) return { status: 404, body: { message: 'Batch not found' } };

  const [movement] = await prisma.$transaction([
    prisma.movement.create({
      data: {
        tenantId: opts.tenantId,
        batchId: opts.batchId,
        fromWorkCenterId: opts.fromWorkCenterId,
        toWorkCenterId: opts.toWorkCenterId,
        quantity: opts.quantity,
        movedByUserId: opts.movedByUserId,
        notes: opts.notes,
      },
    }),
    prisma.batch.update({
      where: { id: opts.batchId },
      data: {
        workCenterId: opts.toWorkCenterId,
        status: 'IN_PROGRESS',
      },
    }),
  ]);

  // Fire-and-forget Olympus anchor — never blocks response
  commitToOlympus({
    type: 'MOVEMENT',
    tenantId: opts.tenantId,
    recordId: movement.id,
    data: {
      batchId: opts.batchId,
      lotNumber: batch.lotNumber,
      from: opts.fromWorkCenterId,
      to: opts.toWorkCenterId,
      quantity: opts.quantity,
      movedBy: opts.movedByUserId,
      movedAt: movement.movedAt.toISOString(),
    },
  }).then((commitId) => {
    if (commitId) {
      prisma.movement.update({
        where: { id: movement.id },
        data: { olympusCommitId: commitId },
      }).catch(() => {}); // best-effort
    }
  }).catch(() => {});

  emitQueueUpdated(opts.tenantId);

  return {
    status: 201,
    body: {
      movement: {
        id: movement.id,
        batchId: movement.batchId,
        from: movement.fromWorkCenterId,
        to: movement.toWorkCenterId,
        quantity: movement.quantity,
        movedAt: movement.movedAt,
        olympusCommitId: movement.olympusCommitId,
      },
    },
  };
}
