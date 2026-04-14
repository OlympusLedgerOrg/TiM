import { prisma } from '../prisma/client.js';

/**
 * BOM Management Service — CRUD for Bill of Materials,
 * including items, steps, and bulk import support.
 *
 * BOMs define the recipe/formula for producing materials,
 * including input materials (BOMItems) and process steps (BOMSteps).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BOMRecord {
  id: string;
  materialId: string;
  materialName: string;
  version: number;
  isActive: boolean;
  validFrom: string;
  validTo: string | null;
  itemCount: number;
  stepCount: number;
  createdAt: string;
}

export interface BOMItemInput {
  materialId: string;
  quantity: number;
  uom: string;
  isOptional?: boolean;
  condition?: string;
}

export interface BOMStepInput {
  name: string;
  sequence: number;
  machineType?: string;
  durationSec?: number;
  constraints?: Record<string, unknown>;
}

export interface BOMCreateInput {
  materialId: string;
  version?: number;
  validFrom: Date;
  validTo?: Date;
  items: BOMItemInput[];
  steps: BOMStepInput[];
}

// ─── List BOMs ────────────────────────────────────────────────────────────────

export async function listBOMs(opts: {
  materialId?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}) {
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 50, 100);
  const skip = (page - 1) * pageSize;

  const whereClause: Record<string, unknown> = {};

  if (opts.materialId) {
    whereClause.materialId = opts.materialId;
  }

  if (opts.isActive !== undefined) {
    whereClause.isActive = opts.isActive;
  }

  const [boms, total] = await Promise.all([
    prisma.bOM.findMany({
      where: whereClause,
      include: {
        material: true,
        _count: {
          select: {
            items: true,
            steps: true,
          },
        },
      },
      orderBy: [{ material: { description: 'asc' } }, { version: 'desc' }],
      skip,
      take: pageSize,
    }),
    prisma.bOM.count({ where: whereClause }),
  ]);

  return {
    status: 200,
    body: {
      boms: boms.map(bom => ({
        id: bom.id,
        materialId: bom.materialId,
        materialName: bom.material.description,
        version: bom.version,
        isActive: bom.isActive,
        validFrom: bom.validFrom.toISOString(),
        validTo: bom.validTo?.toISOString() ?? null,
        itemCount: bom._count.items,
        stepCount: bom._count.steps,
        createdAt: bom.createdAt.toISOString(),
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

// ─── Get BOM ──────────────────────────────────────────────────────────────────

export async function getBOM(id: string) {
  const bom = await prisma.bOM.findUnique({
    where: { id },
    include: {
      material: true,
      items: {
        include: {
          material: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      steps: {
        orderBy: { sequence: 'asc' },
      },
    },
  });

  if (!bom) {
    return { status: 404, body: { message: 'BOM not found' } };
  }

  return {
    status: 200,
    body: {
      bom: {
        id: bom.id,
        materialId: bom.materialId,
        materialName: bom.material.description,
        materialNumber: bom.material.sapMaterialNumber,
        version: bom.version,
        isActive: bom.isActive,
        validFrom: bom.validFrom.toISOString(),
        validTo: bom.validTo?.toISOString() ?? null,
        createdAt: bom.createdAt.toISOString(),
        items: bom.items.map(item => ({
          id: item.id,
          materialId: item.materialId,
          materialName: item.material.description,
          materialNumber: item.material.sapMaterialNumber,
          quantity: item.quantity,
          uom: item.uom,
          isOptional: item.isOptional,
          condition: item.condition,
        })),
        steps: bom.steps.map(step => ({
          id: step.id,
          name: step.name,
          sequence: step.sequence,
          machineType: step.machineType,
          durationSec: step.durationSec,
          constraints: step.constraints,
        })),
      },
    },
  };
}

// ─── Create BOM ───────────────────────────────────────────────────────────────

export async function createBOM(data: BOMCreateInput) {
  // Verify material exists
  const material = await prisma.material.findUnique({
    where: { id: data.materialId },
  });

  if (!material) {
    return { status: 400, body: { message: 'Output material not found' } };
  }

  // Determine version number
  let version = data.version;
  if (!version) {
    const latestBOM = await prisma.bOM.findFirst({
      where: { materialId: data.materialId },
      orderBy: { version: 'desc' },
    });
    version = (latestBOM?.version ?? 0) + 1;
  }

  // Check for duplicate version
  const existing = await prisma.bOM.findFirst({
    where: { materialId: data.materialId, version },
  });

  if (existing) {
    return { status: 409, body: { message: `BOM version ${version} already exists for this material` } };
  }

  // Validate all input materials exist
  const materialIds = data.items.map(item => item.materialId);
  const materials = await prisma.material.findMany({
    where: { id: { in: materialIds } },
    select: { id: true },
  });

  const foundIds = new Set(materials.map(m => m.id));
  const missingIds = materialIds.filter(id => !foundIds.has(id));

  if (missingIds.length > 0) {
    return { status: 400, body: { message: `Materials not found: ${missingIds.join(', ')}` } };
  }

  // Create BOM with items and steps
  const bom = await prisma.bOM.create({
    data: {
      materialId: data.materialId,
      version,
      validFrom: data.validFrom,
      validTo: data.validTo,
      items: {
        create: data.items.map(item => ({
          materialId: item.materialId,
          quantity: item.quantity,
          uom: item.uom,
          isOptional: item.isOptional ?? false,
          condition: item.condition,
        })),
      },
      steps: {
        create: data.steps.map(step => ({
          name: step.name,
          sequence: step.sequence,
          machineType: step.machineType,
          durationSec: step.durationSec,
          constraints: step.constraints as object | undefined,
        })),
      },
    },
    include: {
      material: true,
      items: { include: { material: true } },
      steps: true,
      _count: { select: { items: true, steps: true } },
    },
  });

  return {
    status: 201,
    body: {
      bom: {
        id: bom.id,
        materialId: bom.materialId,
        materialName: bom.material.description,
        version: bom.version,
        isActive: bom.isActive,
        validFrom: bom.validFrom.toISOString(),
        validTo: bom.validTo?.toISOString() ?? null,
        itemCount: bom._count.items,
        stepCount: bom._count.steps,
        createdAt: bom.createdAt.toISOString(),
      },
    },
  };
}

// ─── Update BOM ───────────────────────────────────────────────────────────────

export async function updateBOM(id: string, data: {
  isActive?: boolean;
  validTo?: Date;
}) {
  const existing = await prisma.bOM.findUnique({ where: { id } });

  if (!existing) {
    return { status: 404, body: { message: 'BOM not found' } };
  }

  const bom = await prisma.bOM.update({
    where: { id },
    data: {
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.validTo !== undefined && { validTo: data.validTo }),
    },
    include: {
      material: true,
      _count: { select: { items: true, steps: true } },
    },
  });

  return {
    status: 200,
    body: {
      bom: {
        id: bom.id,
        materialId: bom.materialId,
        materialName: bom.material.description,
        version: bom.version,
        isActive: bom.isActive,
        validFrom: bom.validFrom.toISOString(),
        validTo: bom.validTo?.toISOString() ?? null,
        itemCount: bom._count.items,
        stepCount: bom._count.steps,
        createdAt: bom.createdAt.toISOString(),
      },
    },
  };
}

// ─── Delete BOM ───────────────────────────────────────────────────────────────

export async function deleteBOM(id: string) {
  const existing = await prisma.bOM.findUnique({
    where: { id },
    include: { workOrders: { take: 1 } },
  });

  if (!existing) {
    return { status: 404, body: { message: 'BOM not found' } };
  }

  // Don't delete if BOM is used by work orders
  if (existing.workOrders.length > 0) {
    return { status: 409, body: { message: 'Cannot delete BOM — it is used by existing work orders. Deactivate it instead.' } };
  }

  // Delete items and steps first, then BOM
  await prisma.$transaction([
    prisma.bOMItem.deleteMany({ where: { bomId: id } }),
    prisma.bOMStep.deleteMany({ where: { bomId: id } }),
    prisma.bOM.delete({ where: { id } }),
  ]);

  return { status: 200, body: { message: 'BOM deleted successfully' } };
}

// ─── Bulk Import BOMs ─────────────────────────────────────────────────────────

export interface BulkBOMInput {
  outputMaterialNumber: string;
  version?: number;
  validFrom: string;
  validTo?: string;
  items: Array<{
    materialNumber: string;
    quantity: number;
    uom: string;
    isOptional?: boolean;
  }>;
  steps?: Array<{
    name: string;
    sequence: number;
    machineType?: string;
    durationSec?: number;
  }>;
}

export async function bulkImportBOMs(boms: BulkBOMInput[], tenantId: string) {
  const results = {
    imported: 0,
    skipped: 0,
    errors: [] as Array<{ materialNumber: string; version?: number; reason: string }>,
  };

  for (const bomData of boms) {
    try {
      // Find output material by SAP number
      const outputMaterial = await prisma.material.findFirst({
        where: { sapMaterialNumber: bomData.outputMaterialNumber, tenantId },
      });

      if (!outputMaterial) {
        results.errors.push({
          materialNumber: bomData.outputMaterialNumber,
          version: bomData.version,
          reason: `Output material ${bomData.outputMaterialNumber} not found`,
        });
        results.skipped++;
        continue;
      }

      // Determine version
      let version = bomData.version;
      if (!version) {
        const latestBOM = await prisma.bOM.findFirst({
          where: { materialId: outputMaterial.id },
          orderBy: { version: 'desc' },
        });
        version = (latestBOM?.version ?? 0) + 1;
      }

      // Check for duplicate
      const existing = await prisma.bOM.findFirst({
        where: { materialId: outputMaterial.id, version },
      });

      if (existing) {
        results.errors.push({
          materialNumber: bomData.outputMaterialNumber,
          version,
          reason: `BOM version ${version} already exists`,
        });
        results.skipped++;
        continue;
      }

      // Resolve input materials
      const itemMaterialNumbers = bomData.items.map(i => i.materialNumber);
      const inputMaterials = await prisma.material.findMany({
        where: {
          sapMaterialNumber: { in: itemMaterialNumbers },
          tenantId,
        },
      });

      const materialMap = new Map(inputMaterials.map(m => [m.sapMaterialNumber, m]));

      // Check for missing materials
      const missingMaterials = itemMaterialNumbers.filter(num => !materialMap.has(num));
      if (missingMaterials.length > 0) {
        results.errors.push({
          materialNumber: bomData.outputMaterialNumber,
          version,
          reason: `Input materials not found: ${missingMaterials.join(', ')}`,
        });
        results.skipped++;
        continue;
      }

      // Create BOM
      await prisma.bOM.create({
        data: {
          materialId: outputMaterial.id,
          version,
          validFrom: new Date(bomData.validFrom),
          validTo: bomData.validTo ? new Date(bomData.validTo) : null,
          items: {
            create: bomData.items.map(item => ({
              materialId: materialMap.get(item.materialNumber)!.id,
              quantity: item.quantity,
              uom: item.uom,
              isOptional: item.isOptional ?? false,
            })),
          },
          steps: {
            create: (bomData.steps ?? []).map(step => ({
              name: step.name,
              sequence: step.sequence,
              machineType: step.machineType,
              durationSec: step.durationSec,
            })),
          },
        },
      });

      results.imported++;
    } catch (error) {
      results.errors.push({
        materialNumber: bomData.outputMaterialNumber,
        version: bomData.version,
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
      results.skipped++;
    }
  }

  return { status: 200, body: { results } };
}
