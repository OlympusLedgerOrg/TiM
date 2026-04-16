import { prisma } from '../prisma/client.js';

/**
 * Material Management Service — CRUD for materials/specs,
 * including bulk import for en masse ID creation.
 *
 * Materials are the master data for components, finished goods,
 * and raw materials tracked in the system.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MaterialRecord {
  id: string;
  sapMaterialNumber: string | null;
  description: string;
  name: string | null;
  unitOfMeasure: string;
  isBatchTracked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialCreateInput {
  sapMaterialNumber?: string;
  description: string;
  name?: string;
  unitOfMeasure?: string;
  isBatchTracked?: boolean;
  tenantId: string;
}

// ─── List Materials ───────────────────────────────────────────────────────────

export async function listMaterials(opts: {
  tenantId: string;
  search?: string;
  isBatchTracked?: boolean;
  page?: number;
  pageSize?: number;
}) {
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 50, 100);
  const skip = (page - 1) * pageSize;

  const whereClause: Record<string, unknown> = {
    tenantId: opts.tenantId,
  };

  if (opts.isBatchTracked !== undefined) {
    whereClause.isBatchTracked = opts.isBatchTracked;
  }

  if (opts.search) {
    whereClause.OR = [
      { description: { contains: opts.search, mode: 'insensitive' as const } },
      { sapMaterialNumber: { contains: opts.search, mode: 'insensitive' as const } },
      { name: { contains: opts.search, mode: 'insensitive' as const } },
    ];
  }

  const [materials, total] = await Promise.all([
    prisma.material.findMany({
      where: whereClause,
      orderBy: { description: 'asc' },
      skip,
      take: pageSize,
    }),
    prisma.material.count({ where: whereClause }),
  ]);

  return {
    status: 200,
    body: {
      materials: materials.map(m => ({
        id: m.id,
        sapMaterialNumber: m.sapMaterialNumber,
        description: m.description,
        name: m.name,
        unitOfMeasure: m.unitOfMeasure,
        isBatchTracked: m.isBatchTracked,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    },
  };
}

// ─── Get Material ─────────────────────────────────────────────────────────────

export async function getMaterial(id: string) {
  const material = await prisma.material.findUnique({
    where: { id },
    include: {
      batches: {
        take: 10,
        orderBy: { createdAt: 'desc' },
      },
      lots: {
        take: 10,
        orderBy: { createdAt: 'desc' },
      },
      _count: {
        select: {
          batches: true,
          lots: true,
          boms: true,
          bomItems: true,
        },
      },
    },
  });

  if (!material) {
    return { status: 404, body: { message: 'Material not found' } };
  }

  return {
    status: 200,
    body: {
      material: {
        id: material.id,
        sapMaterialNumber: material.sapMaterialNumber,
        description: material.description,
        name: material.name,
        unitOfMeasure: material.unitOfMeasure,
        isBatchTracked: material.isBatchTracked,
        createdAt: material.createdAt.toISOString(),
        updatedAt: material.updatedAt.toISOString(),
        stats: {
          batchCount: material._count.batches,
          lotCount: material._count.lots,
          bomCount: material._count.boms,
          usedInBomCount: material._count.bomItems,
        },
        recentBatches: material.batches.map(b => ({
          id: b.id,
          lotNumber: b.lotNumber,
          quantity: Number(b.quantity),
          status: b.status,
          createdAt: b.createdAt.toISOString(),
        })),
        recentLots: material.lots.map(l => ({
          id: l.id,
          quantity: l.quantity,
          uom: l.uom,
          status: l.status,
          createdAt: l.createdAt.toISOString(),
        })),
      },
    },
  };
}

// ─── Create Material ──────────────────────────────────────────────────────────

export async function createMaterial(data: MaterialCreateInput) {
  // Check for duplicate SAP number if provided
  if (data.sapMaterialNumber) {
    const existing = await prisma.material.findFirst({
      where: {
        sapMaterialNumber: data.sapMaterialNumber,
        tenantId: data.tenantId,
      },
    });

    if (existing) {
      return { status: 409, body: { message: `Material ${data.sapMaterialNumber} already exists` } };
    }
  }

  const material = await prisma.material.create({
    data: {
      tenantId: data.tenantId,
      sapMaterialNumber: data.sapMaterialNumber,
      description: data.description,
      name: data.name,
      unitOfMeasure: data.unitOfMeasure ?? 'EA',
      isBatchTracked: data.isBatchTracked ?? true,
    },
  });

  return {
    status: 201,
    body: {
      material: {
        id: material.id,
        sapMaterialNumber: material.sapMaterialNumber,
        description: material.description,
        name: material.name,
        unitOfMeasure: material.unitOfMeasure,
        isBatchTracked: material.isBatchTracked,
        createdAt: material.createdAt.toISOString(),
        updatedAt: material.updatedAt.toISOString(),
      },
    },
  };
}

// ─── Update Material ──────────────────────────────────────────────────────────

export async function updateMaterial(id: string, data: {
  sapMaterialNumber?: string;
  description?: string;
  name?: string;
  unitOfMeasure?: string;
  isBatchTracked?: boolean;
}, tenantId: string) {
  const existing = await prisma.material.findUnique({ where: { id } });

  if (!existing) {
    return { status: 404, body: { message: 'Material not found' } };
  }

  // Check for duplicate SAP number if changing
  if (data.sapMaterialNumber && data.sapMaterialNumber !== existing.sapMaterialNumber) {
    const duplicate = await prisma.material.findFirst({
      where: {
        sapMaterialNumber: data.sapMaterialNumber,
        tenantId,
        id: { not: id },
      },
    });

    if (duplicate) {
      return { status: 409, body: { message: `Material ${data.sapMaterialNumber} already exists` } };
    }
  }

  const material = await prisma.material.update({
    where: { id },
    data: {
      ...(data.sapMaterialNumber !== undefined && { sapMaterialNumber: data.sapMaterialNumber }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.name !== undefined && { name: data.name }),
      ...(data.unitOfMeasure !== undefined && { unitOfMeasure: data.unitOfMeasure }),
      ...(data.isBatchTracked !== undefined && { isBatchTracked: data.isBatchTracked }),
    },
  });

  return {
    status: 200,
    body: {
      material: {
        id: material.id,
        sapMaterialNumber: material.sapMaterialNumber,
        description: material.description,
        name: material.name,
        unitOfMeasure: material.unitOfMeasure,
        isBatchTracked: material.isBatchTracked,
        createdAt: material.createdAt.toISOString(),
        updatedAt: material.updatedAt.toISOString(),
      },
    },
  };
}

// ─── Delete Material ──────────────────────────────────────────────────────────

export async function deleteMaterial(id: string) {
  const existing = await prisma.material.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          batches: true,
          lots: true,
          boms: true,
          bomItems: true,
        },
      },
    },
  });

  if (!existing) {
    return { status: 404, body: { message: 'Material not found' } };
  }

  // Check for dependencies
  const totalRefs = existing._count.batches + existing._count.lots + existing._count.boms + existing._count.bomItems;
  if (totalRefs > 0) {
    return {
      status: 409,
      body: {
        message: 'Cannot delete material — it has associated batches, lots, or BOMs',
        references: existing._count,
      },
    };
  }

  await prisma.material.delete({ where: { id } });

  return { status: 200, body: { message: 'Material deleted successfully' } };
}

// ─── Bulk Import Materials ────────────────────────────────────────────────────

export interface BulkMaterialInput {
  sapMaterialNumber: string;
  description: string;
  name?: string;
  unitOfMeasure?: string;
  isBatchTracked?: boolean;
}

/**
 * Bulk import materials from parsed CSV/JSON data.
 * Supports en masse ID creation for efficient data entry.
 */
export async function bulkImportMaterials(materials: BulkMaterialInput[], tenantId: string) {
  const results = {
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: [] as Array<{ sapMaterialNumber: string; reason: string }>,
  };

  for (const mat of materials) {
    if (!mat.sapMaterialNumber || !mat.description) {
      results.errors.push({
        sapMaterialNumber: mat.sapMaterialNumber || '',
        reason: 'Missing sapMaterialNumber or description',
      });
      results.skipped++;
      continue;
    }

    try {
      // Check if material already exists
      const existing = await prisma.material.findFirst({
        where: {
          sapMaterialNumber: mat.sapMaterialNumber.trim(),
          tenantId,
        },
      });

      if (existing) {
        // Update existing material
        await prisma.material.update({
          where: { id: existing.id },
          data: {
            description: mat.description.trim(),
            ...(mat.name && { name: mat.name.trim() }),
            ...(mat.unitOfMeasure && { unitOfMeasure: mat.unitOfMeasure.trim() }),
            ...(mat.isBatchTracked !== undefined && { isBatchTracked: mat.isBatchTracked }),
          },
        });
        results.updated++;
      } else {
        // Create new material
        await prisma.material.create({
          data: {
            tenantId,
            sapMaterialNumber: mat.sapMaterialNumber.trim(),
            description: mat.description.trim(),
            name: mat.name?.trim(),
            unitOfMeasure: mat.unitOfMeasure?.trim() ?? 'EA',
            isBatchTracked: mat.isBatchTracked ?? true,
          },
        });
        results.imported++;
      }
    } catch (error) {
      results.errors.push({
        sapMaterialNumber: mat.sapMaterialNumber,
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
      results.skipped++;
    }
  }

  return { status: 200, body: { results } };
}
