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

  const result: AndonPlantArea[] = [];

  for (const area of areas) {
    const areaEquipment: AndonEquipment[] = [];

    for (const eq of area.equipment) {
      const activeDowntime = await prisma.downtimeEvent.findFirst({
        where: { equipmentId: eq.id, endedAt: null },
        orderBy: { startedAt: 'desc' },
      });

      areaEquipment.push({
        id: eq.id,
        code: eq.code,
        name: eq.name,
        type: eq.type,
        status: eq.status,
        statusSince: eq.statusSince.toISOString(),
        plantAreaCode: area.code,
        plantAreaName: area.name,
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
      });
    }

    result.push({
      code: area.code,
      name: area.name,
      equipment: areaEquipment,
    });
  }

  // Add unassigned equipment
  if (unassigned.length > 0) {
    const unassignedEquipment: AndonEquipment[] = [];
    for (const eq of unassigned) {
      const activeDowntime = await prisma.downtimeEvent.findFirst({
        where: { equipmentId: eq.id, endedAt: null },
        orderBy: { startedAt: 'desc' },
      });

      unassignedEquipment.push({
        id: eq.id,
        code: eq.code,
        name: eq.name,
        type: eq.type,
        status: eq.status,
        statusSince: eq.statusSince.toISOString(),
        plantAreaCode: null,
        plantAreaName: null,
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
      });
    }

    result.push({
      code: 'UNASSIGNED',
      name: 'Unassigned',
      equipment: unassignedEquipment,
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
