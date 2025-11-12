import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create sample work orders
  const workOrder1 = await prisma.workOrder.create({
    data: {
      title: 'Equipment Maintenance - Conveyor Belt A',
      steps: {
        create: [
          {
            title: 'Inspect conveyor belt for wear and tear',
            status: 'PENDING',
          },
          {
            title: 'Lubricate moving parts',
            status: 'PENDING',
          },
          {
            title: 'Check motor alignment',
            status: 'PENDING',
          },
          {
            title: 'Test emergency stop functionality',
            status: 'PENDING',
          },
        ],
      },
    },
  });

  const workOrder2 = await prisma.workOrder.create({
    data: {
      title: 'Safety Inspection - Production Floor',
      steps: {
        create: [
          {
            title: 'Verify fire extinguisher locations and expiry dates',
            status: 'PENDING',
          },
          {
            title: 'Check emergency exit signs',
            status: 'PENDING',
          },
          {
            title: 'Inspect first aid kits',
            status: 'PENDING',
          },
        ],
      },
    },
  });

  const workOrder3 = await prisma.workOrder.create({
    data: {
      title: 'HVAC System Quarterly Check',
      steps: {
        create: [
          {
            title: 'Replace air filters',
            status: 'COMPLETED',
            notes: 'Replaced all filters in zones A, B, and C',
          },
          {
            title: 'Check refrigerant levels',
            status: 'COMPLETED',
            notes: 'All levels within normal range',
          },
          {
            title: 'Clean condenser coils',
            status: 'PENDING',
          },
          {
            title: 'Test thermostat calibration',
            status: 'PENDING',
          },
        ],
      },
    },
  });

  console.log('✅ Seeding completed!');
  console.log(`   Created work orders:`);
  console.log(`   - ${workOrder1.title} (ID: ${workOrder1.id})`);
  console.log(`   - ${workOrder2.title} (ID: ${workOrder2.id})`);
  console.log(`   - ${workOrder3.title} (ID: ${workOrder3.id})`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
