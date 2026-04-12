import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clear existing data (order matters for foreign keys)
  await prisma.inventoryMovement.deleteMany({});
  await prisma.reservation.deleteMany({});
  await prisma.workOrderStep.deleteMany({});
  await prisma.lotEdge.deleteMany({});
  await prisma.lot.deleteMany({});
  await prisma.bOMItem.deleteMany({});
  await prisma.bOMStep.deleteMany({});
  await prisma.bOM.deleteMany({});
  await prisma.operator.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.step.deleteMany({});
  await prisma.workOrder.deleteMany({});

  // Create demo work orders (existing maintenance work orders)
  const workOrder1 = await prisma.workOrder.create({
    data: {
      id: 'wo1',
      title: 'Pump Maintenance - Unit A',
      steps: {
        create: [
          {
            id: 'st1',
            title: 'Inspect pump housing for cracks',
            status: 'PENDING',
          },
          {
            id: 'st2',
            title: 'Check and replace oil seals',
            status: 'PENDING',
          },
          {
            id: 'st3',
            title: 'Test pressure readings',
            status: 'PENDING',
          },
          {
            id: 'st4',
            title: 'Document findings and sign off',
            status: 'PENDING',
          },
        ],
      },
    },
  });

  const workOrder2 = await prisma.workOrder.create({
    data: {
      id: 'wo2',
      title: 'Conveyor Belt Inspection - Line B',
      steps: {
        create: [
          {
            id: 'st5',
            title: 'Visual inspection of belt condition',
            status: 'PENDING',
          },
          {
            id: 'st6',
            title: 'Check tension and alignment',
            status: 'PENDING',
          },
          {
            id: 'st7',
            title: 'Lubricate rollers and bearings',
            status: 'PENDING',
          },
        ],
      },
    },
  });

  const workOrder3 = await prisma.workOrder.create({
    data: {
      id: 'wo3',
      title: 'HVAC System Quarterly Check - Building C',
      steps: {
        create: [
          {
            id: 'st8',
            title: 'Replace air filters',
            status: 'COMPLETED',
            notes: 'Filters replaced with MERV 13 rating',
          },
          {
            id: 'st9',
            title: 'Check refrigerant levels',
            status: 'COMPLETED',
            notes: 'Levels within normal range',
          },
          {
            id: 'st10',
            title: 'Clean condenser coils',
            status: 'PENDING',
          },
          {
            id: 'st11',
            title: 'Test thermostat calibration',
            status: 'PENDING',
          },
        ],
      },
    },
  });

  console.log(`✅ Created work order: ${workOrder1.title}`);
  console.log(`✅ Created work order: ${workOrder2.title}`);
  console.log(`✅ Created work order: ${workOrder3.title}`);

  // Create some audit log entries for completed steps
  await prisma.auditLog.create({
    data: {
      workOrderId: 'wo3',
      stepId: 'st8',
      actorUserId: 'user-tech-001',
      action: 'STEP_COMPLETED',
      metadata: { notes: 'Filters replaced with MERV 13 rating' },
    },
  });

  await prisma.auditLog.create({
    data: {
      workOrderId: 'wo3',
      stepId: 'st9',
      actorUserId: 'user-tech-001',
      action: 'STEP_COMPLETED',
      metadata: { notes: 'Levels within normal range' },
    },
  });

  console.log('✅ Created audit log entries');

  // Tenant
  const trelleborg = await prisma.tenant.create({
    data: { id: 'tenant-trelleborg', name: 'Trelleborg Rutherfordton', sapPlantCode: 'US01' },
  });

  // Work centers
  const [mixing, extrusion, inspection, shipping] = await Promise.all([
    prisma.workCenter.create({ data: { tenantId: trelleborg.id, name: 'Mixing', code: 'MIX-01' } }),
    prisma.workCenter.create({ data: { tenantId: trelleborg.id, name: 'Extrusion', code: 'EXT-01' } }),
    prisma.workCenter.create({ data: { tenantId: trelleborg.id, name: 'Inspection', code: 'INS-01' } }),
    prisma.workCenter.create({ data: { tenantId: trelleborg.id, name: 'Shipping', code: 'SHP-01' } }),
  ]);

  // Materials (with new fields: name, isBatchTracked)
  const [compound, seal] = await Promise.all([
    prisma.material.create({
      data: {
        tenantId: trelleborg.id,
        sapMaterialNumber: 'MAT-7823',
        name: 'EPDM Compound 70A',
        description: 'EPDM Compound 70A',
        unitOfMeasure: 'KG',
        isBatchTracked: true,
      },
    }),
    prisma.material.create({
      data: {
        tenantId: trelleborg.id,
        sapMaterialNumber: 'MAT-4491',
        name: 'O-Ring Seal AS568-214',
        description: 'O-Ring Seal AS568-214',
        unitOfMeasure: 'EA',
        isBatchTracked: true,
      },
    }),
  ]);

  // Carbon black (raw input material for BOM)
  const carbonBlack = await prisma.material.create({
    data: {
      tenantId: trelleborg.id,
      sapMaterialNumber: 'MAT-1100',
      name: 'Carbon Black N330',
      description: 'Carbon Black N330 — Reinforcing filler',
      unitOfMeasure: 'KG',
      isBatchTracked: true,
    },
  });

  // Sulfur (raw input material for BOM)
  const sulfur = await prisma.material.create({
    data: {
      tenantId: trelleborg.id,
      sapMaterialNumber: 'MAT-1201',
      name: 'Sulfur Cure Package',
      description: 'Sulfur Cure Package — Vulcanization agent',
      unitOfMeasure: 'KG',
      isBatchTracked: true,
    },
  });

  // Batches — one in queue, one in progress, one flagged
  await prisma.batch.createMany({
    data: [
      {
        tenantId: trelleborg.id,
        materialId: compound.id,
        lotNumber: 'LOT-2024-001',
        quantity: 500,
        status: 'IN_QUEUE',
        workCenterId: mixing.id,
      },
      {
        tenantId: trelleborg.id,
        materialId: seal.id,
        lotNumber: 'LOT-2024-002',
        quantity: 1200,
        status: 'IN_PROGRESS',
        workCenterId: extrusion.id,
      },
      {
        tenantId: trelleborg.id,
        materialId: seal.id,
        lotNumber: 'LOT-2024-003',
        quantity: 800,
        status: 'FLAGGED',
        workCenterId: inspection.id,
      },
    ],
  });

  console.log('✅ Created Trelleborg tenant, work centers, materials, and batches');

  ///////////////////////////////////////////////////////////////
  // NEW: Operators
  ///////////////////////////////////////////////////////////////
  const [operatorJones, operatorSmith] = await Promise.all([
    prisma.operator.create({
      data: {
        id: 'op-jones',
        name: 'Alice Jones',
        badgeId: 'BADGE-101',
      },
    }),
    prisma.operator.create({
      data: {
        id: 'op-smith',
        name: 'Bob Smith',
        badgeId: 'BADGE-202',
      },
    }),
  ]);

  console.log('✅ Created operators');

  ///////////////////////////////////////////////////////////////
  // NEW: BOM — versioned recipe for EPDM Compound 70A
  ///////////////////////////////////////////////////////////////
  const bom = await prisma.bOM.create({
    data: {
      id: 'bom-epdm-v1',
      materialId: compound.id,
      version: 1,
      isActive: true,
      validFrom: new Date('2024-01-01'),
      items: {
        create: [
          {
            materialId: carbonBlack.id,
            quantity: 30,
            uom: 'KG',
          },
          {
            materialId: sulfur.id,
            quantity: 5,
            uom: 'KG',
          },
        ],
      },
      steps: {
        create: [
          {
            id: 'bom-step-mix',
            name: 'Compound Mixing',
            sequence: 1,
            machineType: 'mixer',
            durationSec: 600,
            constraints: { tempMin: 80, tempMax: 120 },
          },
          {
            id: 'bom-step-cure',
            name: 'Vulcanization / Cure',
            sequence: 2,
            machineType: 'press',
            durationSec: 1200,
            constraints: { pressureMin: 50, pressureMax: 100 },
          },
          {
            id: 'bom-step-inspect',
            name: 'Quality Inspection',
            sequence: 3,
            durationSec: 300,
          },
        ],
      },
    },
  });

  console.log('✅ Created BOM (EPDM Compound 70A v1)');

  ///////////////////////////////////////////////////////////////
  // NEW: Production work order with BOM
  ///////////////////////////////////////////////////////////////
  const prodWorkOrder = await prisma.workOrder.create({
    data: {
      id: 'wo-prod-001',
      title: 'Production: EPDM Compound Batch 2024-Q2',
      materialId: compound.id,
      bomId: bom.id,
      quantity: 100,
      uom: 'KG',
      status: 'IN_PROGRESS',
      scheduledStart: new Date('2024-04-01T06:00:00Z'),
      scheduledEnd: new Date('2024-04-01T14:00:00Z'),
      startedAt: new Date('2024-04-01T06:15:00Z'),
      workOrderSteps: {
        create: [
          {
            bomStepId: 'bom-step-mix',
            status: 'completed',
            startedAt: new Date('2024-04-01T06:15:00Z'),
            completedAt: new Date('2024-04-01T06:25:00Z'),
            operatorId: operatorJones.id,
            data: { actualTemp: 95, actualDuration: 610 },
          },
          {
            bomStepId: 'bom-step-cure',
            status: 'in_progress',
            startedAt: new Date('2024-04-01T06:30:00Z'),
            operatorId: operatorSmith.id,
          },
          {
            bomStepId: 'bom-step-inspect',
            status: 'pending',
          },
        ],
      },
    },
  });

  console.log(`✅ Created production work order: ${prodWorkOrder.title}`);

  ///////////////////////////////////////////////////////////////
  // NEW: Lots — raw material input lots + genealogy
  ///////////////////////////////////////////////////////////////
  const lotCarbonBlack = await prisma.lot.create({
    data: {
      id: 'lot-cb-001',
      materialId: carbonBlack.id,
      quantity: 200,
      uom: 'KG',
      status: 'ACTIVE',
    },
  });

  const lotSulfur = await prisma.lot.create({
    data: {
      id: 'lot-s-001',
      materialId: sulfur.id,
      quantity: 50,
      uom: 'KG',
      status: 'ACTIVE',
    },
  });

  // Output lot produced by the work order
  const lotOutput = await prisma.lot.create({
    data: {
      id: 'lot-epdm-001',
      materialId: compound.id,
      quantity: 100,
      uom: 'KG',
      status: 'ACTIVE',
      workOrderId: prodWorkOrder.id,
    },
  });

  // Genealogy edges: input lots → output lot
  await prisma.lotEdge.createMany({
    data: [
      {
        parentLotId: lotCarbonBlack.id,
        childLotId: lotOutput.id,
        quantity: 30,
      },
      {
        parentLotId: lotSulfur.id,
        childLotId: lotOutput.id,
        quantity: 5,
      },
    ],
  });

  console.log('✅ Created lots with genealogy edges (DAG)');

  ///////////////////////////////////////////////////////////////
  // NEW: Reservations — allocate input lots for work order
  ///////////////////////////////////////////////////////////////
  await prisma.reservation.createMany({
    data: [
      {
        lotId: lotCarbonBlack.id,
        workOrderId: prodWorkOrder.id,
        quantity: 30,
        status: 'CONSUMED',
      },
      {
        lotId: lotSulfur.id,
        workOrderId: prodWorkOrder.id,
        quantity: 5,
        status: 'CONSUMED',
      },
    ],
  });

  console.log('✅ Created reservations');

  ///////////////////////////////////////////////////////////////
  // NEW: Inventory movements — immutable ledger
  ///////////////////////////////////////////////////////////////
  await prisma.inventoryMovement.createMany({
    data: [
      {
        lotId: lotCarbonBlack.id,
        type: 'RECEIVE',
        quantity: 200,
        operatorId: operatorJones.id,
        metadata: { supplier: 'Cabot Corp', poNumber: 'PO-2024-110' },
      },
      {
        lotId: lotSulfur.id,
        type: 'RECEIVE',
        quantity: 50,
        operatorId: operatorJones.id,
        metadata: { supplier: 'Eastman Chemical', poNumber: 'PO-2024-111' },
      },
      {
        lotId: lotCarbonBlack.id,
        type: 'CONSUME',
        quantity: 30,
        workOrderId: prodWorkOrder.id,
        operatorId: operatorSmith.id,
      },
      {
        lotId: lotSulfur.id,
        type: 'CONSUME',
        quantity: 5,
        workOrderId: prodWorkOrder.id,
        operatorId: operatorSmith.id,
      },
      {
        lotId: lotOutput.id,
        type: 'PRODUCE',
        quantity: 100,
        workOrderId: prodWorkOrder.id,
        operatorId: operatorSmith.id,
      },
    ],
  });

  console.log('✅ Created inventory movements (immutable ledger)');
  console.log('🎉 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
