import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clear existing data
  await prisma.auditLog.deleteMany({});
  await prisma.step.deleteMany({});
  await prisma.workOrder.deleteMany({});

  // Create demo work orders
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
