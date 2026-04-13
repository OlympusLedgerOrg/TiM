import { prisma } from '../prisma/client.js';

/**
 * Allocation Service — FIFO / FEFO reservation + auto-allocation algorithm
 *
 * Handles:
 * - FIFO / FEFO lot selection strategies
 * - Partial lot consumption across multiple lots
 * - Reservation-based inventory locking (no double-allocation)
 * - Concurrency safety via SELECT FOR UPDATE row locking
 * - Edge cases: expiry, quarantine, fragmentation, shortages
 *
 * Flow:
 * 1. allocateMaterial()  — reserve lots for a work order
 * 2. consumeReservation() — deduct from lot when production executes
 * 3. releaseReservation() — cancel a reservation (return stock)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type AllocationStrategy = 'FIFO' | 'FEFO';

export interface AllocateMaterialInput {
  materialId: string;
  requiredQty: number;
  strategy: AllocationStrategy;
  workOrderId: string;
}

export interface AllocationResult {
  success: boolean;
  allocated: Array<{ lotId: string; reserved: number }>;
  shortage: number;
}

// Minimum usable quantity — lots below this threshold are skipped to avoid
// excessive fragmentation from near-empty lots.
const MIN_USABLE_QTY = 0.001;

// ─── Core Allocation ──────────────────────────────────────────────────────────

/**
 * Allocate material for a work order from eligible lots (FIFO or FEFO).
 *
 * Uses an interactive Prisma transaction with row-level locking to prevent
 * concurrent work orders from double-reserving the same stock.
 *
 * Returns a result object instead of throwing on shortage, so the caller
 * can decide how to handle partial allocations.
 */
export async function allocateMaterial(
  input: AllocateMaterialInput,
): Promise<AllocationResult> {
  const { materialId, requiredQty, strategy, workOrderId } = input;

  return prisma.$transaction(async (tx) => {
    // Row-level lock: prevent concurrent allocations from seeing the same
    // available quantities.  This SELECT FOR UPDATE blocks other transactions
    // until we commit.
    await tx.$queryRawUnsafe(
      `SELECT id FROM "Lot" WHERE "materialId" = $1 FOR UPDATE`,
      materialId,
    );

    // 1. Fetch eligible lots ordered by strategy
    const lots = await getEligibleLots(tx, materialId, strategy);

    let remaining = requiredQty;
    const allocated: Array<{ lotId: string; reserved: number }> = [];

    for (const lot of lots) {
      if (remaining <= 0) break;

      const available = await getAvailableQty(tx, lot.id);

      // Skip near-empty lots to reduce fragmentation
      if (available < MIN_USABLE_QTY) continue;

      const takeQty = Math.min(available, remaining);

      // Create reservation
      await tx.reservation.create({
        data: {
          lotId: lot.id,
          workOrderId,
          quantity: takeQty,
          status: 'ACTIVE',
        },
      });

      allocated.push({ lotId: lot.id, reserved: takeQty });
      remaining -= takeQty;
    }

    // 2. Handle shortage — return result instead of throwing so UI can show
    // partial allocation info (e.g., "You're short 12.5 kg of Compound X")
    if (remaining > 0) {
      return { success: false, allocated, shortage: remaining };
    }

    return { success: true, allocated, shortage: 0 };
  });
}

// ─── Lot Selection ────────────────────────────────────────────────────────────

/**
 * Fetch lots eligible for allocation.
 *
 * Eligibility:
 * - status = ACTIVE
 * - quantity > 0
 * - not expired (for FEFO, expiryDate must be in the future or null)
 *
 * Ordering:
 * - FIFO: createdAt ASC
 * - FEFO: expiryDate ASC (nulls last via Prisma default), then createdAt ASC
 */
async function getEligibleLots(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  materialId: string,
  strategy: AllocationStrategy,
) {
  const now = new Date();

  const expiryFilter =
    strategy === 'FEFO'
      ? { OR: [{ expiryDate: { gt: now } }, { expiryDate: null }] }
      : {};

  const orderBy =
    strategy === 'FEFO'
      ? ([{ expiryDate: 'asc' as const }, { createdAt: 'asc' as const }])
      : ([{ createdAt: 'asc' as const }]);

  return tx.lot.findMany({
    where: {
      materialId,
      status: 'ACTIVE',
      quantity: { gt: 0 },
      ...expiryFilter,
    },
    orderBy,
  });
}

// ─── Available Quantity ───────────────────────────────────────────────────────

/**
 * Compute available (unreserved) quantity for a lot.
 *
 *   available = lot.quantity - sum(active reservations)
 */
async function getAvailableQty(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  lotId: string,
): Promise<number> {
  const lot = await tx.lot.findUnique({ where: { id: lotId } });
  if (!lot) return 0;

  const agg = await tx.reservation.aggregate({
    where: { lotId, status: 'ACTIVE' },
    _sum: { quantity: true },
  });

  const reserved = agg._sum.quantity ?? 0;
  return lot.quantity - reserved;
}

// ─── Consumption ──────────────────────────────────────────────────────────────

/**
 * Consume a reservation — called when production actually uses the material.
 *
 * 1. Deducts quantity from the lot
 * 2. Marks reservation as CONSUMED
 * 3. Logs an InventoryMovement for full audit trail
 */
export async function consumeReservation(reservationId: string) {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      return { success: false, message: 'Reservation not found' };
    }

    if (reservation.status !== 'ACTIVE') {
      return {
        success: false,
        message: `Reservation is ${reservation.status}, expected ACTIVE`,
      };
    }

    // Deduct from lot
    const updatedLot = await tx.lot.update({
      where: { id: reservation.lotId },
      data: {
        quantity: { decrement: reservation.quantity },
      },
    });

    // Auto-mark lot as CONSUMED if effectively empty
    if (updatedLot.quantity < MIN_USABLE_QTY) {
      await tx.lot.update({
        where: { id: reservation.lotId },
        data: { status: 'CONSUMED' },
      });
    }

    // Mark reservation consumed
    await tx.reservation.update({
      where: { id: reservationId },
      data: { status: 'CONSUMED' },
    });

    // Log movement for traceability
    const movement = await tx.inventoryMovement.create({
      data: {
        lotId: reservation.lotId,
        type: 'CONSUME',
        quantity: reservation.quantity,
        workOrderId: reservation.workOrderId,
      },
    });

    return {
      success: true,
      movement: {
        id: movement.id,
        type: movement.type,
        quantity: movement.quantity,
        lotId: movement.lotId,
        workOrderId: movement.workOrderId,
      },
      remainingLotQuantity: Math.max(updatedLot.quantity, 0),
    };
  });
}

// ─── Release ──────────────────────────────────────────────────────────────────

/**
 * Release (cancel) a reservation — returns stock to available pool.
 */
export async function releaseReservation(reservationId: string) {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      return { success: false, message: 'Reservation not found' };
    }

    if (reservation.status !== 'ACTIVE') {
      return {
        success: false,
        message: `Reservation is ${reservation.status}, expected ACTIVE`,
      };
    }

    await tx.reservation.update({
      where: { id: reservationId },
      data: { status: 'CANCELLED' },
    });

    return { success: true };
  });
}

// ─── Simulation ───────────────────────────────────────────────────────────────

/**
 * Simulate an allocation without actually creating reservations.
 *
 * Used for planning / forecasting — shows what lots would be used and whether
 * there is sufficient stock, without locking anything.
 */
export async function simulateAllocation(
  input: Omit<AllocateMaterialInput, 'workOrderId'>,
): Promise<AllocationResult> {
  const { materialId, requiredQty, strategy } = input;

  // Read-only — no transaction locking needed
  const now = new Date();

  const expiryFilter =
    strategy === 'FEFO'
      ? { OR: [{ expiryDate: { gt: now } }, { expiryDate: null }] }
      : {};

  const orderBy =
    strategy === 'FEFO'
      ? ([{ expiryDate: 'asc' as const }, { createdAt: 'asc' as const }])
      : ([{ createdAt: 'asc' as const }]);

  const lots = await prisma.lot.findMany({
    where: {
      materialId,
      status: 'ACTIVE',
      quantity: { gt: 0 },
      ...expiryFilter,
    },
    orderBy,
  });

  let remaining = requiredQty;
  const allocated: Array<{ lotId: string; reserved: number }> = [];

  for (const lot of lots) {
    if (remaining <= 0) break;

    // Compute available for this lot
    const agg = await prisma.reservation.aggregate({
      where: { lotId: lot.id, status: 'ACTIVE' },
      _sum: { quantity: true },
    });
    const reserved = agg._sum.quantity ?? 0;
    const available = lot.quantity - reserved;

    if (available < MIN_USABLE_QTY) continue;

    const takeQty = Math.min(available, remaining);
    allocated.push({ lotId: lot.id, reserved: takeQty });
    remaining -= takeQty;
  }

  return {
    success: remaining <= 0,
    allocated,
    shortage: Math.max(remaining, 0),
  };
}
