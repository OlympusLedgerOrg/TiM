import { prisma } from '../prisma/client.js';
import { enqueueOlympusCommit } from './olympusOutbox.js';
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

  // The Olympus anchor is enqueued inside this transaction, so the movement and
  // its ledger commitment are durable together — a crash or an Olympus outage
  // can delay the anchor but can no longer lose it.
  const movement = await prisma.$transaction(async (tx) => {
    const created = await tx.movement.create({
      data: {
        tenantId: opts.tenantId,
        batchId: opts.batchId,
        fromWorkCenterId: opts.fromWorkCenterId,
        toWorkCenterId: opts.toWorkCenterId,
        quantity: opts.quantity,
        movedByUserId: opts.movedByUserId,
        notes: opts.notes,
      },
    });

    await tx.batch.update({
      where: { id: opts.batchId },
      data: {
        workCenterId: opts.toWorkCenterId,
        status: 'IN_PROGRESS',
      },
    });

    await enqueueOlympusCommit(tx, {
      type: 'MOVEMENT',
      tenantId: opts.tenantId,
      recordId: created.id,
      data: {
        batchId: opts.batchId,
        lotNumber: batch.lotNumber,
        from: opts.fromWorkCenterId,
        to: opts.toWorkCenterId,
        quantity: opts.quantity,
        movedBy: opts.movedByUserId,
        movedAt: created.movedAt.toISOString(),
      },
    });

    return created;
  });

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
        // Populated by the outbox drainer once the anchor is committed; null
        // here because the ledger round-trip is deliberately off the request path.
        olympusCommitId: movement.olympusCommitId,
      },
    },
  };
}
