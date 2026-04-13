import { prisma } from '../prisma/client.js';
import { emitQueueUpdated } from '../sockets/workOrderSocket.js';

/**
 * Station Service — Worker-centric API
 *
 * This replaces what SAP does with MIGO (261/101), CO11N, and MB52 —
 * three separate transactions that shop floor workers shouldn't need to learn.
 * One API, one screen, everything a worker at their station needs.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

interface StationComponent {
  id: string;
  material: string;
  materialNumber: string;
  required: number;
  consumed: number;
  uom: string;
  lotId: string | null;
  lotNumber: string | null;
  labResult: string | null;
}

interface StationWorkOrder {
  id: string;
  title: string;
  status: string;
  scheduledEnd: string | null;
  components: StationComponent[];
}

interface StationLot {
  id: string;
  lotNumber: string;
  material: string;
  materialNumber: string;
  quantity: number;
  uom: string;
  status: string;
  expiresAt: string | null;
  labResult: string | null;
}

interface StationTransfer {
  id: string;
  lotNumber: string;
  material: string;
  materialNumber: string;
  quantity: number;
  uom: string;
  fromStation: string;
  movedAt: string;
  status: string;
}

// ─── Read Operations ──────────────────────────────────────────────────────────

/**
 * Get the active work order at a station (work center) with BOM components
 * and real-time consumption progress.
 *
 * SAP equivalent: CO03 + COOIS + CS03 — but in one call.
 */
export async function getStationWorkOrder(tenantId: string, workCenterCode: string) {
  // Find work center
  const workCenter = await prisma.workCenter.findFirst({
    where: { tenantId, code: workCenterCode },
  });
  if (!workCenter) {
    return { status: 404, body: { message: `Work center ${workCenterCode} not found` } };
  }

  // Find active batches at this work center (IN_PROGRESS first, then IN_QUEUE)
  const activeBatch = await prisma.batch.findFirst({
    where: {
      tenantId,
      workCenterId: workCenter.id,
      status: { in: ['IN_PROGRESS', 'IN_QUEUE'] },
    },
    include: {
      material: true,
    },
    orderBy: [
      { status: 'asc' }, // IN_PROGRESS before IN_QUEUE
      { createdAt: 'asc' },
    ],
  });

  if (!activeBatch) {
    return { status: 200, body: { workOrder: null, message: 'No active work order at this station' } };
  }

  // Find associated work order (via material)
  const workOrder = await prisma.workOrder.findFirst({
    where: {
      tenantId,
      materialId: activeBatch.materialId,
      status: { in: ['IN_PROGRESS', 'RELEASED'] },
    },
    include: {
      bom: {
        include: {
          items: {
            include: {
              material: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Build components list from BOM items if available
  const components: StationComponent[] = [];

  if (workOrder?.bom?.items) {
    for (const item of workOrder.bom.items) {
      // Find the lot that's been assigned/reserved for this material
      const reservation = await prisma.reservation.findFirst({
        where: {
          workOrderId: workOrder.id,
          lot: { materialId: item.materialId },
          status: { in: ['ACTIVE', 'CONSUMED'] },
        },
        include: {
          lot: true,
        },
      });

      // Sum consumed quantity from inventory movements
      const consumedResult = await prisma.inventoryMovement.aggregate({
        where: {
          workOrderId: workOrder.id,
          lot: { materialId: item.materialId },
          type: 'CONSUME',
        },
        _sum: { quantity: true },
      });

      // Find latest lab result for lots of this material at this work center
      const latestBatch = await prisma.batch.findFirst({
        where: {
          tenantId,
          materialId: item.materialId,
        },
        include: {
          labReports: {
            orderBy: { submittedAt: 'desc' },
            take: 1,
          },
        },
      });

      const labResult = latestBatch?.labReports?.[0]?.result ?? null;

      components.push({
        id: item.id,
        material: item.material.description,
        materialNumber: item.material.sapMaterialNumber || item.material.id,
        required: item.quantity,
        consumed: consumedResult._sum.quantity ?? 0,
        uom: item.uom,
        lotId: reservation?.lot?.id ?? null,
        lotNumber: reservation?.lot?.id ? `LOT-${reservation.lot.id.slice(0, 12)}` : null,
        labResult,
      });
    }
  }

  const stationWO: StationWorkOrder = {
    id: workOrder?.id ?? activeBatch.id,
    title: workOrder?.title ?? `${activeBatch.material.description} — ${activeBatch.lotNumber}`,
    status: workOrder?.status ?? (activeBatch.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'RELEASED'),
    scheduledEnd: workOrder?.scheduledEnd?.toISOString() ?? null,
    components,
  };

  return { status: 200, body: { workOrder: stationWO } };
}

/**
 * Get on-hand lots at a work center.
 *
 * SAP equivalent: MB52 (warehouse stock) + QA32 (quality) — but useful.
 */
export async function getStationOnHand(tenantId: string, workCenterCode: string) {
  const workCenter = await prisma.workCenter.findFirst({
    where: { tenantId, code: workCenterCode },
  });
  if (!workCenter) {
    return { status: 404, body: { message: `Work center ${workCenterCode} not found` } };
  }

  // Get batches at this work center with their materials and lab reports
  const batches = await prisma.batch.findMany({
    where: {
      tenantId,
      workCenterId: workCenter.id,
    },
    include: {
      material: true,
      labReports: {
        orderBy: { submittedAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const lots: StationLot[] = batches.map(b => ({
    id: b.id,
    lotNumber: b.lotNumber,
    material: b.material.description,
    materialNumber: b.material.sapMaterialNumber || b.material.id,
    quantity: Number(b.quantity),
    uom: b.material.unitOfMeasure,
    status: b.status === 'FLAGGED' ? 'QUARANTINED' : 'ACTIVE',
    expiresAt: null, // Could be extended with lot expiry tracking
    labResult: b.labReports[0]?.result ?? null,
  }));

  return { status: 200, body: { lots } };
}

/**
 * Get inbound transfers heading to this work center.
 *
 * SAP equivalent: VL06I (inbound deliveries) — but actually shows what's coming.
 */
export async function getStationInbound(tenantId: string, workCenterCode: string) {
  const workCenter = await prisma.workCenter.findFirst({
    where: { tenantId, code: workCenterCode },
  });
  if (!workCenter) {
    return { status: 404, body: { message: `Work center ${workCenterCode} not found` } };
  }

  // Get recent movements TO this work center (last 24 hours)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const movements = await prisma.movement.findMany({
    where: {
      tenantId,
      toWorkCenterId: workCenter.id,
      movedAt: { gte: since },
    },
    include: {
      batch: {
        include: { material: true },
      },
      fromWorkCenter: true,
    },
    orderBy: { movedAt: 'desc' },
    take: 20,
  });

  const transfers: StationTransfer[] = movements.map(m => ({
    id: m.id,
    lotNumber: m.batch.lotNumber,
    material: m.batch.material.description,
    materialNumber: m.batch.material.sapMaterialNumber || m.batch.material.id,
    quantity: Number(m.quantity),
    uom: m.batch.material.unitOfMeasure,
    fromStation: m.fromWorkCenter.name,
    movedAt: m.movedAt.toISOString(),
    status: 'IN_TRANSIT',
  }));

  return { status: 200, body: { transfers } };
}

// ─── Write Operations ─────────────────────────────────────────────────────────

/**
 * Consume material for a work order — what workers do when they weigh and add
 * raw materials to the mixer.
 *
 * SAP equivalent: MIGO movement type 261 (goods issue to production order).
 * But instead of navigating 6 screens and entering a movement type code,
 * the worker just scans the lot and enters the weight.
 */
export async function consumeMaterial(opts: {
  tenantId: string;
  workOrderId: string;
  lotId: string;
  quantity: number;
  operatorId?: string;
}) {
  // Verify work order exists and is active
  const workOrder = await prisma.workOrder.findFirst({
    where: {
      id: opts.workOrderId,
      tenantId: opts.tenantId,
      status: { in: ['IN_PROGRESS', 'RELEASED'] },
    },
  });
  if (!workOrder) {
    return { status: 404, body: { message: 'Active work order not found' } };
  }

  // Verify lot exists and is available
  const lot = await prisma.lot.findFirst({
    where: {
      id: opts.lotId,
      status: { in: ['ACTIVE', 'RESERVED'] },
    },
  });
  if (!lot) {
    return { status: 404, body: { message: 'Lot not found or not available' } };
  }

  if (opts.quantity > lot.quantity) {
    return { status: 400, body: { message: `Cannot consume ${opts.quantity} — only ${lot.quantity} available` } };
  }

  // Record consumption in a transaction
  const [movement, updatedLot] = await prisma.$transaction([
    prisma.inventoryMovement.create({
      data: {
        lotId: opts.lotId,
        type: 'CONSUME',
        quantity: opts.quantity,
        workOrderId: opts.workOrderId,
        operatorId: opts.operatorId,
        metadata: { consumedAt: new Date().toISOString() },
      },
    }),
    prisma.lot.update({
      where: { id: opts.lotId },
      data: {
        quantity: { decrement: opts.quantity },
        status: (lot.quantity - opts.quantity) < 0.001 ? 'CONSUMED' : lot.status,
      },
    }),
  ]);

  emitQueueUpdated(opts.tenantId);

  return {
    status: 201,
    body: {
      movement: {
        id: movement.id,
        type: movement.type,
        quantity: movement.quantity,
        lotId: movement.lotId,
        workOrderId: movement.workOrderId,
      },
      remainingQuantity: updatedLot.quantity,
    },
  };
}

/**
 * Record production output — when the batch is done and the worker weighs
 * the finished product.
 *
 * SAP equivalent: CO11N (confirmation) + MIGO 101 (goods receipt).
 * Two separate SAP transactions collapsed into one simple action.
 */
export async function recordProduction(opts: {
  tenantId: string;
  workOrderId: string;
  quantity: number;
  uom: string;
  operatorId?: string;
}) {
  const workOrder = await prisma.workOrder.findFirst({
    where: {
      id: opts.workOrderId,
      tenantId: opts.tenantId,
      status: { in: ['IN_PROGRESS', 'RELEASED'] },
    },
    include: { material: true },
  });
  if (!workOrder) {
    return { status: 404, body: { message: 'Active work order not found' } };
  }
  if (!workOrder.materialId) {
    return { status: 400, body: { message: 'Work order has no output material defined' } };
  }

  // Create output lot, then record the production movement
  const result = await prisma.$transaction(async (tx) => {
    const outputLot = await tx.lot.create({
      data: {
        materialId: workOrder.materialId!,
        quantity: opts.quantity,
        uom: opts.uom,
        status: 'ACTIVE',
        workOrderId: opts.workOrderId,
      },
    });

    const movement = await tx.inventoryMovement.create({
      data: {
        lotId: outputLot.id,
        type: 'PRODUCE',
        quantity: opts.quantity,
        workOrderId: opts.workOrderId,
        operatorId: opts.operatorId,
        metadata: { producedAt: new Date().toISOString() },
      },
    });

    return { outputLot, movement };
  });

  const { outputLot, movement } = result;

  emitQueueUpdated(opts.tenantId);

  return {
    status: 201,
    body: {
      lot: {
        id: outputLot.id,
        materialId: outputLot.materialId,
        quantity: outputLot.quantity,
        uom: outputLot.uom,
        status: outputLot.status,
        workOrderId: outputLot.workOrderId,
      },
      movement: {
        id: movement.id,
        type: 'PRODUCE',
        quantity: movement.quantity,
      },
    },
  };
}
