jest.mock('../src/prisma/client', () => {
  const prisma = {
    $transaction: jest.fn(),
    truck: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    truckLoadEvent: { create: jest.fn() },
    customer: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    serviceLocation: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    fieldWorkOrder: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    workOrderPhoto: { create: jest.fn() },
    callIntake: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    routePlan: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    user: { findFirst: jest.fn() },
  };
  return { prisma };
});

import { prisma } from '../src/prisma/client';
import {
  assignTruckToWorkOrder,
  completeFieldWorkOrder,
  convertCallIntake,
  createCustomer,
  createFieldWorkOrder,
  createRoutePlan,
  createServiceLocation,
  createTruck,
  getCustomer,
  getDispatchBoard,
  ingestCallGuardCall,
  listFieldWorkOrders,
  listRoutePlans,
  listTrucks,
  publishRoutePlan,
  recordTruckLoadEvent,
  registerWorkOrderPhoto,
  searchCustomers,
} from '../src/services/fieldServiceService';

const db = prisma as any;
const tenantId = 'tenant-1';

const baseTruck = {
  id: 'truck-1',
  tenantId,
  unitNumber: 'T-101',
  tankCapacityGallons: 3000,
  onboardGallons: 1000,
  status: 'AVAILABLE',
  version: 2,
  assignedDriverId: 'driver-1',
  assignedDriver: { id: 'driver-1', name: 'Dana Driver' },
  isActive: true,
};

const baseWorkOrder = {
  id: 'wo-1',
  tenantId,
  workOrderNumber: 'FS-20260723-ABC12345',
  status: 'NEW',
  estimatedGallons: 500,
  scheduledStart: null,
  assignedTruckId: null,
  assignedDriverId: null,
};

function expectCode(code: string) {
  return expect.objectContaining({ code });
}

beforeEach(() => {
  jest.clearAllMocks();
  db.$transaction.mockImplementation(async (callback: (tx: any) => unknown) => callback(db));
});

describe('fleet and load operations', () => {
  test('lists trucks with calculated available capacity', async () => {
    db.truck.findMany.mockResolvedValue([baseTruck]);

    await expect(listTrucks(tenantId)).resolves.toEqual([
      expect.objectContaining({ id: 'truck-1', availableGallons: 2000 }),
    ]);
    expect(db.truck.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId, isActive: true },
    }));
  });

  test('creates a truck and rejects invalid capacity', async () => {
    db.truck.create.mockResolvedValue({ ...baseTruck, onboardGallons: 0 });

    await createTruck({
      tenantId,
      unitNumber: 'T-101',
      tankCapacityGallons: 3000,
      wasteCapabilities: ['SEPTIC'],
    });

    expect(db.truck.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        unitNumber: 'T-101',
        tankCapacityGallons: 3000,
        wasteCapabilities: ['SEPTIC'],
      }),
    }));

    await expect(createTruck({
      tenantId,
      unitNumber: 'BAD',
      tankCapacityGallons: 0,
    })).rejects.toMatchObject(expectCode('INVALID_CAPACITY'));
  });

  test('records a pump event atomically and marks a full truck for disposal', async () => {
    db.truck.findFirst.mockResolvedValue(baseTruck);
    db.truck.updateMany.mockResolvedValue({ count: 1 });
    db.truckLoadEvent.create.mockResolvedValue({ id: 'load-1' });

    const result = await recordTruckLoadEvent({
      tenantId,
      truckId: baseTruck.id,
      actorUserId: 'user-1',
      type: 'PUMP_IN',
      gallons: 2000,
      fieldWorkOrderId: 'wo-1',
      comments: 'Loaded at customer site',
    });

    expect(result).toEqual({ event: { id: 'load-1' }, resultingOnboardGallons: 3000 });
    expect(db.truck.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ onboardGallons: 3000, status: 'NEEDS_DISPOSAL' }),
    }));
    expect(db.truckLoadEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ deltaGallons: 2000, resultingOnboardGallons: 3000 }),
    }));
  });

  test('records disposal with evidence and returns the truck to available', async () => {
    db.truck.findFirst.mockResolvedValue({ ...baseTruck, onboardGallons: 1800, status: 'NEEDS_DISPOSAL' });
    db.truck.updateMany.mockResolvedValue({ count: 1 });
    db.truckLoadEvent.create.mockResolvedValue({ id: 'dispose-1' });

    await recordTruckLoadEvent({
      tenantId,
      truckId: baseTruck.id,
      actorUserId: 'user-1',
      type: 'DISPOSAL',
      gallons: 1500,
      evidencePhotoId: 'photo-ticket',
      disposalFacility: 'North Plant',
      disposalTicketNumber: 'D-44',
    });

    expect(db.truck.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ onboardGallons: 300, status: 'AVAILABLE' }),
    }));
  });

  test('requires disposal proof and rejects missing or concurrently changed trucks', async () => {
    await expect(recordTruckLoadEvent({
      tenantId,
      truckId: 'truck-1',
      actorUserId: 'user-1',
      type: 'DISPOSAL',
      gallons: 100,
      evidencePhotoId: 'photo-1',
    })).rejects.toMatchObject(expectCode('DISPOSAL_FACILITY_REQUIRED'));

    await expect(recordTruckLoadEvent({
      tenantId,
      truckId: 'truck-1',
      actorUserId: 'user-1',
      type: 'DISPOSAL',
      gallons: 100,
      disposalFacility: 'North Plant',
    })).rejects.toMatchObject(expectCode('DISPOSAL_EVIDENCE_REQUIRED'));

    db.truck.findFirst.mockResolvedValue(baseTruck);
    db.truck.updateMany.mockResolvedValue({ count: 0 });
    await expect(recordTruckLoadEvent({
      tenantId,
      truckId: 'truck-1',
      actorUserId: 'user-1',
      type: 'PUMP_IN',
      gallons: 100,
    })).rejects.toMatchObject(expectCode('TRUCK_LOAD_CONFLICT'));

    db.truck.findFirst.mockResolvedValue(null);
    await expect(recordTruckLoadEvent({
      tenantId,
      truckId: 'missing',
      actorUserId: 'user-1',
      type: 'PUMP_IN',
      gallons: 100,
    })).rejects.toMatchObject(expectCode('TRUCK_NOT_FOUND'));
  });

  test('maps an over-capacity load rule into a conflict', async () => {
    db.truck.findFirst.mockResolvedValue({ ...baseTruck, onboardGallons: 2900 });

    await expect(recordTruckLoadEvent({
      tenantId,
      truckId: 'truck-1',
      actorUserId: 'user-1',
      type: 'PUMP_IN',
      gallons: 200,
    })).rejects.toMatchObject(expectCode('TRUCK_CAPACITY_EXCEEDED'));
  });
});

describe('customers, locations, and work orders', () => {
  test('creates customers and customer-owned service locations', async () => {
    db.customer.create.mockResolvedValue({ id: 'customer-1' });
    db.customer.findFirst.mockResolvedValue({ id: 'customer-1' });
    db.serviceLocation.create.mockResolvedValue({ id: 'location-1' });

    await createCustomer({
      tenantId,
      name: 'Acme Foods',
      billingAddress: { city: 'Charlotte' },
    });
    expect(db.customer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Acme Foods', billingAddress: { city: 'Charlotte' } }),
    });

    await createServiceLocation({
      tenantId,
      customerId: 'customer-1',
      addressLine1: '10 Main St',
      city: 'Charlotte',
      state: 'NC',
      postalCode: '28202',
    });
    expect(db.serviceLocation.create).toHaveBeenCalled();
  });

  test('rejects a service location for a missing customer', async () => {
    db.customer.findFirst.mockResolvedValue(null);
    await expect(createServiceLocation({
      tenantId,
      customerId: 'missing',
      addressLine1: '10 Main St',
      city: 'Charlotte',
      state: 'NC',
      postalCode: '28202',
    })).rejects.toMatchObject(expectCode('CUSTOMER_NOT_FOUND'));
  });

  test('creates scheduled work orders with evidence requirements', async () => {
    const scheduledStart = new Date('2026-07-24T12:00:00Z');
    db.serviceLocation.findFirst.mockResolvedValue({ id: 'location-1' });
    db.fieldWorkOrder.create.mockResolvedValue({ id: 'wo-1' });

    await createFieldWorkOrder({
      tenantId,
      customerId: 'customer-1',
      serviceLocationId: 'location-1',
      serviceType: 'SEPTIC_PUMPING',
      priority: 'URGENT',
      estimatedGallons: 900,
      scheduledStart,
      requiredEvidence: ['BEFORE_SERVICE', 'AFTER_SERVICE', 'CONDITION'],
    });

    expect(db.fieldWorkOrder.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'SCHEDULED',
        workOrderNumber: expect.stringMatching(/^FS-\d{8}-[A-F0-9]{8}$/),
        requiredEvidence: ['BEFORE_SERVICE', 'AFTER_SERVICE', 'CONDITION'],
      }),
    }));
  });

  test('rejects mismatched locations and invalid gallon estimates', async () => {
    db.serviceLocation.findFirst.mockResolvedValue(null);
    await expect(createFieldWorkOrder({
      tenantId,
      customerId: 'customer-1',
      serviceLocationId: 'wrong-location',
      serviceType: 'SEPTIC_PUMPING',
      priority: 'ROUTINE',
      estimatedGallons: 500,
    })).rejects.toMatchObject(expectCode('SERVICE_LOCATION_NOT_FOUND'));

    db.serviceLocation.findFirst.mockResolvedValue({ id: 'location-1' });
    await expect(createFieldWorkOrder({
      tenantId,
      customerId: 'customer-1',
      serviceLocationId: 'location-1',
      serviceType: 'SEPTIC_PUMPING',
      priority: 'ROUTINE',
      estimatedGallons: -1,
    })).rejects.toMatchObject(expectCode('INVALID_ESTIMATED_GALLONS'));
  });

  test('assigns a capacity-safe truck and inherited driver', async () => {
    db.fieldWorkOrder.findFirst.mockResolvedValue({ ...baseWorkOrder, scheduledStart: new Date() });
    db.truck.findFirst.mockResolvedValue(baseTruck);
    db.fieldWorkOrder.aggregate.mockResolvedValue({ _sum: { estimatedGallons: 600 } });
    db.fieldWorkOrder.update.mockResolvedValue({ id: 'wo-1', assignedTruckId: 'truck-1' });
    db.truck.update.mockResolvedValue(baseTruck);

    await assignTruckToWorkOrder({ tenantId, workOrderId: 'wo-1', truckId: 'truck-1' });

    expect(db.fieldWorkOrder.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        assignedTruckId: 'truck-1',
        assignedDriverId: 'driver-1',
        status: 'SCHEDULED',
      }),
    }));
    expect(db.truck.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'ASSIGNED' },
    }));
  });

  test('rejects invalid assignments', async () => {
    db.fieldWorkOrder.findFirst.mockResolvedValue(baseWorkOrder);
    db.truck.findFirst.mockResolvedValue({ ...baseTruck, status: 'OUT_OF_SERVICE' });
    await expect(assignTruckToWorkOrder({
      tenantId,
      workOrderId: 'wo-1',
      truckId: 'truck-1',
    })).rejects.toMatchObject(expectCode('TRUCK_OUT_OF_SERVICE'));

    db.truck.findFirst.mockResolvedValue(baseTruck);
    db.fieldWorkOrder.aggregate.mockResolvedValue({ _sum: { estimatedGallons: 1800 } });
    await expect(assignTruckToWorkOrder({
      tenantId,
      workOrderId: 'wo-1',
      truckId: 'truck-1',
    })).rejects.toMatchObject(expectCode('TRUCK_CAPACITY_EXCEEDED'));

    db.fieldWorkOrder.findFirst.mockResolvedValue(null);
    await expect(assignTruckToWorkOrder({
      tenantId,
      workOrderId: 'missing',
      truckId: 'truck-1',
    })).rejects.toMatchObject(expectCode('FIELD_WORK_ORDER_NOT_FOUND'));
  });

  test('registers normalized photo evidence and blocks closed work orders', async () => {
    db.fieldWorkOrder.findFirst.mockResolvedValue({ id: 'wo-1', status: 'IN_PROGRESS' });
    db.workOrderPhoto.create.mockResolvedValue({ id: 'photo-1' });

    await registerWorkOrderPhoto({
      tenantId,
      workOrderId: 'wo-1',
      type: 'AFTER_SERVICE',
      fileName: 'after.jpg',
      mimeType: 'image/jpeg',
      storageKey: 'tenant/wo/after.jpg',
      sha256: 'A'.repeat(64),
      capturedAt: new Date(),
      capturedByUserId: 'tech-1',
    });
    expect(db.workOrderPhoto.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sha256: 'a'.repeat(64) }),
    }));

    db.fieldWorkOrder.findFirst.mockResolvedValue({ id: 'wo-1', status: 'COMPLETED' });
    await expect(registerWorkOrderPhoto({
      tenantId,
      workOrderId: 'wo-1',
      type: 'OTHER',
      fileName: 'late.jpg',
      mimeType: 'image/jpeg',
      storageKey: 'late',
      sha256: 'b'.repeat(64),
      capturedAt: new Date(),
      capturedByUserId: 'tech-1',
    })).rejects.toMatchObject(expectCode('WORK_ORDER_CLOSED'));
  });

  test('completes a documented work order and appends the gallon event', async () => {
    const assignedTruck = { ...baseTruck, onboardGallons: 1200 };
    db.fieldWorkOrder.findFirst.mockResolvedValue({
      ...baseWorkOrder,
      status: 'IN_PROGRESS',
      requiredEvidence: ['BEFORE_SERVICE', 'AFTER_SERVICE'],
      photos: [{ type: 'BEFORE_SERVICE' }, { type: 'AFTER_SERVICE' }],
      assignedTruck,
    });
    db.truck.updateMany.mockResolvedValue({ count: 1 });
    db.fieldWorkOrder.update.mockResolvedValue({ id: 'wo-1', status: 'COMPLETED' });
    db.truckLoadEvent.create.mockResolvedValue({ id: 'load-1' });

    const completed = await completeFieldWorkOrder({
      tenantId,
      workOrderId: 'wo-1',
      actorUserId: 'tech-1',
      actualGallons: 800,
      technicianComments: ' Pumped both compartments and cleaned the area. ',
      customerSignatureName: ' Customer ',
    });

    expect(completed).toEqual({ id: 'wo-1', status: 'COMPLETED' });
    expect(db.fieldWorkOrder.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        actualGallons: 800,
        technicianComments: 'Pumped both compartments and cleaned the area.',
        customerSignatureName: 'Customer',
      }),
    }));
    expect(db.truckLoadEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ deltaGallons: 800, resultingOnboardGallons: 2000 }),
    }));
  });

  test('blocks completion without a truck, evidence, or a stable load projection', async () => {
    db.fieldWorkOrder.findFirst.mockResolvedValue({
      ...baseWorkOrder,
      status: 'IN_PROGRESS',
      photos: [],
      assignedTruck: null,
    });
    await expect(completeFieldWorkOrder({
      tenantId,
      workOrderId: 'wo-1',
      actorUserId: 'tech-1',
      actualGallons: 100,
      technicianComments: 'Done',
    })).rejects.toMatchObject(expectCode('TRUCK_ASSIGNMENT_REQUIRED'));

    db.fieldWorkOrder.findFirst.mockResolvedValue({
      ...baseWorkOrder,
      status: 'IN_PROGRESS',
      requiredEvidence: ['BEFORE_SERVICE', 'AFTER_SERVICE'],
      photos: [{ type: 'BEFORE_SERVICE' }],
      assignedTruck: baseTruck,
    });
    await expect(completeFieldWorkOrder({
      tenantId,
      workOrderId: 'wo-1',
      actorUserId: 'tech-1',
      actualGallons: 100,
      technicianComments: 'Done',
    })).rejects.toMatchObject(expectCode('REQUIRED_EVIDENCE_MISSING'));

    db.fieldWorkOrder.findFirst.mockResolvedValue({
      ...baseWorkOrder,
      status: 'IN_PROGRESS',
      requiredEvidence: ['BEFORE_SERVICE'],
      photos: [{ type: 'BEFORE_SERVICE' }],
      assignedTruck: baseTruck,
    });
    db.truck.updateMany.mockResolvedValue({ count: 0 });
    await expect(completeFieldWorkOrder({
      tenantId,
      workOrderId: 'wo-1',
      actorUserId: 'tech-1',
      actualGallons: 100,
      technicianComments: 'Done',
    })).rejects.toMatchObject(expectCode('TRUCK_LOAD_CONFLICT'));
  });
});

describe('Call Guard intake and dispatch queries', () => {
  test('deduplicates Call Guard retries and creates new intake records', async () => {
    db.callIntake.findUnique.mockResolvedValue({ id: 'call-existing' });
    await expect(ingestCallGuardCall({
      tenantId,
      externalCallId: 'call-1',
      callerPhone: '555-0100',
      summary: 'Needs pumping',
    })).resolves.toEqual({ intake: { id: 'call-existing' }, duplicate: true });

    db.callIntake.findUnique.mockResolvedValue(null);
    db.callIntake.create.mockResolvedValue({ id: 'call-new' });
    await expect(ingestCallGuardCall({
      tenantId,
      externalCallId: 'call-2',
      callerPhone: '555-0101',
      summary: 'Grease trap overflow',
      requestedService: 'GREASE_TRAP',
      rawPayload: { source: 'callguard' },
    })).resolves.toEqual({ intake: { id: 'call-new' }, duplicate: false });
    expect(db.callIntake.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ priority: 'ROUTINE' }),
    }));
  });

  test('converts an intake into a scheduled work order', async () => {
    db.callIntake.findFirst.mockResolvedValue({
      id: 'call-1',
      status: 'RECEIVED',
      workOrderId: null,
      requestedService: 'SEPTIC_PUMPING',
      estimatedGallons: 700,
      priority: 'URGENT',
      summary: 'Customer reports backup',
    });
    db.serviceLocation.findFirst.mockResolvedValue({ id: 'location-1' });
    db.fieldWorkOrder.create.mockResolvedValue({ id: 'wo-1' });
    db.callIntake.update.mockResolvedValue({ id: 'call-1', status: 'CONVERTED' });

    const scheduledStart = new Date('2026-07-24T14:00:00Z');
    await convertCallIntake({
      tenantId,
      intakeId: 'call-1',
      customerId: 'customer-1',
      serviceLocationId: 'location-1',
      scheduledStart,
    });

    expect(db.fieldWorkOrder.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        serviceType: 'SEPTIC_PUMPING',
        estimatedGallons: 700,
        priority: 'URGENT',
        status: 'SCHEDULED',
      }),
    }));
    expect(db.callIntake.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'CONVERTED', workOrderId: 'wo-1' }),
    }));
  });

  test('rejects missing, duplicate, and invalid intake conversions', async () => {
    db.callIntake.findFirst.mockResolvedValue(null);
    await expect(convertCallIntake({
      tenantId,
      intakeId: 'missing',
      customerId: 'customer-1',
      serviceLocationId: 'location-1',
    })).rejects.toMatchObject(expectCode('CALL_INTAKE_NOT_FOUND'));

    db.callIntake.findFirst.mockResolvedValue({ id: 'call-1', status: 'CONVERTED', workOrderId: 'wo-1' });
    await expect(convertCallIntake({
      tenantId,
      intakeId: 'call-1',
      customerId: 'customer-1',
      serviceLocationId: 'location-1',
    })).rejects.toMatchObject(expectCode('CALL_INTAKE_ALREADY_CONVERTED'));

    db.callIntake.findFirst.mockResolvedValue({
      id: 'call-2', status: 'RECEIVED', workOrderId: null, priority: 'ROUTINE', estimatedGallons: null,
    });
    db.serviceLocation.findFirst.mockResolvedValue(null);
    await expect(convertCallIntake({
      tenantId,
      intakeId: 'call-2',
      customerId: 'customer-1',
      serviceLocationId: 'missing',
    })).rejects.toMatchObject(expectCode('SERVICE_LOCATION_NOT_FOUND'));
  });

  test('builds the dispatch board with reserved and dispatchable gallons', async () => {
    db.truck.findMany.mockResolvedValue([baseTruck]);
    db.fieldWorkOrder.findMany.mockResolvedValue([{ id: 'wo-1' }]);
    db.callIntake.findMany.mockResolvedValue([{ id: 'call-1' }]);
    db.fieldWorkOrder.groupBy.mockResolvedValue([
      { assignedTruckId: 'truck-1', _sum: { estimatedGallons: 600 } },
      { assignedTruckId: null, _sum: { estimatedGallons: 99 } },
    ]);

    const board = await getDispatchBoard(tenantId);
    expect(board.trucks[0]).toEqual(expect.objectContaining({
      availableGallons: 2000,
      reservedGallons: 600,
      dispatchableGallons: 1400,
    }));
    expect(board.workOrders).toEqual([{ id: 'wo-1' }]);
    expect(board.callIntakes).toEqual([{ id: 'call-1' }]);
  });

  test('searches and retrieves customers and work orders', async () => {
    db.customer.findMany.mockResolvedValue([{ id: 'customer-1' }]);
    await searchCustomers(tenantId, 'Acme');
    expect(db.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.any(Array) }),
    }));

    db.customer.findFirst.mockResolvedValue({ id: 'customer-1' });
    await expect(getCustomer(tenantId, 'customer-1')).resolves.toEqual({ id: 'customer-1' });
    db.customer.findFirst.mockResolvedValue(null);
    await expect(getCustomer(tenantId, 'missing')).rejects.toMatchObject(expectCode('CUSTOMER_NOT_FOUND'));

    db.fieldWorkOrder.findMany.mockResolvedValue([{ id: 'wo-1' }]);
    await listFieldWorkOrders({
      tenantId,
      status: 'SCHEDULED',
      truckId: 'truck-1',
      driverId: 'driver-1',
    });
    expect(db.fieldWorkOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId,
        status: 'SCHEDULED',
        assignedTruckId: 'truck-1',
        assignedDriverId: 'driver-1',
      }),
    }));
  });
});

describe('route planning and publication', () => {
  const routeInput = {
    tenantId,
    name: 'North Route',
    serviceDate: new Date('2026-07-24T00:00:00Z'),
    truckId: 'truck-1',
    driverId: 'driver-1',
    stops: [
      { workOrderId: 'wo-2', sequence: 2 },
      { workOrderId: 'wo-1', sequence: 1 },
    ],
  };

  test('validates route stop presence and sequence', async () => {
    await expect(createRoutePlan({ ...routeInput, stops: [] })).rejects.toMatchObject(expectCode('ROUTE_STOPS_REQUIRED'));
    await expect(createRoutePlan({
      ...routeInput,
      stops: [
        { workOrderId: 'wo-1', sequence: 1 },
        { workOrderId: 'wo-2', sequence: 1 },
      ],
    })).rejects.toMatchObject(expectCode('INVALID_ROUTE_SEQUENCE'));
  });

  test('creates a capacity-safe ordered route and assigns its work', async () => {
    db.truck.findFirst.mockResolvedValue(baseTruck);
    db.user.findFirst.mockResolvedValue({ id: 'driver-1' });
    db.fieldWorkOrder.findMany.mockResolvedValue([
      { id: 'wo-1', estimatedGallons: 600, routeStop: null },
      { id: 'wo-2', estimatedGallons: 500, routeStop: null },
    ]);
    db.routePlan.create.mockResolvedValue({ id: 'route-1' });
    db.fieldWorkOrder.updateMany.mockResolvedValue({ count: 2 });
    db.truck.update.mockResolvedValue(baseTruck);

    await expect(createRoutePlan(routeInput)).resolves.toEqual({ id: 'route-1' });
    const createCall = db.routePlan.create.mock.calls[0][0];
    expect(createCall.data.stops.create.map((stop: any) => stop.sequence)).toEqual([1, 2]);
    expect(db.fieldWorkOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ assignedTruckId: 'truck-1', assignedDriverId: 'driver-1' }),
    }));
  });

  test('rejects invalid route resources and capacity', async () => {
    db.truck.findFirst.mockResolvedValue(null);
    db.user.findFirst.mockResolvedValue({ id: 'driver-1' });
    db.fieldWorkOrder.findMany.mockResolvedValue([]);
    await expect(createRoutePlan(routeInput)).rejects.toMatchObject(expectCode('TRUCK_NOT_FOUND'));

    db.truck.findFirst.mockResolvedValue(baseTruck);
    db.user.findFirst.mockResolvedValue(null);
    await expect(createRoutePlan(routeInput)).rejects.toMatchObject(expectCode('DRIVER_NOT_FOUND'));

    db.user.findFirst.mockResolvedValue({ id: 'driver-1' });
    db.fieldWorkOrder.findMany.mockResolvedValue([
      { id: 'wo-1', estimatedGallons: 1200, routeStop: null },
      { id: 'wo-2', estimatedGallons: 1000, routeStop: null },
    ]);
    await expect(createRoutePlan(routeInput)).rejects.toMatchObject(expectCode('TRUCK_CAPACITY_EXCEEDED'));

    db.fieldWorkOrder.findMany.mockResolvedValue([
      { id: 'wo-1', estimatedGallons: 100, routeStop: { id: 'stop-existing' } },
      { id: 'wo-2', estimatedGallons: 100, routeStop: null },
    ]);
    await expect(createRoutePlan(routeInput)).rejects.toMatchObject(expectCode('WORK_ORDER_ALREADY_ROUTED'));
  });

  test('lists routes and publishes a draft route', async () => {
    db.routePlan.findMany.mockResolvedValue([{ id: 'route-1' }]);
    await expect(listRoutePlans({
      tenantId,
      serviceDate: routeInput.serviceDate,
      status: 'DRAFT',
    })).resolves.toEqual([{ id: 'route-1' }]);

    db.routePlan.findFirst.mockResolvedValue({
      id: 'route-1',
      status: 'DRAFT',
      stops: [{ fieldWorkOrderId: 'wo-1' }, { fieldWorkOrderId: 'wo-2' }],
    });
    db.routePlan.update.mockResolvedValue({ id: 'route-1', status: 'PUBLISHED' });
    db.fieldWorkOrder.updateMany.mockResolvedValue({ count: 2 });

    await expect(publishRoutePlan(tenantId, 'route-1')).resolves.toEqual({
      id: 'route-1',
      status: 'PUBLISHED',
    });
    expect(db.fieldWorkOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'DISPATCHED' }),
    }));
  });

  test('rejects missing and non-draft route publication', async () => {
    db.routePlan.findFirst.mockResolvedValue(null);
    await expect(publishRoutePlan(tenantId, 'missing')).rejects.toMatchObject(expectCode('ROUTE_PLAN_NOT_FOUND'));

    db.routePlan.findFirst.mockResolvedValue({ id: 'route-1', status: 'PUBLISHED', stops: [] });
    await expect(publishRoutePlan(tenantId, 'route-1')).rejects.toMatchObject(expectCode('ROUTE_NOT_DRAFT'));
  });
});
