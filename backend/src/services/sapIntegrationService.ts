import { prisma } from '../prisma/client.js';

/**
 * SAP Integration Service
 * Provides OData v4-compatible endpoints for SAP ERP integration
 */

// Get materials in SAP-compatible format
export async function getSAPMaterials(tenantId: string) {
  const materials = await prisma.material.findMany({
    where: { tenantId },
    orderBy: { sapMaterialNumber: 'asc' },
  });

  return materials.map(m => ({
    MaterialNumber: m.sapMaterialNumber || '',
    Description: m.description,
    UnitOfMeasure: m.unitOfMeasure,
    MaterialID: m.id,
    CreatedAt: m.createdAt.toISOString(),
  }));
}

// Get batches/production orders in SAP-compatible format
export async function getSAPBatches(tenantId: string, filters?: {
  status?: string;
  workCenterCode?: string;
}) {
  const whereClause: any = { tenantId };
  
  if (filters?.status) {
    whereClause.status = filters.status;
  }

  const batches = await prisma.batch.findMany({
    where: whereClause,
    include: {
      material: true,
      workCenter: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Filter by work center code if provided
  let filteredBatches = batches;
  if (filters?.workCenterCode) {
    filteredBatches = batches.filter(b => b.workCenter.code === filters.workCenterCode);
  }

  return filteredBatches.map(b => ({
    LotNumber: b.lotNumber,
    MaterialNumber: b.material.sapMaterialNumber || '',
    MaterialDescription: b.material.description,
    Quantity: b.quantity.toString(),
    UnitOfMeasure: b.material.unitOfMeasure,
    Status: b.status,
    WorkCenter: b.workCenter.code,
    WorkCenterName: b.workCenter.name,
    CreatedAt: b.createdAt.toISOString(),
    UpdatedAt: b.updatedAt.toISOString(),
    BatchID: b.id,
  }));
}

// Get movements/goods movements in SAP-compatible format
export async function getSAPMovements(tenantId: string, fromDate?: Date) {
  const whereClause: any = { tenantId };
  
  if (fromDate) {
    whereClause.movedAt = { gte: fromDate };
  }

  const movements = await prisma.movement.findMany({
    where: whereClause,
    include: {
      batch: {
        include: {
          material: true,
        },
      },
      fromWorkCenter: true,
      toWorkCenter: true,
    },
    orderBy: { movedAt: 'desc' },
    take: 1000, // Limit to prevent large payloads
  });

  return movements.map(m => ({
    MovementID: m.id,
    LotNumber: m.batch.lotNumber,
    MaterialNumber: m.batch.material.sapMaterialNumber || '',
    Quantity: m.quantity.toString(),
    UnitOfMeasure: m.batch.material.unitOfMeasure,
    FromWorkCenter: m.fromWorkCenter.code,
    ToWorkCenter: m.toWorkCenter.code,
    MovedBy: m.movedByUserId,
    MovedAt: m.movedAt.toISOString(),
    Notes: m.notes || '',
    OlympusCommitID: m.olympusCommitId || '',
  }));
}

// Get plant/tenant information in SAP format
export async function getSAPPlantInfo(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      workCenters: {
        orderBy: { code: 'asc' },
      },
    },
  });

  if (!tenant) {
    return { status: 404, body: { message: 'Tenant not found' } };
  }

  return {
    status: 200,
    body: {
      PlantCode: tenant.sapPlantCode || '',
      PlantName: tenant.name,
      PlantID: tenant.id,
      WorkCenters: tenant.workCenters.map(wc => ({
        WorkCenter: wc.code,
        WorkCenterName: wc.name,
        Description: wc.description || '',
      })),
    },
  };
}

// Sync material from SAP to TiM
export async function syncMaterialFromSAP(tenantId: string, sapData: {
  materialNumber: string;
  description: string;
  unitOfMeasure: string;
}) {
  // Check if material already exists
  const existing = await prisma.material.findFirst({
    where: {
      tenantId,
      sapMaterialNumber: sapData.materialNumber,
    },
  });

  if (existing) {
    // Update existing
    const updated = await prisma.material.update({
      where: { id: existing.id },
      data: {
        description: sapData.description,
        unitOfMeasure: sapData.unitOfMeasure,
      },
    });
    return { status: 200, body: { material: updated, created: false } };
  }

  // Create new
  const created = await prisma.material.create({
    data: {
      tenantId,
      sapMaterialNumber: sapData.materialNumber,
      description: sapData.description,
      unitOfMeasure: sapData.unitOfMeasure,
    },
  });

  return { status: 201, body: { material: created, created: true } };
}
