import { prisma } from '../prisma/client.js';
import { emitEquipmentStateChanged, emitDowntimeAlert } from '../sockets/equipmentSocket.js';
import { sendTeamsAlert } from './teamsNotificationService.js';

/**
 * Equipment Service — Axxos-style equipment tracking for floor workers
 *
 * Provides:
 * - Equipment state management (RUNNING, IDLE, DOWN, MAINTENANCE, SETUP, CHANGEOVER)
 * - Downtime event tracking with reason codes
 * - Scrap reason code management
 * - OEE calculation (Availability × Performance × Quality)
 * - Shift assignment management
 *
 * This is what Axxos does for Trelleborg — but integrated into TiM so
 * a press operator has ONE screen instead of TWO systems.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

type EquipmentStatusValue = 'RUNNING' | 'IDLE' | 'DOWN' | 'MAINTENANCE' | 'SETUP' | 'CHANGEOVER';
type DowntimeCategoryValue = 'PLANNED' | 'UNPLANNED' | 'CHANGEOVER' | 'MATERIAL_WAIT' | 'QUALITY_HOLD' | 'MAINTENANCE';

export interface EquipmentSummary {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  statusSince: string;
  workCenterCode: string | null;
  axxosEquipmentId: string | null;
  currentDowntime: {
    id: string;
    category: string;
    reasonCode: string;
    reasonText: string | null;
    startedAt: string;
    durationMin: number;
  } | null;
}

export interface OeeSnapshot {
  equipmentId: string;
  equipmentCode: string;
  availability: number;  // 0-1
  performance: number;   // 0-1
  quality: number;       // 0-1
  oee: number;           // 0-1
  targetOee: number | null;
  periodStart: string;
  periodEnd: string;
}

// ─── Equipment State ──────────────────────────────────────────────────────────

/**
 * Get all equipment at a work center — what the operator sees on the station dashboard.
 */
export async function getEquipmentByWorkCenter(tenantId: string, workCenterCode: string) {
  const workCenter = await prisma.workCenter.findFirst({
    where: { tenantId, code: workCenterCode },
  });
  if (!workCenter) {
    return { status: 404, body: { message: `Work center ${workCenterCode} not found` } };
  }

  const equipment = await prisma.equipment.findMany({
    where: { tenantId, workCenterId: workCenter.id, isActive: true },
    orderBy: { code: 'asc' },
  });

  const activeDowntimeEvents = equipment.length > 0
    ? await prisma.downtimeEvent.findMany({
        where: {
          equipmentId: { in: equipment.map(eq => eq.id) },
          endedAt: null,
        },
        orderBy: { startedAt: 'desc' },
      })
    : [];

  const downtimeByEquipment = new Map<string, typeof activeDowntimeEvents[0]>();
  for (const event of activeDowntimeEvents) {
    if (!downtimeByEquipment.has(event.equipmentId)) {
      downtimeByEquipment.set(event.equipmentId, event);
    }
  }

  const summaries: EquipmentSummary[] = equipment.map((eq) => {
    const activeDowntime = downtimeByEquipment.get(eq.id) || null;
    return {
      id: eq.id,
      code: eq.code,
      name: eq.name,
      type: eq.type,
      status: eq.status,
      statusSince: eq.statusSince.toISOString(),
      workCenterCode,
      axxosEquipmentId: eq.axxosEquipmentId,
      currentDowntime: activeDowntime ? {
        id: activeDowntime.id,
        category: activeDowntime.category,
        reasonCode: activeDowntime.reasonCode,
        reasonText: activeDowntime.reasonText,
        startedAt: activeDowntime.startedAt.toISOString(),
        durationMin: (Date.now() - activeDowntime.startedAt.getTime()) / 60000,
      } : null,
    };
  });

  return { status: 200, body: { equipment: summaries } };
}

/**
 * Update equipment status — called when operator changes machine state
 * or when Axxos sync pushes an update.
 */
export async function updateEquipmentStatus(opts: {
  tenantId: string;
  equipmentId: string;
  status: EquipmentStatusValue;
  operatorId?: string;
}) {
  const equipment = await prisma.equipment.findFirst({
    where: { id: opts.equipmentId, tenantId: opts.tenantId },
  });
  if (!equipment) {
    return { status: 404, body: { message: 'Equipment not found' } };
  }

  const previousStatus = equipment.status;

  const updated = await prisma.equipment.update({
    where: { id: opts.equipmentId },
    data: {
      status: opts.status,
      statusSince: new Date(),
      currentOperatorId: opts.operatorId ?? equipment.currentOperatorId,
    },
  });

  // If going DOWN, auto-create a downtime event
  if (opts.status === 'DOWN' && previousStatus !== 'DOWN') {
    await prisma.downtimeEvent.create({
      data: {
        tenantId: opts.tenantId,
        equipmentId: opts.equipmentId,
        category: 'UNPLANNED',
        reasonCode: 'PENDING',
        reportedById: opts.operatorId,
      },
    });
  }

  // If recovering from DOWN, auto-close open downtime
  if (previousStatus === 'DOWN' && opts.status !== 'DOWN') {
    const openDowntime = await prisma.downtimeEvent.findFirst({
      where: { equipmentId: opts.equipmentId, endedAt: null },
    });
    if (openDowntime) {
      const durationMin = (Date.now() - openDowntime.startedAt.getTime()) / 60000;
      await prisma.downtimeEvent.update({
        where: { id: openDowntime.id },
        data: { endedAt: new Date(), durationMin },
      });
    }
  }

  emitEquipmentStateChanged(opts.tenantId, {
    equipmentId: updated.id,
    code: updated.code,
    status: updated.status,
    previousStatus,
    statusSince: updated.statusSince.toISOString(),
  });

  return {
    status: 200,
    body: {
      equipment: {
        id: updated.id,
        code: updated.code,
        status: updated.status,
        previousStatus,
        statusSince: updated.statusSince.toISOString(),
      },
    },
  };
}

// ─── Downtime Events ──────────────────────────────────────────────────────────

/**
 * Log a downtime event — what the operator taps when the press goes down.
 *
 * This is what Axxos captures from their fixed terminals. TiM captures it
 * from the operator's tablet so they don't have to walk to a separate screen.
 */
export async function logDowntimeEvent(opts: {
  tenantId: string;
  equipmentId: string;
  category: DowntimeCategoryValue;
  reasonCode: string;
  reasonText?: string;
  reportedById?: string;
  workOrderId?: string;
}) {
  const equipment = await prisma.equipment.findFirst({
    where: { id: opts.equipmentId, tenantId: opts.tenantId },
  });
  if (!equipment) {
    return { status: 404, body: { message: 'Equipment not found' } };
  }

  const event = await prisma.downtimeEvent.create({
    data: {
      tenantId: opts.tenantId,
      equipmentId: opts.equipmentId,
      category: opts.category,
      reasonCode: opts.reasonCode,
      reasonText: opts.reasonText,
      reportedById: opts.reportedById,
      workOrderId: opts.workOrderId,
    },
  });

  // Update equipment status to DOWN if not already
  if (equipment.status !== 'DOWN' && equipment.status !== 'MAINTENANCE') {
    await prisma.equipment.update({
      where: { id: opts.equipmentId },
      data: { status: 'DOWN', statusSince: new Date() },
    });
  }

  emitDowntimeAlert(opts.tenantId, {
    eventId: event.id,
    equipmentCode: equipment.code,
    equipmentName: equipment.name,
    category: event.category,
    reasonCode: event.reasonCode,
    reasonText: event.reasonText,
    startedAt: event.startedAt.toISOString(),
  });

  // Fire-and-forget Teams notification
  sendTeamsAlert(opts.tenantId, 'downtime', {
    equipmentCode: equipment.code,
    equipmentName: equipment.name,
    category: event.category,
    reasonCode: event.reasonCode,
    reasonText: event.reasonText ?? undefined,
    startedAt: event.startedAt.toISOString(),
  }).catch(() => { /* non-blocking */ });

  return {
    status: 201,
    body: {
      event: {
        id: event.id,
        equipmentId: event.equipmentId,
        category: event.category,
        reasonCode: event.reasonCode,
        reasonText: event.reasonText,
        startedAt: event.startedAt.toISOString(),
      },
    },
  };
}

/**
 * Close a downtime event — operator taps "machine back up."
 */
export async function closeDowntimeEvent(opts: {
  tenantId: string;
  eventId: string;
}) {
  const event = await prisma.downtimeEvent.findFirst({
    where: { id: opts.eventId, tenantId: opts.tenantId },
  });
  if (!event) {
    return { status: 404, body: { message: 'Downtime event not found' } };
  }
  if (event.endedAt) {
    return { status: 400, body: { message: 'Downtime event already closed' } };
  }

  const durationMin = (Date.now() - event.startedAt.getTime()) / 60000;

  const updated = await prisma.downtimeEvent.update({
    where: { id: opts.eventId },
    data: { endedAt: new Date(), durationMin },
  });

  return {
    status: 200,
    body: {
      event: {
        id: updated.id,
        equipmentId: updated.equipmentId,
        endedAt: updated.endedAt!.toISOString(),
        durationMin: updated.durationMin,
      },
    },
  };
}

/**
 * Get downtime history for an equipment — for supervisors reviewing shift performance.
 */
export async function getDowntimeHistory(tenantId: string, equipmentId: string, hoursBack = 24) {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const events = await prisma.downtimeEvent.findMany({
    where: {
      tenantId,
      equipmentId,
      startedAt: { gte: since },
    },
    orderBy: { startedAt: 'desc' },
    take: 50,
  });

  return {
    status: 200,
    body: {
      events: events.map(e => ({
        id: e.id,
        category: e.category,
        reasonCode: e.reasonCode,
        reasonText: e.reasonText,
        startedAt: e.startedAt.toISOString(),
        endedAt: e.endedAt?.toISOString() ?? null,
        durationMin: e.endedAt
          ? e.durationMin
          : (Date.now() - e.startedAt.getTime()) / 60000,
        isOpen: !e.endedAt,
      })),
    },
  };
}

// ─── OEE Calculation ──────────────────────────────────────────────────────────

/**
 * Calculate OEE for an equipment over a time period.
 *
 * OEE = Availability × Performance × Quality
 *
 * - Availability = (Planned Time − Downtime) / Planned Time
 * - Performance  = (Ideal Cycle Time × Total Pieces) / Operating Time
 * - Quality      = Good Pieces / Total Pieces
 *
 * For now, we compute Availability from downtime events. Performance and
 * Quality require production data that will come from the station produce
 * and scrap endpoints. Returns placeholders until fully wired.
 */
export async function calculateOee(
  tenantId: string,
  equipmentId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<{ status: number; body: OeeSnapshot | { message: string } }> {
  const equipment = await prisma.equipment.findFirst({
    where: { id: equipmentId, tenantId },
  });
  if (!equipment) {
    return { status: 404, body: { message: 'Equipment not found' } };
  }

  const plannedMinutes = (periodEnd.getTime() - periodStart.getTime()) / 60000;
  if (plannedMinutes <= 0) {
    return { status: 400, body: { message: 'Invalid time period' } };
  }

  // Sum downtime minutes in period
  const downtimeEvents = await prisma.downtimeEvent.findMany({
    where: {
      equipmentId,
      tenantId,
      startedAt: { gte: periodStart },
      OR: [
        { endedAt: { lte: periodEnd } },
        { endedAt: null }, // Still open
      ],
    },
  });

  let downtimeMinutes = 0;
  for (const evt of downtimeEvents) {
    const start = evt.startedAt.getTime();
    const end = evt.endedAt ? evt.endedAt.getTime() : Date.now();
    const clampedStart = Math.max(start, periodStart.getTime());
    const clampedEnd = Math.min(end, periodEnd.getTime());
    if (clampedEnd > clampedStart) {
      downtimeMinutes += (clampedEnd - clampedStart) / 60000;
    }
  }

  const availability = Math.max(0, (plannedMinutes - downtimeMinutes) / plannedMinutes);

  // Performance and Quality default to 1.0 until production/scrap data is wired
  const performance = 1.0;
  const quality = 1.0;
  const oee = availability * performance * quality;

  return {
    status: 200,
    body: {
      equipmentId: equipment.id,
      equipmentCode: equipment.code,
      availability: Math.round(availability * 1000) / 1000,
      performance,
      quality,
      oee: Math.round(oee * 1000) / 1000,
      targetOee: equipment.targetOee,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    },
  };
}

// ─── Scrap Reason Codes ───────────────────────────────────────────────────────

/**
 * Get scrap reason codes — dropdown for operator when scrapping a batch.
 */
export async function getScrapReasons(tenantId: string) {
  const reasons = await prisma.scrapReason.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ category: 'asc' }, { code: 'asc' }],
  });

  return {
    status: 200,
    body: {
      reasons: reasons.map(r => ({
        id: r.id,
        code: r.code,
        description: r.description,
        category: r.category,
      })),
    },
  };
}

// ─── Shift Assignments ────────────────────────────────────────────────────────

/**
 * Get shift assignments for a date — who's on what station.
 */
export async function getShiftAssignments(tenantId: string, date: string, shift?: string) {
  const dateFilter = new Date(date);

  const whereClause: Record<string, unknown> = {
    tenantId,
    date: dateFilter,
  };
  if (shift) {
    whereClause.shift = shift;
  }

  const assignments = await prisma.shiftAssignment.findMany({
    where: whereClause,
    include: {
      operator: true,
    },
    orderBy: [{ shift: 'asc' }, { workCenterCode: 'asc' }],
  });

  return {
    status: 200,
    body: {
      assignments: assignments.map(a => ({
        id: a.id,
        operatorId: a.operatorId,
        operatorName: a.operator.name,
        badgeId: a.operator.badgeId,
        shift: a.shift,
        date: a.date.toISOString().slice(0, 10),
        workCenterCode: a.workCenterCode,
        clockInAt: a.clockInAt?.toISOString() ?? null,
        clockOutAt: a.clockOutAt?.toISOString() ?? null,
      })),
    },
  };
}

/**
 * Clock in an operator — badge scan at shift start.
 */
export async function clockIn(opts: {
  tenantId: string;
  operatorId: string;
  shift: string;
  workCenterCode?: string;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const assignment = await prisma.shiftAssignment.upsert({
    where: {
      tenantId_operatorId_date_shift: {
        tenantId: opts.tenantId,
        operatorId: opts.operatorId,
        date: today,
        shift: opts.shift as 'FIRST' | 'SECOND' | 'THIRD',
      },
    },
    update: {
      clockInAt: new Date(),
      workCenterCode: opts.workCenterCode,
    },
    create: {
      tenantId: opts.tenantId,
      operatorId: opts.operatorId,
      shift: opts.shift as 'FIRST' | 'SECOND' | 'THIRD',
      date: today,
      workCenterCode: opts.workCenterCode,
      clockInAt: new Date(),
    },
  });

  return {
    status: 200,
    body: {
      assignment: {
        id: assignment.id,
        operatorId: assignment.operatorId,
        shift: assignment.shift,
        clockInAt: assignment.clockInAt?.toISOString(),
        workCenterCode: assignment.workCenterCode,
      },
    },
  };
}
