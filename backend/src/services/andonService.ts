import { prisma } from '../prisma/client.js';

/**
 * Andon Board Service — Read-only plant floor visibility
 *
 * Returns all equipment across the plant with current status and
 * active downtime info. This powers the wall-mounted Andon display
 * that shows the floor at a glance.
 *
 * No authentication required — data is read-only, non-sensitive.
 */

export interface AndonEquipment {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  statusSince: string;
  plantAreaCode: string | null;
  plantAreaName: string | null;
  workCenterCode: string | null;
  currentDowntime: {
    id: string;
    category: string;
    reasonCode: string;
    reasonText: string | null;
    startedAt: string;
    durationMin: number;
  } | null;
}

export interface AndonPlantArea {
  code: string;
  name: string;
  equipment: AndonEquipment[];
}

export async function getAndonBoard(tenantId: string, areaCode?: string) {
  const areaFilter = areaCode
    ? { tenantId, code: areaCode, isActive: true }
    : { tenantId, isActive: true };

  const areas = await prisma.plantArea.findMany({
    where: areaFilter,
    include: {
      equipment: {
        where: { isActive: true },
        orderBy: { code: 'asc' },
      },
    },
    orderBy: { code: 'asc' },
  });

  // Also fetch equipment not assigned to any plant area
  const unassigned = areaCode
    ? []
    : await prisma.equipment.findMany({
        where: { tenantId, plantAreaId: null, isActive: true },
        orderBy: { code: 'asc' },
      });

  // Collect all equipment IDs to batch-fetch downtime events (avoid N+1)
  const allEquipmentIds: string[] = [];
  for (const area of areas) {
    for (const eq of area.equipment) {
      allEquipmentIds.push(eq.id);
    }
  }
  for (const eq of unassigned) {
    allEquipmentIds.push(eq.id);
  }

  // Batch query: get all active downtime events for these equipment
  const activeDowntimeEvents = allEquipmentIds.length > 0
    ? await prisma.downtimeEvent.findMany({
        where: {
          equipmentId: { in: allEquipmentIds },
          endedAt: null,
        },
        orderBy: { startedAt: 'desc' },
      })
    : [];

  // Index by equipmentId (take the most recent one per equipment)
  const downtimeByEquipment = new Map<string, typeof activeDowntimeEvents[0]>();
  for (const dt of activeDowntimeEvents) {
    if (!downtimeByEquipment.has(dt.equipmentId)) {
      downtimeByEquipment.set(dt.equipmentId, dt);
    }
  }

  function buildAndonEquipment(
    eq: { id: string; code: string; name: string; type: string; status: string; statusSince: Date },
    areaCode: string | null,
    areaName: string | null,
  ): AndonEquipment {
    const activeDowntime = downtimeByEquipment.get(eq.id) || null;
    return {
      id: eq.id,
      code: eq.code,
      name: eq.name,
      type: eq.type,
      status: eq.status,
      statusSince: eq.statusSince.toISOString(),
      plantAreaCode: areaCode,
      plantAreaName: areaName,
      workCenterCode: null,
      currentDowntime: activeDowntime
        ? {
            id: activeDowntime.id,
            category: activeDowntime.category,
            reasonCode: activeDowntime.reasonCode,
            reasonText: activeDowntime.reasonText,
            startedAt: activeDowntime.startedAt.toISOString(),
            durationMin: (Date.now() - activeDowntime.startedAt.getTime()) / 60000,
          }
        : null,
    };
  }

  const result: AndonPlantArea[] = [];

  for (const area of areas) {
    result.push({
      code: area.code,
      name: area.name,
      equipment: area.equipment.map(eq => buildAndonEquipment(eq, area.code, area.name)),
    });
  }

  // Add unassigned equipment
  if (unassigned.length > 0) {
    result.push({
      code: 'UNASSIGNED',
      name: 'Unassigned',
      equipment: unassigned.map(eq => buildAndonEquipment(eq, null, null)),
    });
  }

  return {
    status: 200,
    body: {
      plantAreas: result,
      totalEquipment: result.reduce((sum, a) => sum + a.equipment.length, 0),
      downCount: result.reduce(
        (sum, a) => sum + a.equipment.filter(e => e.status === 'DOWN').length,
        0,
      ),
      timestamp: new Date().toISOString(),
    },
  };
}
