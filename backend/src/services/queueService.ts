import { prisma } from '../prisma/client.js';

export async function getQueueSnapshot(tenantId: string) {
  const workCenters = await prisma.workCenter.findMany({
    where: { tenantId },
    include: {
      batches: {
        where: { status: { in: ['IN_QUEUE', 'IN_PROGRESS', 'FLAGGED'] } },
        include: { material: true },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { code: 'asc' },
  });

  return workCenters.map((wc) => ({
    id: wc.id,
    code: wc.code,
    name: wc.name,
    batchCount: wc.batches.length,
    flaggedCount: wc.batches.filter((b) => b.status === 'FLAGGED').length,
    batches: wc.batches.map((b) => ({
      id: b.id,
      lotNumber: b.lotNumber,
      material: b.material.description,
      quantity: b.quantity,
      status: b.status,
      age: Math.floor((Date.now() - b.createdAt.getTime()) / 60000), // minutes
    })),
  }));
}
