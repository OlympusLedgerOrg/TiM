import { prisma } from '../prisma/client.js';

/**
 * Plant Area Service — Physical building/area management
 *
 * Trelleborg Rutherfordton has three physical areas:
 *  1. Main Plant  (MAIN) — Presses, mixers, primary production
 *  2. Shipping    (SHIP) — Staging, loading, outbound
 *  3. New Plant   (NEW)  — Newer equipment, expansion area
 *
 * Work centers and equipment belong to a plant area.
 * Teams alerts can be scoped per plant area.
 */

export interface PlantAreaSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  workCenterCount: number;
  equipmentCount: number;
}

/**
 * Get all plant areas for a tenant with counts.
 */
export async function getPlantAreas(tenantId: string) {
  const areas = await prisma.plantArea.findMany({
    where: { tenantId, isActive: true },
    include: {
      _count: {
        select: {
          workCenters: true,
          equipment: true,
        },
      },
    },
    orderBy: { code: 'asc' },
  });

  const summaries: PlantAreaSummary[] = areas.map(a => ({
    id: a.id,
    code: a.code,
    name: a.name,
    description: a.description,
    workCenterCount: a._count.workCenters,
    equipmentCount: a._count.equipment,
  }));

  return { status: 200, body: { plantAreas: summaries } };
}

/**
 * Get a single plant area with its work centers and equipment.
 */
export async function getPlantAreaDetail(tenantId: string, areaCode: string) {
  const area = await prisma.plantArea.findFirst({
    where: { tenantId, code: areaCode },
    include: {
      workCenters: {
        orderBy: { code: 'asc' },
      },
      equipment: {
        where: { isActive: true },
        orderBy: { code: 'asc' },
      },
    },
  });

  if (!area) {
    return { status: 404, body: { message: `Plant area ${areaCode} not found` } };
  }

  return {
    status: 200,
    body: {
      plantArea: {
        id: area.id,
        code: area.code,
        name: area.name,
        description: area.description,
        workCenters: area.workCenters.map(wc => ({
          id: wc.id,
          code: wc.code,
          name: wc.name,
        })),
        equipment: area.equipment.map(eq => ({
          id: eq.id,
          code: eq.code,
          name: eq.name,
          type: eq.type,
          status: eq.status,
          statusSince: eq.statusSince.toISOString(),
        })),
      },
    },
  };
}
